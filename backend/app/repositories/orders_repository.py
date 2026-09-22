import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import EstadoPedido
from app.models.tools4milk import Pedido


def get_all(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    estado: str | None = None,
) -> list[Pedido]:
    stmt = select(Pedido).order_by(Pedido.ts_solicitud.desc())
    if estado:
        stmt = stmt.where(Pedido.estado == estado)
    return list(db.scalars(stmt.offset(skip).limit(limit)).all())


def get_by_id(db: Session, pedido_id: str) -> Pedido | None:
    try:
        uid = uuid.UUID(pedido_id)
    except (ValueError, AttributeError):
        return None
    return db.get(Pedido, uid)


def create(db: Session, data: dict) -> Pedido:
    item = Pedido(
        id=uuid.uuid4(),
        insumo=data["insumo"],
        descripcion=data.get("descripcion"),
        cantidad=data["cantidad"],
        unidad=data.get("unidad"),
        estado=_map_estado(data.get("estado") or "solicitado"),
        solicitante_id=_to_uuid(data.get("solicitante_id")),
        ts_solicitud=data.get("ts_solicitud") or datetime.now(timezone.utc),
        ts_aprobacion=data.get("ts_aprobacion"),
        ts_recepcion=data.get("ts_recepcion"),
        proveedor=data.get("proveedor"),
        coste_estimado=data.get("coste_estimado"),
        coste_real=data.get("coste_real"),
        notas=data.get("notas"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update(db: Session, item: Pedido, data: dict) -> Pedido:
    for field in ("insumo", "descripcion", "cantidad", "unidad", "estado",
                  "proveedor", "coste_estimado", "coste_real", "notas",
                  "ts_aprobacion", "ts_recepcion"):
        if field in data:
            setattr(item, field, _map_estado(data[field]) if field == "estado" else data[field])
    if "solicitante_id" in data:
        item.solicitante_id = _to_uuid(data["solicitante_id"])
    db.commit()
    db.refresh(item)
    return item


def update_estado(db: Session, item: Pedido, estado: str) -> Pedido:
    item.estado = _map_estado(estado)
    if estado == "aprobado" and item.ts_aprobacion is None:
        item.ts_aprobacion = datetime.now(timezone.utc)
    elif estado == "recibido" and item.ts_recepcion is None:
        item.ts_recepcion = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


def _map_estado(estado: str | EstadoPedido) -> EstadoPedido:
    """Map frontend/API estado strings to EstadoPedido enum.

    PUT /pedidos/{id} no pasaba por la validacion de _ESTADOS_VALIDOS que si
    aplica PATCH /pedidos/{id}/estado; validando aqui, ambas rutas quedan
    cubiertas por el mismo criterio.
    """
    if isinstance(estado, EstadoPedido):
        return estado
    try:
        return EstadoPedido(estado)
    except ValueError:
        raise ValueError(
            f"Estado de pedido invalido: {estado!r}. "
            f"Valores permitidos son {sorted(v.value for v in EstadoPedido)}"
        ) from None


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None
