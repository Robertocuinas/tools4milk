import time
from collections import defaultdict
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Usuario
from app.schemas.api import AuthResponse, LoginRequest, TokenResponse, UserResponse
from app.security import create_access_token, get_current_user, verify_password


router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

# Auditoria post-implementacion (hallazgo 2.4): no habia ningun limite de
# intentos en /login, asi que fuerza bruta contra un usuario conocido (p.ej.
# los usuarios demo) era trivial. Limitador en memoria por proceso: es una
# mitigacion real para un solo contenedor, pero NO es suficiente en un
# despliegue con varias replicas en paralelo (cada una lleva su propio
# contador) — ahi hace falta un backend compartido (Redis) para contar
# intentos entre instancias. Documentado, no implementado, por alcance.
_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_LOGIN_WINDOW_SECONDS = 60.0
_LOGIN_MAX_ATTEMPTS = 10


def _enforce_login_rate_limit(key: str) -> None:
    now = time.monotonic()
    attempts = _LOGIN_ATTEMPTS[key]
    attempts[:] = [ts for ts in attempts if now - ts < _LOGIN_WINDOW_SECONDS]
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo.",
        )
    attempts.append(now)


def user_payload(user: Usuario) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        activo=user.activo,
        role=user.role,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]) -> AuthResponse:
    client_ip = request.client.host if request.client else "unknown"
    _enforce_login_rate_limit(f"{client_ip}:{payload.username}")

    user = db.execute(select(Usuario).where(Usuario.username == payload.username)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos",
        )
    if not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    expires = settings.access_token_expire_minutes * 60
    token = create_access_token(
        user.username,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return AuthResponse(
        user=user_payload(user),
        token=TokenResponse(access_token=token, expires_in=expires),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[Usuario, Depends(get_current_user)]) -> UserResponse:
    return user_payload(current_user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(current_user: Annotated[Usuario, Depends(get_current_user)]) -> TokenResponse:
    expires = settings.access_token_expire_minutes * 60
    token = create_access_token(
        current_user.username,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(access_token=token, expires_in=expires)
