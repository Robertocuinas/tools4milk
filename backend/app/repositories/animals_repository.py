import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.enums import EstadoAnimal, EstadoReproductivo, SexoAnimal
from app.models.tools4milk import Animal, Empleado, Lactacion, MovimientoAnimal, TratamientoActivo


def get_all(db: Session, skip: int = 0, limit: int = 50, estado: str | None = None) -> list[Animal]:
    query = select(Animal).order_by(Animal.crotal_oficial)
    if estado is not None:
        query = query.where(Animal.estado == estado)
    return list(db.scalars(query.offset(skip).limit(limit)).all())


def get_list(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    estado: str | None = None,
    search: str | None = None,
    sort: str = "production",
    direction: str = "desc",
) -> list[tuple[Animal, float | None, int]]:
    """Fetch a page with production and active treatment counts in one query."""
    production = (
        select(Lactacion.produccion_total_kg / 305.0)
        .where(Lactacion.animal_id == Animal.id, Lactacion.fecha_secado.is_(None))
        .order_by(Lactacion.fecha_parto.desc(), Lactacion.numero.desc())
        .limit(1)
        .correlate(Animal)
        .scalar_subquery()
    )
    treatment_counts = (
        select(TratamientoActivo.animal_id.label("animal_id"), func.count().label("count"))
        .where(TratamientoActivo.activo.is_(True))
        .group_by(TratamientoActivo.animal_id)
        .subquery()
    )
    query = (
        select(Animal, production.label("produccion_promedio"), func.coalesce(treatment_counts.c.count, 0))
        .outerjoin(treatment_counts, treatment_counts.c.animal_id == Animal.id)
    )
    if estado is not None:
        query = query.where(Animal.estado == estado)
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(Animal.nombre.ilike(needle) | Animal.crotal_oficial.ilike(needle))

    columns = {
        "production": production,
        "name": func.lower(func.coalesce(Animal.nombre, "")),
        "code": func.lower(Animal.crotal_oficial),
        "state": Animal.estado,
    }
    ordering = columns[sort]
    if sort == "production":
        production_order = ordering.asc().nullslast() if direction == "asc" else ordering.desc().nullslast()
        query = query.order_by(production_order, func.lower(Animal.crotal_oficial))
    else:
        query = query.order_by(ordering.asc() if direction == "asc" else ordering.desc(), Animal.id)
    rows = db.execute(query.offset(skip).limit(limit)).all()
    return [(animal, float(avg) if avg is not None else None, int(count)) for animal, avg, count in rows]


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


def get_many_by_ids(db: Session, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, Animal]:
    """Carga varios animales en UNA consulta (genealogia). Ignora None."""
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    rows = db.scalars(select(Animal).where(Animal.id.in_(wanted))).all()
    return {a.id: a for a in rows}


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
        sexo=_map_sexo(data.get("sexo") or "hembra"),
        fecha_nacimiento=_parse_date(data.get("fecha_nacimiento")),
        raza=data.get("raza"),
        estado=_map_estado(data.get("estado") or "recria"),
        estado_reproductivo=_map_estado_reproductivo(data.get("estado_reproductivo")),
        fecha_entrada=_parse_date(data.get("fecha_entrada")) or date.today(),
        fecha_baja=_parse_date(data.get("fecha_baja")),
        motivo_baja=data.get("motivo_baja"),
        notas=data.get("notas"),
    )
    _apply_genealogy(db, item, data)
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

    # Genealogia primero: si es invalida se rechaza antes de tocar nada mas.
    _apply_genealogy(db, item, data)

    for key, value in data.items():
        if key == "zona_id":
            item.zona_id = nueva_zona_id
        elif key == "sexo":
            item.sexo = _map_sexo(value)
        elif key == "estado":
            item.estado = _map_estado(value)
        elif key == "estado_reproductivo":
            item.estado_reproductivo = _map_estado_reproductivo(value)
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


def _apply_genealogy(db: Session, item: Animal, data: dict) -> None:
    """Asigna madre/padre (todos opcionales) validando que los ascendientes
    registrados existan, no sean el propio animal y tengan el sexo correcto.
    Solo toca los campos presentes en el payload (PUT parcial) y valida todo
    antes de asignar nada, para no dejar el objeto a medio modificar."""
    changes: dict[str, Any] = {}
    for key, expected_sexo, label in (("madre_id", SexoAnimal.HEMBRA, "madre"), ("padre_id", SexoAnimal.MACHO, "padre")):
        if key not in data:
            continue
        raw = data.get(key)
        if raw in (None, ""):
            changes[key] = None
            continue
        parent_id = _to_uuid(raw)
        if parent_id is None:
            raise ValueError(f"{key} invalido: {raw!r}")
        if item.id is not None and parent_id == item.id:
            raise ValueError(f"Un animal no puede ser su propio ascendiente ({label})")
        parent = db.get(Animal, parent_id)
        if parent is None:
            raise ValueError(f"No existe el animal indicado como {label}: {raw}")
        if SexoAnimal(getattr(parent.sexo, "value", parent.sexo)) != expected_sexo:
            raise ValueError(f"El animal indicado como {label} debe ser {expected_sexo.value}")
        changes[key] = parent_id

    # Toro externo (IA): texto libre, vacio = sin dato.
    for key, max_len in (("padre_crotal", 40), ("padre_nombre", 120)):
        if key in data:
            value = str(data.get(key) or "").strip() or None
            if value is not None and len(value) > max_len:
                raise ValueError(f"{key} supera {max_len} caracteres")
            changes[key] = value

    for key, value in changes.items():
        setattr(item, key, value)


def _map_sexo(sexo: str | SexoAnimal) -> SexoAnimal:
    """Map frontend/API sexo strings to SexoAnimal enum."""
    if isinstance(sexo, SexoAnimal):
        return sexo
    try:
        return SexoAnimal(sexo)
    except ValueError:
        raise ValueError(
            f"Sexo de animal invalido: {sexo!r}. "
            f"Valores permitidos son {sorted(v.value for v in SexoAnimal)}"
        ) from None


def _map_estado(estado: str | EstadoAnimal) -> EstadoAnimal:
    """Map frontend/API estado strings to EstadoAnimal enum."""
    if isinstance(estado, EstadoAnimal):
        return estado
    try:
        return EstadoAnimal(estado)
    except ValueError:
        raise ValueError(
            f"Estado de animal invalido: {estado!r}. "
            f"Valores permitidos son {sorted(v.value for v in EstadoAnimal)}"
        ) from None


def _map_estado_reproductivo(estado: str | EstadoReproductivo | None) -> EstadoReproductivo | None:
    """Map frontend/API estado_reproductivo strings to EstadoReproductivo enum.

    Columna anulable: un valor ausente o vacio significa "sin dato", no un
    estado invalido, por lo que se propaga como NULL en vez de rechazarse.
    """
    if estado is None or estado == "":
        return None
    if isinstance(estado, EstadoReproductivo):
        return estado
    try:
        return EstadoReproductivo(estado)
    except ValueError:
        raise ValueError(
            f"Estado reproductivo invalido: {estado!r}. "
            f"Valores permitidos son {sorted(v.value for v in EstadoReproductivo)}"
        ) from None


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
