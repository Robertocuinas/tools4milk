from typing import Any
from app.models.tools4milk import AnaliticaTanque


def serialize(a: AnaliticaTanque) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "fecha": a.fecha.isoformat() if a.fecha else None,
        "lote": a.lote,
        "volumen_l": float(a.volumen_l) if a.volumen_l is not None else None,
        "grasa_pct": float(a.grasa_pct) if a.grasa_pct is not None else None,
        "proteina_pct": float(a.proteina_pct) if a.proteina_pct is not None else None,
        "lactosa_pct": float(a.lactosa_pct) if a.lactosa_pct is not None else None,
        "rcs_x1000": a.rcs_x1000,
        "bacteriologia_ufc_ml": a.bacteriologia_ufc_ml,
        "urea_mg_dl": float(a.urea_mg_dl) if a.urea_mg_dl is not None else None,
        "temperatura_c": float(a.temperatura_c) if a.temperatura_c is not None else None,
        "punto_criscopico": float(a.punto_criscopico) if a.punto_criscopico is not None else None,
        "inhibidores": a.inhibidores,
        "laboratorio": a.laboratorio,
        "observaciones": a.observaciones,
    }
