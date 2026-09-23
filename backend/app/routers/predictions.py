from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.enums import EstadoAnimal
from app.routers.deps import DbSession
from app.schemas.analytics import PredictionTableRow
from app.security import get_current_user
from app.services import predictions_service

router = APIRouter(prefix="/api/v1", tags=["Frontend Core"], dependencies=[Depends(get_current_user)])


@router.get("/predictions", response_model=list[PredictionTableRow])
def predictions_table(
    db: DbSession,
    estado: EstadoAnimal | None = EstadoAnimal.PRODUCCION,
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
) -> list[dict[str, Any]]:
    """Tabla de predicciones: una fila resumen por animal, ordenada por
    riesgo (alto -> medio -> bajo). Evita una peticion por animal."""
    return predictions_service.list_predictions(
        db, estado=estado.value if estado else None, skip=skip, limit=limit
    )


@router.get("/predictions/{animal_id}")
def predictions(animal_id: str, db: DbSession) -> dict[str, Any]:
    animal = predictions_service.get_animal_or_none(db, animal_id)
    if animal is None:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    result = predictions_service.compute_prediction(db, animal)
    # Conserva el identificador tal como lo pidió el cliente (id o crotal).
    result["animal_id"] = animal_id
    return result


@router.get("/predictions/production/{animal_id}")
def production_prediction(animal_id: str, db: DbSession) -> dict[str, Any]:
    return predictions(animal_id, db)["produccion"]


@router.get("/predictions/composition/{animal_id}")
def composition_prediction(animal_id: str, db: DbSession) -> dict[str, Any]:
    return predictions(animal_id, db)["composicion"]


@router.get("/predictions/health-risk/{animal_id}")
def health_risk_prediction(animal_id: str, db: DbSession) -> dict[str, Any]:
    return predictions(animal_id, db)["riesgo_sanitario"]
