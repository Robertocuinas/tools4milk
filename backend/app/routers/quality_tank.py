"""Analiticas de calidad de leche de tanque (tarea T10.1).

Complementario a /lactations (promedios por lactacion) y a las lecturas de
robot de ordeño: aqui se registra el control de calidad de TANQUE/entrega a
industria (lactosa, bacteriologia, urea, temperatura, volumen, lote), que
antes no existia en ningun sitio del backend.
"""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.repositories import quality_tank_repository
from app.routers.deps import DbSession, QualityManager
from app.security import get_current_user
from app.services import quality_tank_service

router = APIRouter(prefix="/api/v1/calidad", tags=["Frontend Core"], dependencies=[Depends(get_current_user)])


@router.get("/tanque")
def list_tanque(
    db: DbSession,
    skip: int = 0,
    limit: int = 100,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> list[dict[str, Any]]:
    items = quality_tank_repository.get_all(db, skip=skip, limit=limit, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
    return [quality_tank_service.serialize(item) for item in items]


@router.get("/tanque/{item_id}")
def tanque_detail(item_id: str, db: DbSession) -> dict[str, Any]:
    item = quality_tank_repository.get_by_id(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Analitica de tanque no encontrada")
    return quality_tank_service.serialize(item)


@router.post("/tanque", status_code=201)
def create_tanque(payload: dict[str, Any], db: DbSession, _user: QualityManager) -> dict[str, Any]:
    if not payload.get("volumen_l"):
        raise HTTPException(status_code=422, detail="volumen_l es obligatorio")
    item = quality_tank_repository.create(db, payload)
    return quality_tank_service.serialize(item)
