from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models import Usuario
from app.routers.deps import AdminOnly, DbSession
from app.security import get_current_user
from app.services import settings_service

router = APIRouter(prefix="/api/v1", tags=["configuración"])
UserDep = Annotated[Usuario, Depends(get_current_user)]


class FarmSettingsUpdate(BaseModel):
    turno_noche_habilitado: bool


@router.get("/farm-settings")
def get_farm_settings(db: DbSession, _user: UserDep) -> dict[str, bool]:
    return settings_service.serialize_farm_settings(db)


@router.put("/farm-settings")
def update_farm_settings(
    payload: FarmSettingsUpdate, db: DbSession, _user: AdminOnly
) -> dict[str, bool]:
    return settings_service.update_night_shift(db, payload.turno_noche_habilitado)
