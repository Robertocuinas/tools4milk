"""
Configuración y fixtures para tests de Tools4Milk MVP.

T15 (docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md): los tests corren contra
PostgreSQL real, no contra sqlite:///:memory:. La razón es que tras la
migración a PostgreSQL hay comportamiento que sqlite no puede reproducir
(tipos ENUM nativos, columnas GENERATED ALWAYS AS STORED en
lecturas_meteorologia/lecturas_carro_mezclador, JSONB) y que solo se
detecta ejecutando el esquema real — el propio `apply_migrations.py`, no
`Base.metadata.create_all()` — contra un Postgres real.

Aislamiento entre tests: en vez de crear/borrar todas las tablas en cada
test (viable en sqlite en memoria, pero lento y destructivo del esquema
generado por migraciones en Postgres real), cada test corre dentro de una
transacción con SAVEPOINT que se revierte al terminar (patrón estándar de
SQLAlchemy "Joining a Session into an External Transaction"). Los cambios
de un test nunca son visibles al siguiente ni persisten en la base de
datos de test.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/tools4milk_test",
)

os.environ["REDIS_ENABLED"] = "False"
os.environ["AEMET_API_KEY"] = ""
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from app.time_utils import utc_now  # noqa: E402

from app.main import app  # noqa: E402
from app.database import engine, get_db  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402
from app.models.tools4milk import Animal, Empleado, Lactacion, Maquinaria, TareaCatalogo, TareaEjecucion, TratamientoActivo, Zona  # noqa: E402
from app.security import hash_password  # noqa: E402


def _ensure_test_database_exists() -> None:
    """Crea la base de datos de test si no existe todavia (CREATE DATABASE
    no admite IF NOT EXISTS en PostgreSQL, hay que comprobarlo a mano)."""
    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    db_name = TEST_DATABASE_URL.rsplit("/", 1)[1]
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
            ).scalar_one_or_none()
            if not exists:
                connection.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        admin_engine.dispose()


def _apply_test_migrations() -> None:
    """Aplica las migraciones SQL reales (no Base.metadata.create_all) para
    que el esquema de test sea el mismo que produccion, incluidas las
    columnas GENERATED ALWAYS AS y los tipos ENUM nativos."""
    subprocess.run(
        [sys.executable, "scripts/apply_migrations.py"],
        cwd=BACKEND_ROOT,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        check=True,
    )


_ensure_test_database_exists()
_apply_test_migrations()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def _connection():
    connection = engine.connect()
    trans = connection.begin()
    yield connection
    trans.rollback()
    connection.close()


@pytest.fixture
def db(_connection):
    """Sesión de test ligada a una única conexión con SAVEPOINT: cualquier
    `commit()` que haga el código de la app (routers/repositorios) libera y
    reabre el SAVEPOINT en vez de comprometer datos de verdad, así que el
    `rollback()` final de `_connection` deshace todo lo que hizo el test."""
    session = TestingSessionLocal(bind=_connection)
    nested = _connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, transaction):
        nonlocal nested
        if not nested.is_active:
            nested = _connection.begin_nested()

    yield session
    session.close()


@pytest.fixture
def client(db):
    """Cliente de API cuyas peticiones usan la MISMA sesión/transacción que
    la fixture `db`, para que lo que un test siembra directamente en `db`
    sea visible en las peticiones HTTP y viceversa, y todo se revierta
    junto al terminar el test."""
    def override_get_db():
        try:
            yield db
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    ensure_operational_seed(db)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def test_user(db):
    """
    Crea un usuario de prueba en la base de datos

    Returns:
        Usuario con credenciales:
        - username: "testuser"
        - email: "test@example.com"
        - password: "testpass123" (hashado)
    """
    user = Usuario(
        id=uuid.uuid4(),
        username="testuser",
        email="test@example.com",
        hashed_password=hash_password("testpass123"),
        role="admin",
        activo=True,
        debe_cambiar_contrasena=False,
        fecha_creacion=utc_now()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_user_credentials():
    """Proporciona credenciales de usuario para pruebas"""
    return {
        "username": "testuser",
        "password": "testpass123"
    }


@pytest.fixture
def test_inactive_user(db):
    """
    Crea un usuario inactivo en la base de datos

    Returns:
        Usuario inactivo con credenciales:
        - username: "inactiveuser"
        - email: "inactive@example.com"
        - password: "inactivepass123"
    """
    user = Usuario(
        id=uuid.uuid4(),
        username="inactiveuser",
        email="inactive@example.com",
        hashed_password=hash_password("inactivepass123"),
        role="operario",
        activo=False,
        debe_cambiar_contrasena=False,
        fecha_creacion=utc_now()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, db):
    ensure_test_user(db, "admin", "admin@tools4milk.local", "admin")
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "testpass123"},
    )
    assert response.status_code == 200
    token = response.json()["token"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def operario_headers(client, db):
    ensure_test_user(db, "laura.fernandez", "laura.fernandez@tools4milk.local", "alimentacion")
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "laura.fernandez", "password": "testpass123"},
    )
    assert response.status_code == 200
    token = response.json()["token"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def ensure_test_user(db, username: str, email: str, role: str) -> None:
    user = db.execute(select(Usuario).where(Usuario.username == username)).scalar_one_or_none()
    password_hash = hash_password("testpass123")
    if user is None:
        db.add(
            Usuario(
                id=uuid.uuid4(),
                username=username,
                email=email,
                hashed_password=password_hash,
                role=role,
                activo=True,
                debe_cambiar_contrasena=False,
                fecha_creacion=utc_now(),
            )
        )
    else:
        user.email = email
        user.hashed_password = password_hash
        user.role = role
        user.activo = True
    db.commit()


def ensure_operational_seed(db) -> None:
    animal = db.execute(select(Animal).where(Animal.crotal_oficial == "TEST-0001")).scalar_one_or_none()
    if animal is None:
        animal = Animal(
            id=uuid.uuid4(),
            crotal_oficial="TEST-0001",
            nombre="Vaca test",
            sexo="hembra",
            fecha_nacimiento=date(2021, 1, 1),
            raza="frisona",
            estado="produccion",
            estado_reproductivo="vacia",
            fecha_entrada=date(2021, 1, 1),
        )
        db.add(animal)
        db.flush()

    frontend_animal = db.execute(select(Animal).where(Animal.crotal_oficial == "animal-001")).scalar_one_or_none()
    if frontend_animal is None:
        frontend_animal = Animal(
            id=uuid.uuid4(),
            crotal_oficial="animal-001",
            nombre="Luna",
            sexo="hembra",
            fecha_nacimiento=date(2020, 4, 12),
            raza="frisona",
            estado="produccion",
            estado_reproductivo="vacia",
            fecha_entrada=date(2020, 4, 12),
        )
        db.add(frontend_animal)
        db.flush()

    lactation = db.execute(select(Lactacion).where(Lactacion.animal_id == animal.id)).scalar_one_or_none()
    if lactation is None:
        db.add(
            Lactacion(
                id=uuid.uuid4(),
                animal_id=animal.id,
                numero=1,
                fecha_parto=date(2025, 1, 1),
                fecha_secado=None,
                produccion_total_kg=3500,
            )
        )
    frontend_lactation = db.execute(select(Lactacion).where(Lactacion.animal_id == frontend_animal.id)).scalar_one_or_none()
    if frontend_lactation is None:
        db.add(
            Lactacion(
                id=uuid.uuid4(),
                animal_id=frontend_animal.id,
                numero=3,
                fecha_parto=date(2025, 10, 2),
                fecha_secado=None,
                produccion_total_kg=8071,
            )
        )
    if db.execute(select(Zona).limit(1)).scalar_one_or_none() is None:
        db.add(
            Zona(
                id=uuid.uuid4(),
                nombre="Sala de ordeno",
                codigo="ORD",
                descripcion="Produccion, calidad de leche y tanque.",
                tiene_pantalla_tv=True,
                tiene_tablet=True,
            )
        )
    catalog = db.execute(select(TareaCatalogo).limit(1)).scalar_one_or_none()
    if catalog is None:
        catalog = TareaCatalogo(
            id=uuid.uuid4(),
            codigo="cat-ord-001",
            nombre="Revisar tanque",
            descripcion="Revision operativa diaria",
            cualificacion_requerida="ordeno",
            duracion_estimada_min=15,
            activa=True,
        )
        db.add(catalog)
        db.flush()
    if db.execute(select(TareaEjecucion).limit(1)).scalar_one_or_none() is None:
        db.add(
            TareaEjecucion(
                id=uuid.uuid4(),
                catalogo_id=catalog.id,
                estado="pendiente",
                ts_planificada=utc_now(),
                creado_en=utc_now(),
            )
        )
    if db.execute(select(TratamientoActivo).limit(1)).scalar_one_or_none() is None:
        db.add(
            TratamientoActivo(
                id=uuid.uuid4(),
                animal_id=frontend_animal.id,
                farmaco="Suplemento mineral",
                dosis="120 g/dia",
                dias_tratamiento=7,
                fecha_inicio=date(2026, 5, 20),
                fecha_fin_prevista=date(2026, 5, 27),
                activo=True,
                checkboxes=[],
            )
        )
    if db.execute(select(Empleado).limit(1)).scalar_one_or_none() is None:
        db.add(
            Empleado(
                id=uuid.uuid4(),
                nombre="Roberto",
                apellidos="Castro",
                rol="encargado",
                cualificaciones=[],
                activo=True,
                fecha_alta=date(2020, 1, 1),
            )
        )
    if db.execute(select(Maquinaria).limit(1)).scalar_one_or_none() is None:
        db.add(
            Maquinaria(
                id=uuid.uuid4(),
                nombre="Robot de ordeno 1",
                tipo="robot_ordeno",
                activa=True,
                estado="operativa",
            )
        )
    db.commit()
