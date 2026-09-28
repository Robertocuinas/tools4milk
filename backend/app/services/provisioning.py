from uuid import uuid4
from sqlalchemy import inspect, text
from app.config import settings
from app.database import engine
from app.security import hash_password
from app.time_utils import utc_now


def seed_demo_user() -> None:
    if settings.environment == "production":
        raise RuntimeError("Demo users are disabled in production")
    user_columns = {column["name"] for column in inspect(engine).get_columns("usuarios")}
    legacy_password_change_column = "debe_cambiar_contrase\u00f1a"
    demo_users = [
        ("admin", "admin@tools4milk.local", "admin"),
        ("roberto.castro", "roberto.castro@tools4milk.local", "admin"),
        ("operario.zona", "operario.zona@tools4milk.local", "operario"),
        ("laura.fernandez", "laura.fernandez@tools4milk.local", "alimentacion"),
        ("dr.mendez", "dr.mendez@tools4milk.local", "veterinario"),
    ]

    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(834092552)"))
        for username, email, role in demo_users:
            # El arranque no debe reactivar cuentas deshabilitadas ni
            # restaurar roles, correos o contrasenas cambiados por el admin.
            result = connection.execute(
                text("SELECT 1 FROM usuarios WHERE username = :username"),
                {"username": username},
            )
            if result.scalar_one_or_none() is not None:
                continue

            password_hash = hash_password(settings.initial_demo_password)
            values = {
                "username": username,
                "email": email,
                "hashed_password": password_hash,
                "role": role,
                "activo": True,
            }

            insert_columns = [
                "id",
                "username",
                "email",
                "hashed_password",
                "role",
                "activo",
                "fecha_creacion",
            ]
            insert_placeholders = [
                ":id",
                ":username",
                ":email",
                ":hashed_password",
                ":role",
                ":activo",
                ":fecha_creacion",
            ]
            insert_values = {
                **values,
                "id": str(uuid4()),
                "fecha_creacion": utc_now(),
            }
            if legacy_password_change_column in user_columns:
                insert_columns.append(f'"{legacy_password_change_column}"')
                insert_placeholders.append(":legacy_password_change")
                insert_values["legacy_password_change"] = False
            if "debe_cambiar_contrasena" in user_columns:
                insert_columns.append("debe_cambiar_contrasena")
                insert_placeholders.append(":debe_cambiar_contrasena")
                insert_values["debe_cambiar_contrasena"] = False

            connection.execute(
                text(
                    "INSERT INTO usuarios "
                    f"({', '.join(insert_columns)}) "
                    f"VALUES ({', '.join(insert_placeholders)})"
                ),
                insert_values,
            )


