from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta
import io
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app import main
from app.config import settings
from app.database import engine
from app.models.tools4milk import LecturaMeteo
from app.security import SESSION_COOKIE
from app.services import attachments_service, provisioning, rate_limits, storage_service
from app.services.uploads import read_upload
from app.time_utils import utc_now

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture(autouse=True)
def clear_limits():
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM security_rate_limits"))


def login_session(client, test_user):
    response = client.post("/api/v1/auth/session", headers=ORIGIN, json={"username": test_user.username, "password": "testpass123"})
    assert response.status_code == 200, response.text
    return response


def test_session_cookie_csrf_and_logout_revocation(client, test_user):
    login = login_session(client, test_user)
    assert "access_token" not in login.text
    assert "HttpOnly" in login.headers["set-cookie"]
    assert "SameSite=lax" in login.headers["set-cookie"]
    token = client.cookies.get(SESSION_COOKIE)
    csrf = login.json()["csrf_token"]
    assert client.get("/api/v1/auth/session").json()["user"]["username"] == test_user.username
    payload = {"turno_noche_habilitado": False}
    assert client.put("/api/v1/farm-settings", json=payload, headers=ORIGIN).status_code == 403
    assert client.put("/api/v1/farm-settings", json=payload, headers={"Origin": "https://attacker.invalid", "X-CSRF-Token": csrf}).status_code == 403
    headers = {**ORIGIN, "X-CSRF-Token": csrf}
    assert client.put("/api/v1/farm-settings", json=payload, headers=headers).status_code == 200
    assert client.post("/api/v1/auth/refresh", headers=headers).status_code == 403
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.delete("/api/v1/auth/session", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/me", headers={"Cookie": f"{SESSION_COOKIE}={token}"}).status_code == 401


def test_login_requires_trusted_origin_and_cookie_secure_in_production(client, test_user, monkeypatch):
    body = {"username": test_user.username, "password": "testpass123"}
    assert client.post("/api/v1/auth/session", json=body).status_code == 403
    assert client.post("/api/v1/auth/session", json=body, headers={"Origin": "https://evil.invalid"}).status_code == 403
    monkeypatch.setattr(settings, "environment", "production")
    login = client.post("/api/v1/auth/session", json=body, headers=ORIGIN)
    assert "Secure" in login.headers["set-cookie"]


def test_rate_limit_is_atomic_across_connections_and_expires():
    key = str(uuid4())
    def attempt(_):
        try:
            rate_limits.consume("concurrency-test", key, 3)
            return True
        except HTTPException as exc:
            assert exc.status_code == 429
            return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(12))) == 3
    with engine.begin() as connection:
        connection.execute(text("UPDATE security_rate_limits SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'"))
    rate_limits.consume("concurrency-test", key, 3)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM security_rate_limits")).scalar() == 1


def test_login_ip_quota_cannot_be_bypassed_by_rotating_names(client, monkeypatch):
    from app.routers import auth
    monkeypatch.setattr(auth, "_LOGIN_MAX_ATTEMPTS", 1)
    for index in range(3):
        assert client.post("/api/v1/auth/login", json={"username": f"absent-{index}", "password": "badpassword"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "another", "password": "badpassword"}).status_code == 429


def test_transcription_slots_are_released_after_failure():
    with rate_limits.transcription_slot("one"):
        with pytest.raises(HTTPException):
            with rate_limits.transcription_slot("one"):
                pass
        with rate_limits.transcription_slot("two"):
            with pytest.raises(HTTPException):
                with rate_limits.transcription_slot("three"):
                    pass
    with rate_limits.transcription_slot("three"):
        pass


@pytest.mark.asyncio
async def test_upload_reads_only_limit_plus_one():
    file = UploadFile(io.BytesIO(b"a" * 100))
    with pytest.raises(HTTPException) as error:
        await read_upload(file, 10)
    assert error.value.status_code == 413
    assert file.file.tell() == 11


def test_request_limit_before_parsing(client):
    response = client.post("/api/v1/transcripciones", content=b"", headers={"Content-Length": str(27 * 1024 * 1024)})
    assert response.status_code == 413


def test_chunked_body_limit_without_content_length(client):
    response = client.post("/api/v1/auth/login", content=iter([b"x" * (1024 * 1024), b"y"]), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_images_reject_pixel_bombs_and_decode_errors(monkeypatch):
    data = image_bytes()
    with monkeypatch.context() as context:
        context.setattr(Image, "MAX_IMAGE_PIXELS", 2)
        with pytest.raises(attachments_service.AttachmentValidationError):
            attachments_service.validate_and_normalize_image(data)
    def broken_load(*args, **kwargs):
        raise OSError("corrupt decode")
    monkeypatch.setattr(Image.Image, "load", broken_load)
    with pytest.raises(attachments_service.AttachmentValidationError):
        attachments_service.validate_and_normalize_image(data)


def test_veterinarian_can_upload_incident_photo(client, role_headers, monkeypatch, tmp_path):
    headers = role_headers("photo-vet", "veterinario")
    incident = client.post("/api/v1/incidents", headers=headers, json={"tipo": "sanidad_animal", "descripcion": "Foto clínica", "prioridad": "media"})
    assert incident.status_code == 201
    monkeypatch.setattr(storage_service, "_instance", storage_service.LocalStorageService(str(tmp_path)))
    response = client.post(f"/api/v1/incidents/{incident.json()['id']}/adjuntos", headers=headers, files={"file": ("photo.png", image_bytes(), "image/png")})
    assert response.status_code == 201, response.text


def test_health_returns_503_when_database_is_down(client, monkeypatch):
    @contextmanager
    def unavailable():
        raise OperationalError("SELECT 1", {}, Exception("unavailable"))
        yield
    monkeypatch.setattr(main.engine, "connect", unavailable)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "error"
    assert "unavailable" not in response.text


def test_demo_provisioning_is_disabled_in_production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    with pytest.raises(RuntimeError, match="disabled"):
        provisioning.seed_demo_user()


def test_weather_distinguishes_forecast_source_and_observation(client, db, auth_headers):
    now = utc_now()
    db.add_all([
        LecturaMeteo(ts=now - timedelta(hours=1), estacion_id="audit-observation", temperatura_c=12, fuente="sensor", tipo_dato="observation"),
        LecturaMeteo(ts=now + timedelta(days=1), estacion_id="audit-forecast", temperatura_c=30, fuente="generated", tipo_dato="forecast"),
        LecturaMeteo(ts=now - timedelta(days=10), estacion_id="audit-old", temperatura_c=20, fuente="aemet", tipo_dato="forecast"),
    ])
    db.commit()
    current = client.get("/api/v1/weather/current", headers=auth_headers).json()
    assert current["fuente"] == "sensor"
    assert current["temperatura"] == 12
    forecast = client.get("/api/v1/weather/forecast", headers=auth_headers).json()["dias"]
    assert len(forecast) == 1
    assert forecast[0]["fuente"] == "generated"
    assert forecast[0]["tipo_dato"] == "forecast"
