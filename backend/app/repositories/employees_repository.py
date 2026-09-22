import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import RolEmpleado
from app.models.tools4milk import Empleado


def get_all(db: Session, activo: bool | None = None) -> list[Empleado]:
    query = select(Empleado).order_by(Empleado.nombre)
    if activo is not None:
        query = query.where(Empleado.activo.is_(activo))
    return list(db.scalars(query).all())


def get_by_id(db: Session, employee_id: str) -> Empleado | None:
    try:
        uid = uuid.UUID(employee_id)
    except (ValueError, AttributeError):
        return None
    return db.get(Empleado, uid)


def create(db: Session, data: dict) -> Empleado:
    item = Empleado(
        id=uuid.uuid4(),
        nombre=data["nombre"],
        apellidos=data.get("apellidos", ""),
        rol=_map_rol(data.get("role") or data.get("rol") or "auxiliar").value,
        cualificaciones=data.get("cualificaciones", []),
        telefono=data.get("telefono"),
        email=data.get("email"),
        activo=bool(data.get("activo", True)),
        fecha_alta=date.today(),
        idioma_preferente=data.get("idioma_preferente") or "es",
        usuario_id=_to_uuid(data.get("usuario_id")),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update(db: Session, item: Empleado, data: dict) -> Empleado:
    allowed = {"nombre", "apellidos", "rol", "role", "cualificaciones", "telefono", "email", "activo", "idioma_preferente"}
    for key, value in data.items():
        if key in {"role", "rol"}:
            item.rol = _map_rol(value).value
        elif key == "usuario_id":
            item.usuario_id = _to_uuid(value)
        elif key in allowed:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def _map_rol(rol: str | RolEmpleado) -> RolEmpleado:
    """Map frontend/API rol strings to RolEmpleado enum."""
    if isinstance(rol, RolEmpleado):
        return rol
    try:
        return RolEmpleado(rol)
    except ValueError:
        raise ValueError(
            f"Rol de empleado invalido: {rol!r}. "
            f"Valores permitidos son {sorted(v.value for v in RolEmpleado)}"
        ) from None


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None
