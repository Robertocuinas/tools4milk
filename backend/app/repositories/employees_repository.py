import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import RolEmpleado
from app.models.tools4milk import AsignacionTurno, Empleado, Turno


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
        rol=_map_rol(data.get("role") or data.get("rol") or "auxiliar"),
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
            item.rol = _map_rol(value)
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


def get_on_shift(db: Session, local_dt: datetime) -> dict[uuid.UUID, str]:
    """Empleados asignados a un turno que cubre la hora local `local_dt`
    (naive, hora de la explotacion). Devuelve {empleado_id: tipo_turno}.

    Los turnos que cruzan medianoche (hora_fin <= hora_inicio, p.ej. noche
    22:00-06:00) cubren tambien la madrugada del dia siguiente, por eso se
    consultan los turnos del dia y del dia anterior en una sola query."""
    day = local_dt.date()
    rows = db.execute(
        select(AsignacionTurno.empleado_id, Turno.fecha, Turno.hora_inicio, Turno.hora_fin, Turno.tipo_turno)
        .join(Turno, AsignacionTurno.turno_id == Turno.id)
        .where(Turno.fecha.in_([day, day - timedelta(days=1)]))
    ).all()
    result: dict[uuid.UUID, str] = {}
    for empleado_id, fecha, hora_inicio, hora_fin, tipo in rows:
        start = datetime.combine(fecha, hora_inicio)
        end = datetime.combine(fecha, hora_fin)
        if end <= start:
            end += timedelta(days=1)
        if start <= local_dt < end:
            result.setdefault(empleado_id, tipo.value if hasattr(tipo, "value") else str(tipo))
    return result
