import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tools4milk import Animal, Empleado, MovimientoAnimal


def get_all(db: Session, skip: int = 0, limit: int = 50, estado: str | None = None) -> list[Animal]:
    query = select(Animal).order_by(Animal.crotal_oficial)
    if estado is not None:
        query = query.where(Animal.estado == estado)
    return list(db.scalars(query.offset(skip).limit(limit)).all())


def count_active(db: Session) -> int:
    from sqlalchemy import func
    return db.scalar(select(func.count()).select_from(Animal).where(Animal.estado != "baja")) or 0


def get_by_id(db: Session, animal_id: str) -> Animal | None:
    try:
        uid = uuid.UUID(animal_id)
    except (ValueError, AttributeError):
        return None
    return db.get(Animal, uid)


def get_by_crotal(db: Session, crotal: str) -> Animal | None:
    return db.scalar(select(Animal).where(Animal.crotal_oficial == crotal))


def get_movimientos(db: Session, animal_id: uuid.UUID, limit: int = 50) -> list[MovimientoAnimal]:
    query = (
        select(MovimientoAnimal)
        .where(MovimientoAnimal.animal_id == animal_id)
        .order_by(MovimientoAnimal.fecha.desc())
        .limit(limit)
    )
    return list(db.scalars(query).all())


def create(db: Session, data: dict) -> Animal:
    item = Animal(
        id=uuid.uuid4(),
        crotal_oficial=data["crotal_oficial"],
        nombre=data.get("nombre"),
        sexo=data.get("sexo", "hembra"),
        fecha_nacimiento=_parse_date(data.get("fecha_nacimiento")),
        raza=data.get("raza"),
        estado=data.get("estado", "recria"),
        estado_reproductivo=data.get("estado_reproductivo"),
        fecha_entrada=_parse_date(data.get("fecha_entrada")) or date.today(),
        fecha_baja=_parse_date(data.get("fecha_baja")),
        motivo_baja=data.get("motivo_baja"),
        notas=data.get("notas"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update(db: Session, item: Animal, data: dict, usuario_id: uuid.UUID | None = None) -> Animal:
    date_fields = {"fecha_nacimiento", "fecha_entrada", "fecha_baja"}
    allowed = {"nombre", "sexo", "fecha_nacimiento", "raza", "estado", "estado_reproductivo",
               "fecha_entrada", "fecha_baja", "motivo_baja", "notas"}
    nueva_zona_id = _to_uuid(data.get("zona_id")) if "zona_id" in data else None
    zona_cambio = "zona_id" in data and nueva_zona_id != item.zona_id
    zona_anterior_id = item.zona_id

    for key, value in data.items():
        if key == "zona_id":
            item.zona_id = nueva_zona_id
        elif key in allowed:
            setattr(item, key, _parse_date(value) if key in date_fields else value)

    # T10.4: registrar el movimiento SOLO si hay un destino real (no se
    # registra al "quitar" al animal de toda zona, ni si no cambia nada).
    if zona_cambio and nueva_zona_id is not None:
        empleado_id = None
        if usuario_id is not None:
            empleado = db.scalar(select(Empleado).where(Empleado.usuario_id == usuario_id))
            empleado_id = empleado.id if empleado else None
        db.add(MovimientoAnimal(
            id=uuid.uuid4(),
            animal_id=item.id,
            zona_origen_id=zona_anterior_id,
            zona_destino_id=nueva_zona_id,
            fecha=datetime.now(tz=timezone.utc),
            motivo=data.get("motivo_movimiento"),
            empleado_id=empleado_id,
        ))

    db.commit()
    db.refresh(item)
    return item


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None
