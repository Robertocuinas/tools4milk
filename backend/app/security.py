import logging
import hashlib
import hmac
import json
from datetime import timedelta
from collections.abc import Callable
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import bcrypt
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.usuario import Usuario
from app.time_utils import utc_now


bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger("tools4milk.security")
SESSION_COOKIE = "t4m_session"


class StableHTTPException(HTTPException):
    """HTTP error with a stable machine-readable identifier."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail, headers={"X-Error-Code": code})
        self.code = code


async def stable_http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Keep ``detail`` human-readable and add ``code`` for stable clients.

    This must be registered for ``HTTPException`` by the application factory.
    """
    if isinstance(exc, StableHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}, headers=exc.headers)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    except ValueError:
        return False


def create_access_token(subject: str, expires_delta: timedelta | None = None, *, session_id: str | None = None) -> str:
    expires = utc_now() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    return jwt.encode(
        {"sub": subject, "exp": expires, "iat": utc_now(), "jti": session_id or str(uuid4()), "kind": "session" if session_id else "bearer"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def csrf_token(session_id: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"csrf:{session_id}".encode(), hashlib.sha256).hexdigest()


def allowed_origins() -> list[str]:
    origins = settings.cors_origins
    if isinstance(origins, list):
        return origins
    try:
        parsed = json.loads(origins)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


def require_browser_origin(request: Request) -> None:
    if request.headers.get("origin") not in allowed_origins():
        raise StableHTTPException(403, "Origen no autorizado", "AUTH_CSRF_INVALID")


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> Usuario:
    token = credentials.credentials if credentials else request.cookies.get(SESSION_COOKIE)
    if not token:
        raise StableHTTPException(status.HTTP_403_FORBIDDEN, "No se proporcionaron credenciales de autenticacion", "AUTH_MISSING_CREDENTIALS")
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"require": ["sub", "exp", "iat", "jti"]},
        )
        username = payload.get("sub")
        if not username:
            raise ValueError("missing subject")
        if credentials is not None and payload.get("kind") == "session":
            raise ValueError("session token cannot be used as bearer")
        if credentials is None:
            if payload.get("kind") != "session":
                raise ValueError("not a browser session")
            active = db.execute(text("SELECT usuario_id FROM browser_sessions WHERE id=:id AND expires_at > CURRENT_TIMESTAMP"), {"id": payload["jti"]}).scalar_one_or_none()
            if active is None:
                raise ValueError("session revoked or expired")
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                require_browser_origin(request)
                if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), csrf_token(payload["jti"])):
                    raise StableHTTPException(403, "Token CSRF inválido", "AUTH_CSRF_INVALID")
            request.state.session_id = payload["jti"]
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise StableHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido",
            code="AUTH_INVALID_TOKEN",
        ) from exc

    user = db.execute(select(Usuario).where(Usuario.username == username)).scalar_one_or_none()
    if user is None:
        raise StableHTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado", "AUTH_USER_NOT_FOUND")
    if credentials is None and user.id != active:
        raise StableHTTPException(401, "Sesión inválida", "AUTH_INVALID_TOKEN")
    if not user.activo:
        raise StableHTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo", "AUTH_USER_INACTIVE")
    return user


def require_roles(*allowed_roles: str) -> Callable[[Usuario], Usuario]:
    def dependency(current_user: Annotated[Usuario, Depends(get_current_user)]) -> Usuario:
        if current_user.role not in allowed_roles:
            # Auditoria post-implementacion (hallazgo 2.9): antes un 403 no
            # dejaba ningun rastro — ni de quien lo intento ni de que rol le
            # faltaba. No es tan completo como escribir en audit_log (fuera
            # de alcance aqui: audit_log solo registra cambios de datos, no
            # eventos de autorizacion), pero al menos queda en los logs del
            # proceso.
            logger.warning(
                "Acceso denegado: usuario=%s rol=%s roles_requeridos=%s",
                current_user.username, current_user.role, allowed_roles,
            )
            raise StableHTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta accion",
                code="AUTH_INSUFFICIENT_PERMISSIONS",
            )
        return current_user

    return dependency
