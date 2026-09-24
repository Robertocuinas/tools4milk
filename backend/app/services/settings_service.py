from sqlalchemy.orm import Session

from app.repositories import settings_repository


def night_shift_enabled(db: Session) -> bool:
    config = settings_repository.get_or_default(db)
    # Existing installations stay enabled until the new migration is applied.
    return config.turno_noche_habilitado if config is not None else True


def serialize_farm_settings(db: Session) -> dict[str, bool]:
    return {"turno_noche_habilitado": night_shift_enabled(db)}


def update_night_shift(db: Session, enabled: bool) -> dict[str, bool]:
    config = settings_repository.set_night_shift_enabled(db, enabled)
    return {"turno_noche_habilitado": config.turno_noche_habilitado}
