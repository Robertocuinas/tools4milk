from typing import Any
from app.models.tools4milk import Zona


def serialize(z: Zona) -> dict[str, Any]:
    return {
        "id": str(z.id),
        "nombre": z.nombre,
        "codigo": z.codigo,
        "descripcion": z.descripcion,
        "tipo": None,
        "tiene_pantalla_tv": z.tiene_pantalla_tv,
        "tiene_tablet": z.tiene_tablet,
        # zona_padre_id/orden/activa (T10.3): antes "activa" era un valor fijo
        # hardcodeado a True; ahora refleja el dato real de la BD.
        "zona_padre_id": str(z.zona_padre_id) if z.zona_padre_id else None,
        "orden": z.orden,
        "activa": z.activa,
    }
