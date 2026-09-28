from app.schemas.writes import TreatmentCreate, TreatmentWrite
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.repositories import treatments_repository
from app.routers.deps import ClinicalManager, DbSession
from app.security import get_current_user
from app.services import treatments_service

router = APIRouter(prefix="/api/v1", tags=["Frontend Core"], dependencies=[Depends(get_current_user)])


@router.get("/treatments")
def treatments(
    db: DbSession,
    skip: int = 0,
    limit: int = 50,
    animal_id: str | None = None,
    activo: bool | None = None,
) -> list[dict[str, Any]]:
    items = treatments_repository.get_all(db, skip=skip, limit=limit, animal_id=animal_id, activo=activo)
    return [treatments_service.serialize(t) for t in items]


@router.post("/treatments", status_code=201)
def create_treatment(payload: TreatmentCreate, db: DbSession, _user: ClinicalManager) -> dict[str, Any]:
    payload = payload.model_dump(exclude_unset=True, mode="json")
    item = treatments_repository.create(db, payload)
    return treatments_service.serialize(item)


@router.get("/treatments/{treatment_id}")
def treatment_detail(treatment_id: str, db: DbSession) -> dict[str, Any]:
    item = treatments_repository.get_by_id(db, treatment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    return treatments_service.serialize(item)


@router.put("/treatments/{treatment_id}")
def update_treatment(
    treatment_id: str,
    payload: TreatmentWrite,
    db: DbSession,
    _user: ClinicalManager,
) -> dict[str, Any]:
    payload = payload.model_dump(exclude_unset=True, mode="json")
    item = treatments_repository.get_by_id(db, treatment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    item = treatments_repository.update(db, item, payload)
    return treatments_service.serialize(item)
