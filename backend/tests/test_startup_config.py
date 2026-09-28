from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect, select

from app.services import provisioning as main
from app.config import Settings
from app.models.usuario import Usuario


def test_startup_preserves_existing_user_access(db, _connection, monkeypatch):
    # Ejecuta el seed real dentro de la transaccion reversible del test.
    monkeypatch.setattr(main, "inspect", lambda _: inspect(_connection))
    monkeypatch.setattr(main, "engine", SimpleNamespace(begin=lambda: nullcontext(_connection)))
    main.seed_demo_user()
    test_user = db.scalar(select(Usuario).where(Usuario.username == "admin"))
    test_user.email = "changed@example.com"
    test_user.role = "operario"
    test_user.activo = False
    original_hash = test_user.hashed_password
    db.commit()

    main.seed_demo_user()
    db.refresh(test_user)

    assert test_user.email == "changed@example.com"
    assert test_user.role == "operario"
    assert test_user.activo is False
    assert test_user.hashed_password == original_hash


@pytest.mark.parametrize("value", ["false", "False", "0", "release"])
def test_debug_environment_false_is_boolean(monkeypatch, value):
    monkeypatch.setenv("DEBUG", value)
    assert Settings(_env_file=None).debug is False
