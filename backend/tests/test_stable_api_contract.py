"""Stable API error identifiers, risk-factor codes and HEIF safety checks."""

from __future__ import annotations

import asyncio
import io
import sys

import pytest
from fastapi import HTTPException, status

from app.routers import auth as auth_router
from app.security import StableHTTPException, stable_http_exception_handler
from app.services import attachments_service


def test_auth_errors_expose_stable_code_header(client):
    missing = client.get("/api/v1/auth/me")
    assert missing.status_code == status.HTTP_403_FORBIDDEN
    assert missing.headers["X-Error-Code"] == "AUTH_MISSING_CREDENTIALS"

    invalid = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"})
    assert invalid.status_code == status.HTTP_401_UNAUTHORIZED
    assert invalid.headers["X-Error-Code"] == "AUTH_INVALID_TOKEN"


def test_permission_error_exposes_stable_code_header(client, role_headers):
    response = client.post(
        "/api/v1/turnos",
        headers=role_headers("stable-contract-vet", "veterinario"),
        json={"fecha": "2026-01-01", "tipo_turno": "manana", "hora_inicio": "06:00", "hora_fin": "14:00"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.headers["X-Error-Code"] == "AUTH_INSUFFICIENT_PERMISSIONS"


def test_login_rate_limit_exposes_stable_code_header(client, test_user, monkeypatch):
    monkeypatch.setattr(auth_router, "_LOGIN_MAX_ATTEMPTS", 1)
    auth_router._LOGIN_ATTEMPTS.clear()
    body = {"username": test_user.username, "password": "badpassword"}
    assert client.post("/api/v1/auth/login", json=body).status_code == 401
    response = client.post("/api/v1/auth/login", json=body)
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.headers["X-Error-Code"] == "AUTH_LOGIN_RATE_LIMITED"


def test_stable_handler_keeps_human_detail_and_adds_body_code():
    response = asyncio.run(
        stable_http_exception_handler(
            object(),
            StableHTTPException(401, "Mensaje para personas", "AUTH_EXAMPLE"),
        )
    )
    assert response.status_code == 401
    assert response.body == b'{"detail":"Mensaje para personas","code":"AUTH_EXAMPLE"}'

    ordinary = asyncio.run(stable_http_exception_handler(object(), HTTPException(404, "No encontrado")))
    assert ordinary.body == b'{"detail":"No encontrado"}'


def test_heif_without_decoder_is_rejected_with_stable_code(monkeypatch):
    # ISO-BMFF HEIC marker, enough to exercise the unavailable-decoder path
    # before Pillow is asked to decode a deliberately incomplete image.
    monkeypatch.setitem(sys.modules, "pillow_heif", None)
    with pytest.raises(attachments_service.AttachmentValidationError) as error:
        attachments_service.validate_and_normalize_image(b"\x00\x00\x00\x18ftypheic")
    assert error.value.code == "ATTACHMENT_HEIF_DECODER_UNAVAILABLE"


def test_regular_jpeg_still_normalizes_without_heif_decoder():
    from PIL import Image

    raw = io.BytesIO()
    Image.new("RGB", (2, 3), "white").save(raw, format="JPEG")
    clean, mime, extension, width, height = attachments_service.validate_and_normalize_image(raw.getvalue())
    assert clean
    assert (mime, extension, width, height) == ("image/jpeg", "jpg", 2, 3)
