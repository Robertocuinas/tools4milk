import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tools4milk import Adjunto


def count_by_entidad(db: Session, entidad_tipo: str, entidad_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(Adjunto)
        .where(
            Adjunto.entidad_tipo == entidad_tipo,
            Adjunto.entidad_id == uuid.UUID(entidad_id),
            Adjunto.eliminado.is_(False),
        )
    )
    return db.scalar(stmt) or 0


def get_by_hash(db: Session, entidad_tipo: str, entidad_id: str, hash_sha256: str) -> Adjunto | None:
    stmt = select(Adjunto).where(
        Adjunto.entidad_tipo == entidad_tipo,
        Adjunto.entidad_id == uuid.UUID(entidad_id),
        Adjunto.hash_sha256 == hash_sha256,
        Adjunto.eliminado.is_(False),
    )
    return db.scalar(stmt)


def list_by_entidad(db: Session, entidad_tipo: str, entidad_id: str) -> list[Adjunto]:
    stmt = (
        select(Adjunto)
        .where(
            Adjunto.entidad_tipo == entidad_tipo,
            Adjunto.entidad_id == uuid.UUID(entidad_id),
            Adjunto.eliminado.is_(False),
        )
        .order_by(Adjunto.ts_subida.desc())
    )
    return list(db.scalars(stmt).all())


def get_by_id(db: Session, adjunto_id: str) -> Adjunto | None:
    try:
        uid = uuid.UUID(adjunto_id)
    except (ValueError, AttributeError):
        return None
    return db.get(Adjunto, uid)


def create(db: Session, data: dict) -> Adjunto:
    item = Adjunto(
        id=uuid.uuid4(),
        entidad_tipo=data["entidad_tipo"],
        entidad_id=uuid.UUID(data["entidad_id"]),
        tipo_media=data["tipo_media"],
        nombre_original=data["nombre_original"],
        mime_type=data["mime_type"],
        tamano_bytes=data["tamano_bytes"],
        storage_key=data["storage_key"],
        ancho_px=data.get("ancho_px"),
        alto_px=data.get("alto_px"),
        duracion_seg=data.get("duracion_seg"),
        hash_sha256=data["hash_sha256"],
        subido_por=data.get("subido_por"),
        ts_subida=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def soft_delete(db: Session, item: Adjunto) -> None:
    item.eliminado = True
    db.commit()
