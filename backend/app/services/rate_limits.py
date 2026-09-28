"""Atomic, shared fixed-window quotas. No user/IP data is stored in plaintext."""
from contextlib import contextmanager
import hashlib

from fastapi import HTTPException
from sqlalchemy import text

from app.database import engine


def consume(scope: str, key: str, limit: int, seconds: int = 60) -> None:
    bucket = f"{scope}:{hashlib.sha256(key.encode()).hexdigest()}"
    with engine.begin() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '5s'"))
        connection.execute(text("DELETE FROM security_rate_limits WHERE expires_at <= CURRENT_TIMESTAMP"))
        count = connection.execute(text("""
            INSERT INTO security_rate_limits (bucket, attempts, expires_at)
            VALUES (:bucket, 1, CURRENT_TIMESTAMP + :seconds * INTERVAL '1 second')
            ON CONFLICT (bucket) DO UPDATE
            SET attempts = security_rate_limits.attempts + 1
            RETURNING attempts
        """), {"bucket": bucket, "seconds": seconds}).scalar_one()
    if count > limit:
        raise HTTPException(429, "Demasiadas peticiones. Inténtalo más tarde.", headers={"Retry-After": str(seconds)})


@contextmanager
def transcription_slot(user_id: str):
    """One job per user and at most two jobs across all application replicas."""
    keys = []
    with engine.connect() as connection:
        try:
            user_key = int.from_bytes(hashlib.sha256(f"voice:{user_id}".encode()).digest()[:8], "big", signed=True)
            for key in (user_key,):
                if not connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": key}).scalar_one():
                    raise HTTPException(429, "Ya hay una transcripción en curso", headers={"Retry-After": "10"})
                keys.append(key)
            for slot in (834092560, 834092561):
                if connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": slot}).scalar_one():
                    keys.append(slot)
                    break
            else:
                raise HTTPException(429, "Servicio de voz ocupado", headers={"Retry-After": "10"})
            connection.commit()
            yield
        finally:
            for key in reversed(keys):
                connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
            connection.commit()
