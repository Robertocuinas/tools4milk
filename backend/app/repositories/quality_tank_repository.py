import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tools4milk import AnaliticaTanque


def get_all(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> list[AnaliticaTanque]:
    query = select(AnaliticaTanque).order_by(AnaliticaTanque.fecha.desc())
    if fecha_desde is not None:
        query = query.where(AnaliticaTanque.fecha >= fecha_desde)
    if fecha_hasta is not None:
        query = query.where(AnaliticaTanque.fecha <= fecha_hasta)
    return list(db.scalars(query.offset(skip).limit(limit)).all())


def get_by_id(db: Session, item_id: str) -> AnaliticaTanque | None:
    try:
        uid = uuid.UUID(item_id)
    except (ValueError, AttributeError):
        return None
    return db.get(AnaliticaTanque, uid)


def create(db: Session, data: dict) -> AnaliticaTanque:
    item = AnaliticaTanque(
        id=uuid.uuid4(),
        fecha=_parse_date(data.get("fecha")) or date.today(),
        lote=data.get("lote"),
        volumen_l=data["volumen_l"],
        grasa_pct=data.get("grasa_pct"),
        proteina_pct=data.get("proteina_pct"),
        lactosa_pct=data.get("lactosa_pct"),
        rcs_x1000=data.get("rcs_x1000"),
        bacteriologia_ufc_ml=data.get("bacteriologia_ufc_ml"),
        urea_mg_dl=data.get("urea_mg_dl"),
        temperatura_c=data.get("temperatura_c"),
        punto_criscopico=data.get("punto_criscopico"),
        inhibidores=bool(data.get("inhibidores", False)),
        laboratorio=data.get("laboratorio"),
        observaciones=data.get("observaciones"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _parse_date(value: str | date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None
