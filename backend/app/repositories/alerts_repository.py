import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import NivelAlerta
from app.models.tools4milk import Alerta


def get_all(db: Session, skip: int = 0, limit: int = 50, nivel: str | None = None) -> list[Alerta]:
    query = select(Alerta).order_by(Alerta.ts_generacion.desc())
    if nivel is not None:
        query = query.where(Alerta.nivel == _map_nivel_filtro(nivel))
    return list(db.scalars(query.offset(skip).limit(limit)).all())


def get_critical(db: Session) -> list[Alerta]:
    return list(
        db.scalars(
            select(Alerta)
            .where(Alerta.nivel.in_([NivelAlerta.ALTA, NivelAlerta.CRITICA]))
            .order_by(Alerta.ts_generacion.desc())
        ).all()
    )


def get_by_animal(db: Session, animal_id: str, skip: int = 0, limit: int = 50) -> list[Alerta]:
    try:
        uid = uuid.UUID(animal_id)
    except (ValueError, AttributeError):
        return []
    return list(
        db.scalars(
            select(Alerta).where(Alerta.animal_id == uid).order_by(Alerta.ts_generacion.desc()).offset(skip).limit(limit)
        ).all()
    )


def get_by_id(db: Session, alert_id: str) -> Alerta | None:
    try:
        uid = uuid.UUID(alert_id)
    except (ValueError, AttributeError):
        return None
    return db.get(Alerta, uid)


def create(db: Session, data: dict) -> Alerta:
    item = Alerta(
        id=uuid.uuid4(),
        nivel=_map_nivel(data.get("severidad") or data.get("nivel", "media")),
        titulo=data.get("tipo_alerta") or data.get("titulo", "Alerta"),
        mensaje=data.get("descripcion") or data.get("mensaje"),
        animal_id=_to_uuid(data.get("animal_id")),
        zona_id=_to_uuid(data.get("zona_id")),
        activa=True,
        ts_generacion=datetime.now(tz=timezone.utc),
        push_whatsapp=False,
        pantalla_tv=True,
        tablet=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def resolve(db: Session, item: Alerta, data: dict) -> Alerta:
    estado = data.get("estado")
    if estado == "revisada":
        item.activa = False
        item.ts_resolucion = None
    elif estado and estado not in {"pendiente"}:
        item.activa = False
        item.ts_resolucion = datetime.now(tz=timezone.utc)
    elif estado == "pendiente":
        item.activa = True
        item.ts_resolucion = None
    if "notas_operario" in data:
        pass  # No hay campo directo; se podría guardar en mensaje
    db.commit()
    db.refresh(item)
    return item


def _map_nivel(nivel: str | NivelAlerta) -> NivelAlerta:
    """Map frontend/API nivel strings to NivelAlerta enum."""
    if isinstance(nivel, NivelAlerta):
        return nivel
    try:
        return NivelAlerta(nivel)
    except ValueError:
        raise ValueError(
            f"Nivel de alerta invalido: {nivel!r}. "
            f"Valores permitidos son {sorted(v.value for v in NivelAlerta)}"
        ) from None


def _map_nivel_filtro(nivel: str | NivelAlerta) -> NivelAlerta:
    """Variante tolerante para el filtro opcional de get_all.

    Un filtro de listado no debe devolver 422 por un valor desconocido: se
    degrada al nivel por defecto (comportamiento historico). En create(), en
    cambio, _map_nivel rechaza el valor en vez de sustituirlo en silencio.
    """
    try:
        return _map_nivel(nivel)
    except ValueError:
        return NivelAlerta.MEDIA


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None
