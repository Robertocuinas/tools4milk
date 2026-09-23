import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import EstadoTarea, PrioridadTarea
from app.models.tools4milk import TareaEjecucion, TareaCatalogo


def get_all(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    estado: str | None = None,
    zona_id: str | None = None,
) -> list[tuple[TareaEjecucion, TareaCatalogo | None]]:
    query = (
        select(TareaEjecucion, TareaCatalogo)
        .outerjoin(TareaCatalogo, TareaEjecucion.catalogo_id == TareaCatalogo.id)
        .order_by(TareaEjecucion.ts_planificada)
    )
    if estado is not None:
        query = query.where(TareaEjecucion.estado == _map_estado(estado))
    if zona_id is not None:
        try:
            query = query.where(TareaEjecucion.zona_id == uuid.UUID(zona_id))
        except (ValueError, AttributeError):
            pass
    rows = db.execute(query.offset(skip).limit(limit)).all()
    return [(row[0], row[1]) for row in rows]


def get_by_id(db: Session, task_id: str) -> tuple[TareaEjecucion, TareaCatalogo | None] | None:
    try:
        uid = uuid.UUID(task_id)
    except (ValueError, AttributeError):
        return None
    row = db.execute(
        select(TareaEjecucion, TareaCatalogo)
        .outerjoin(TareaCatalogo, TareaEjecucion.catalogo_id == TareaCatalogo.id)
        .where(TareaEjecucion.id == uid)
    ).first()
    if row is None:
        return None
    return (row[0], row[1])


def create(db: Session, catalogo_id: uuid.UUID, data: dict) -> tuple[TareaEjecucion, TareaCatalogo | None]:
    ts_planificada = _parse_dt(data.get("fecha_programada")) or datetime.now(tz=timezone.utc)
    item = TareaEjecucion(
        id=uuid.uuid4(),
        catalogo_id=catalogo_id,
        zona_id=_to_uuid(data.get("zona_id")),
        empleado_id=_to_uuid(data.get("empleado_id")),
        estado=_map_estado(data.get("estado", "pendiente")),
        prioridad=_map_prioridad(data.get("prioridad"), fallback=data.get("es_urgente")),
        ts_planificada=ts_planificada,
        ts_inicio=_parse_dt(data.get("fecha_ejecucion")),
        notas=data.get("observaciones") or data.get("notas"),
        creado_en=datetime.now(tz=timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    catalogo = db.get(TareaCatalogo, catalogo_id)
    return (item, catalogo)


def update(db: Session, item: TareaEjecucion, data: dict) -> tuple[TareaEjecucion, TareaCatalogo | None]:
    if "estado" in data:
        item.estado = _map_estado(data["estado"])
    if "prioridad" in data or "es_urgente" in data:
        item.prioridad = _map_prioridad(data.get("prioridad"), fallback=data.get("es_urgente"))
    if "fecha_ejecucion" in data:
        item.ts_inicio = _parse_dt(data["fecha_ejecucion"])
    if "fecha_programada" in data:
        item.ts_planificada = _parse_dt(data["fecha_programada"]) or item.ts_planificada
    if "observaciones" in data or "notas" in data:
        item.notas = data.get("observaciones") or data.get("notas")
    if "empleado_id" in data or "ejecutado_por" in data:
        item.empleado_id = _to_uuid(data.get("empleado_id") or data.get("ejecutado_por"))
    db.commit()
    db.refresh(item)
    catalogo = db.get(TareaCatalogo, item.catalogo_id)
    return (item, catalogo)


def _map_estado(estado: str | EstadoTarea) -> EstadoTarea:
    """Map frontend/API estado strings to EstadoTarea enum."""
    if isinstance(estado, EstadoTarea):
        return estado
    mapping = {
        "programada": EstadoTarea.PENDIENTE,
        "retrasada": EstadoTarea.PENDIENTE,
        "ejecutada": EstadoTarea.COMPLETADA,
        "cancelada": EstadoTarea.CANCELADA,
        "pendiente": EstadoTarea.PENDIENTE,
        "en_curso": EstadoTarea.EN_CURSO,
        "completada": EstadoTarea.COMPLETADA,
        "vencida": EstadoTarea.VENCIDA,
    }
    return mapping.get(estado, EstadoTarea.PENDIENTE)


def _map_prioridad(prioridad: str | PrioridadTarea | None, fallback: bool | None = None) -> PrioridadTarea:
    """Map frontend/API prioridad strings to PrioridadTarea.

    Accepts the new explicit `prioridad` field, and falls back to the legacy
    boolean `es_urgente` (True -> urgente) for older clients/payloads that
    haven't been updated yet, defaulting to NORMAL otherwise.
    """
    if isinstance(prioridad, PrioridadTarea):
        return prioridad
    if isinstance(prioridad, str):
        try:
            return PrioridadTarea(prioridad)
        except ValueError:
            pass
    if fallback:
        return PrioridadTarea.URGENTE
    return PrioridadTarea.NORMAL


def _map_estado_to_frontend(estado: str | EstadoTarea) -> str:
    """Map EstadoTarea enum to frontend estado string."""
    estado_str = estado.value if isinstance(estado, EstadoTarea) else estado
    mapping = {
        "pendiente": "programada",
        "en_curso": "en_curso",
        "completada": "ejecutada",
        "vencida": "retrasada",
        "cancelada": "cancelada",
    }
    return mapping.get(estado_str, estado_str)


def _parse_dt(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None


# ── Agregados para la recomendacion de trabajadores ──────────────────────────
# Una sola consulta agrupada por empleado en cada caso (sin N+1).


def count_completed_by_employee(db: Session, catalogo_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Numero de ejecuciones COMPLETADAS de una tarea de catalogo por empleado
    (historial real, base del criterio de experiencia)."""
    rows = db.execute(
        select(TareaEjecucion.empleado_id, func.count(TareaEjecucion.id))
        .where(
            TareaEjecucion.catalogo_id == catalogo_id,
            TareaEjecucion.estado == EstadoTarea.COMPLETADA,
            TareaEjecucion.empleado_id.is_not(None),
        )
        .group_by(TareaEjecucion.empleado_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


def count_open_by_employee_between(
    db: Session,
    start: datetime,
    end: datetime,
    exclude_task_id: uuid.UUID | None = None,
) -> dict[uuid.UUID, int]:
    """Tareas abiertas (pendiente/en curso) planificadas en [start, end) por
    empleado; se usa como carga de trabajo del dia de la tarea."""
    query = (
        select(TareaEjecucion.empleado_id, func.count(TareaEjecucion.id))
        .where(
            TareaEjecucion.estado.in_([EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO]),
            TareaEjecucion.empleado_id.is_not(None),
            TareaEjecucion.ts_planificada >= start,
            TareaEjecucion.ts_planificada < end,
        )
        .group_by(TareaEjecucion.empleado_id)
    )
    if exclude_task_id is not None:
        query = query.where(TareaEjecucion.id != exclude_task_id)
    return {row[0]: int(row[1]) for row in db.execute(query).all()}
