from uuid import uuid4
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Usuario
from app.schemas.api import AuthResponse, BrowserSessionResponse, LoginRequest, TokenResponse, UserResponse
from app.security import (SESSION_COOKIE, StableHTTPException, create_access_token, get_current_user, verify_password, csrf_token, require_browser_origin, hash_password)
from app.services import rate_limits
from app.time_utils import utc_now


router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

_LOGIN_MAX_ATTEMPTS = 10
_DUMMY_PASSWORD_HASH = hash_password("nonexistent-account-placeholder")


def authenticate(payload: LoginRequest, request: Request, db: Session) -> Usuario:
    client_ip = request.client.host if request.client else "unknown"
    try:
        rate_limits.consume("login-ip", client_ip, _LOGIN_MAX_ATTEMPTS * 3)
        rate_limits.consume("login-account", payload.username.casefold(), _LOGIN_MAX_ATTEMPTS)
    except Exception as exc:
        from fastapi import HTTPException
        if isinstance(exc, HTTPException) and exc.status_code == 429:
            raise StableHTTPException(429, "Demasiados intentos de inicio de sesión", "AUTH_LOGIN_RATE_LIMITED") from exc
        raise
    user = db.scalar(select(Usuario).where(Usuario.username == payload.username))
    valid = verify_password(payload.password, user.hashed_password if user else _DUMMY_PASSWORD_HASH)
    if not user or not valid:
        raise StableHTTPException(401, "Nombre de usuario o contraseña incorrectos", "AUTH_INVALID_CREDENTIALS")
    if not user.activo:
        raise StableHTTPException(401, "Usuario inactivo", "AUTH_USER_INACTIVE")
    return user


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
    user = authenticate(payload, request, db)

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
def refresh(request: Request, current_user: Annotated[Usuario, Depends(get_current_user)]) -> TokenResponse:
    if getattr(request.state, "session_id", None):
        raise StableHTTPException(403, "Refresh requiere token Bearer", "AUTH_INSUFFICIENT_PERMISSIONS")
    expires = settings.access_token_expire_minutes * 60
    token = create_access_token(
        current_user.username,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(access_token=token, expires_in=expires)


@router.post("/session", response_model=BrowserSessionResponse)
def browser_login(payload: LoginRequest, request: Request, response: Response, db: Annotated[Session, Depends(get_db)]):
    require_browser_origin(request)
    user = authenticate(payload, request, db)
    session_id = str(uuid4())
    expires = utc_now() + timedelta(minutes=settings.access_token_expire_minutes)
    db.execute(text("DELETE FROM browser_sessions WHERE expires_at <= CURRENT_TIMESTAMP"))
    # Re-login replaces the previous cookie session when it is valid.
    previous = request.cookies.get(SESSION_COOKIE)
    if previous:
        import jwt
        try:
            claims = jwt.decode(previous, settings.secret_key, algorithms=[settings.algorithm])
            db.execute(text("DELETE FROM browser_sessions WHERE id=:id AND usuario_id=:user"), {"id": claims.get("jti"), "user": user.id})
        except jwt.InvalidTokenError:
            pass
    db.execute(text("INSERT INTO browser_sessions (id, usuario_id, expires_at) VALUES (:id, :user, :expires)"), {"id": session_id, "user": user.id, "expires": expires})
    db.commit()
    token = create_access_token(user.username, session_id=session_id)
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.access_token_expire_minutes * 60, httponly=True, secure=settings.environment == "production", samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return BrowserSessionResponse(user=user_payload(user), csrf_token=csrf_token(session_id))


@router.get("/session", response_model=BrowserSessionResponse)
def browser_session(request: Request, response: Response, user: Annotated[Usuario, Depends(get_current_user)]):
    session_id = getattr(request.state, "session_id", None)
    if not session_id:
        raise StableHTTPException(401, "No hay sesión de navegador", "AUTH_INVALID_TOKEN")
    response.headers["Cache-Control"] = "no-store"
    return BrowserSessionResponse(user=user_payload(user), csrf_token=csrf_token(session_id))


@router.delete("/session", status_code=204)
def browser_logout(request: Request, response: Response, db: Annotated[Session, Depends(get_db)], user: Annotated[Usuario, Depends(get_current_user)]):
    session_id = getattr(request.state, "session_id", None)
    if session_id:
        db.execute(text("DELETE FROM browser_sessions WHERE id=:id AND usuario_id=:user"), {"id": session_id, "user": user.id})
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", secure=settings.environment == "production", httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
