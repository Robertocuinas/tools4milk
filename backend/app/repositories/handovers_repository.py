import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tools4milk import ResumenRelevo


def _filtered_stmt(
    turno_saliente_id: str | None = None,
    turno_entrante_id: str | None = None,
):
    stmt = select(ResumenRelevo)
    if turno_saliente_id:
        stmt = stmt.where(ResumenRelevo.turno_saliente_id == uuid.UUID(turno_saliente_id))
    if turno_entrante_id:
        stmt = stmt.where(ResumenRelevo.turno_entrante_id == uuid.UUID(turno_entrante_id))
    return stmt


def get_all(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    turno_saliente_id: str | None = None,
    turno_entrante_id: str | None = None,
) -> list[ResumenRelevo]:
    try:
        stmt = _filtered_stmt(turno_saliente_id, turno_entrante_id)
    except (ValueError, AttributeError):
        return []
    stmt = stmt.order_by(ResumenRelevo.ts_generacion.desc())
    return list(db.scalars(stmt.offset(skip).limit(limit)).all())


def count_all(
    db: Session,
    turno_saliente_id: str | None = None,
    turno_entrante_id: str | None = None,
) -> int:
    try:
        stmt = _filtered_stmt(turno_saliente_id, turno_entrante_id)
    except (ValueError, AttributeError):
        return 0
    return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0


def count_confirmados(
    db: Session,
    turno_saliente_id: str | None = None,
    turno_entrante_id: str | None = None,
) -> int:
    try:
        stmt = _filtered_stmt(turno_saliente_id, turno_entrante_id)
    except (ValueError, AttributeError):
        return 0
    stmt = stmt.where(ResumenRelevo.ts_confirmacion.isnot(None))
    return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0


def get_by_id(db: Session, relevo_id: str) -> ResumenRelevo | None:
    try:
        uid = uuid.UUID(relevo_id)
    except (ValueError, AttributeError):
        return None
    return db.get(ResumenRelevo, uid)


def create(db: Session, data: dict) -> ResumenRelevo:
    item = ResumenRelevo(
        id=uuid.uuid4(),
        turno_saliente_id=uuid.UUID(data["turno_saliente_id"]),
        turno_entrante_id=uuid.UUID(data["turno_entrante_id"]),
        ts_generacion=data.get("ts_generacion") or datetime.now(timezone.utc),
        incidencias_abiertas=data.get("incidencias_abiertas") or [],
        tareas_pendientes=data.get("tareas_pendientes") or [],
        alertas_pendientes=data.get("alertas_pendientes") or [],
        notas_saliente=data.get("notas_saliente"),
        confirmado_por=_to_uuid(data.get("confirmado_por")),
        ts_confirmacion=data.get("ts_confirmacion"),
    )
    db.add(item)
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
