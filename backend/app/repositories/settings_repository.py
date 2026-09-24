from sqlalchemy.orm import Session

from app.models.tools4milk import ConfiguracionSistema


def get_or_default(db: Session) -> ConfiguracionSistema | None:
    """Return persisted configuration; None means an unmigrated legacy DB."""
    return db.get(ConfiguracionSistema, 1)


def set_night_shift_enabled(db: Session, enabled: bool) -> ConfiguracionSistema:
    config = db.get(ConfiguracionSistema, 1)
    if config is None:
        config = ConfiguracionSistema(id=1, turno_noche_habilitado=enabled)
        db.add(config)
    else:
        config.turno_noche_habilitado = enabled
    db.commit()
    db.refresh(config)
    return config
