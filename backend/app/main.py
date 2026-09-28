import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError

from app.config import settings
from app.database import engine
from app.openapi import install_openapi
from app.routers import (
    admin,
    alerts,
    animals,
    attachments,
    audit,
    auth,
    dashboard,
    employees,
    farm_settings,
    handovers,
    health,
    incidents,
    lactations,
    machinery,
    orders,
    predictions,
    quality_tank,
    shifts,
    tasks,
    transcription,
    treatments,
    weather,
    zones,
)
from app.security import stable_http_exception_handler
from app.request_limits import RequestSizeLimitMiddleware

logger = logging.getLogger("tools4milk.startup")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("[startup] validating config...")
    validate_production_config()

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1 FROM usuarios LIMIT 1"))
            required = "0018_security_and_weather_source.sql"
            if not connection.execute(text("SELECT 1 FROM schema_migrations WHERE version=:version"), {"version": required}).scalar():
                raise RuntimeError("Pending migrations: run scripts/apply_migrations.py")
    except SQLAlchemyError as exc:
        raise RuntimeError("Database unavailable or schema missing; apply migrations before startup") from exc

    logger.info("[startup] startup complete.")
    yield


def validate_production_config() -> None:
    if settings.environment.lower() != "production":
        return

    if settings.secret_key == "tools4milk-dev-secret-change-me" or len(settings.secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be changed before running in production")

    origins = parse_cors_origins()
    if not origins or any(not origin.startswith("https://") or "*" in origin for origin in origins):
        raise RuntimeError("CORS_ORIGINS must be explicit before running in production")

    # Auditoria post-implementacion (hallazgo 2.2/5.4): estas comprobaciones
    # faltaban y permitian arrancar "en produccion" sobre sqlite efimero, con
    # la contrasena demo de siempre, o perdiendo adjuntos silenciosamente en
    # Azure por quedarse en almacenamiento local.
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("DATABASE_URL must point to a real database (not sqlite) in production")

    if settings.debug:
        raise RuntimeError("DEBUG must be false in production")

    if settings.storage_backend == "local":
        raise RuntimeError(
            "STORAGE_BACKEND=local loses uploaded files on every redeploy/restart on Azure "
            "(ephemeral filesystem). Set STORAGE_BACKEND=azure_blob in production."
        )
    if settings.storage_backend == "azure_blob" and not settings.azure_storage_connection_string:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING must be set when STORAGE_BACKEND=azure_blob")


def parse_cors_origins() -> list[str]:
    origins = settings.cors_origins
    if isinstance(origins, list):
        return origins
    try:
        parsed = json.loads(origins)
        if isinstance(parsed, list) and all(isinstance(item, str) for item in parsed):
            return parsed
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in origins.split(",") if item.strip()]


app = FastAPI(
    title="Tools4Milk API",
    version="1.0.0",
    description=(
        "API para la plataforma Tools4Milk: TV por zona, tablet operativa, "
        "LeanFarming, alertas, predicciones, calidad de leche y meteorologia."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Auth", "description": "Autenticacion JWT y sesion de usuario."},
        {"name": "Frontend Core", "description": "Endpoints usados por TV y tablet."},
        {"name": "Weather", "description": "Datos meteorologicos y sincronizacion AEMET."},
    ],
    lifespan=lifespan,
)

# Los errores de dominio conservan el mensaje para personas (`detail`) y
# exponen un identificador estable (`code`) para que los clientes no tengan
# que depender del idioma del backend.
app.add_exception_handler(HTTPException, stable_http_exception_handler)
app.add_middleware(RequestSizeLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DataError)
@app.exception_handler(IntegrityError)
async def database_input_error_handler(_request: Request, exc: DataError | IntegrityError) -> JSONResponse:
    # Varios routers de este adaptador aceptan `payload: dict[str, Any]` sin
    # validacion Pydantic (T6-T9 los tratan como deuda tecnica heredada, no
    # los reescriben). Sin este handler, un valor invalido para un ENUM
    # nativo de Postgres (p.ej. un "tipo" o "rol" mal escrito) llegaba a la
    # BD y devolvia un 500 con el SQL y el esquema interno en el cuerpo de
    # la respuesta. Detectado al mover los tests a Postgres real (T15): con
    # sqlite:///:memory: estas columnas eran VARCHAR sin restriccion y el
    # dato invalido se guardaba sin más, ocultando el problema.
    return JSONResponse(status_code=422, content={"detail": "Datos invalidos para la operacion solicitada"})


@app.get("/", tags=["Health"])
def root() -> dict[str, str]:
    return {"status": "ok", "service": "Tools4Milk API", "docs": "/docs"}


@app.get("/health", tags=["Frontend Core"])
def health_check() -> JSONResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "error", "database": "error", "environment": settings.environment})
    return JSONResponse(content={"status": "ok", "database": "ok", "environment": settings.environment})


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
# Routers de dominio (antes el monolítico frontend_core.py), todos bajo /api/v1.
app.include_router(dashboard.router)
app.include_router(animals.router)
app.include_router(zones.router)
app.include_router(tasks.router)
app.include_router(lactations.router)
app.include_router(quality_tank.router)
app.include_router(alerts.router)
app.include_router(predictions.router)
app.include_router(incidents.router)
app.include_router(treatments.router)
app.include_router(employees.router)
app.include_router(machinery.router)
app.include_router(weather.router)
app.include_router(audit.router)
app.include_router(orders.router)
app.include_router(shifts.router)
app.include_router(farm_settings.router)
app.include_router(handovers.router)
app.include_router(attachments.router)
app.include_router(transcription.router)
install_openapi(app)
