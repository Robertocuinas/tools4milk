from datetime import date
from typing import Any

from app.models.tools4milk import Animal, Lactacion

# ---------------------------------------------------------------------------
# Score de calidad (0-100) por lactacion.
# ---------------------------------------------------------------------------
# NO es una formula nueva: es la regla que ya aplicaba la pantalla de Calidad
# (frontend quality/page.tsx, funcion qualityScore) portada tal cual al
# backend para que la tabla pueda ordenarse por ella y todos los clientes
# usen la misma. Parte de 100 y resta penalizaciones:
#   - RCS >= 400.000 cel/mL: -30 ; RCS >= 250.000: -15 (250.000 coincide con
#     el umbral "scc_alto" de alertas_umbrales)
#   - produccion media > 0 y < 20 L/dia: -12
#   - grasa fuera de 3,4-4,6 %: -8
#   - proteina fuera de 3,0-3,8 %: -8
# Unica diferencia: si la lactacion no tiene NINGUN dato de calidad ni de
# produccion se devuelve None (antes salia 100, un "perfecto" sin datos).
SCORE_RCS_CRITICO = 400_000
SCORE_RCS_VIGILANCIA = 250_000
SCORE_PRODUCCION_MIN = 20
SCORE_GRASA_RANGO = (3.4, 4.6)
SCORE_PROTEINA_RANGO = (3.0, 3.8)


def _produccion_media(l: Lactacion) -> float | None:
    return round(float(l.produccion_total_kg) / 305, 1) if l.produccion_total_kg else None


def quality_score(l: Lactacion | None) -> int | None:
    if l is None:
        return None
    rcs = l.rcs_promedio
    produccion = _produccion_media(l)
    grasa = float(l.grasa_promedio) if l.grasa_promedio is not None else None
    proteina = float(l.proteina_promedio) if l.proteina_promedio is not None else None
    if rcs is None and produccion is None and grasa is None and proteina is None:
        return None

    score = 100
    if rcs is not None and rcs >= SCORE_RCS_CRITICO:
        score -= 30
    elif rcs is not None and rcs >= SCORE_RCS_VIGILANCIA:
        score -= 15
    if produccion is not None and 0 < produccion < SCORE_PRODUCCION_MIN:
        score -= 12
    if grasa and (grasa < SCORE_GRASA_RANGO[0] or grasa > SCORE_GRASA_RANGO[1]):
        score -= 8
    if proteina and (proteina < SCORE_PROTEINA_RANGO[0] or proteina > SCORE_PROTEINA_RANGO[1]):
        score -= 8
    return max(0, min(100, score))


def serialize(l: Lactacion) -> dict[str, Any]:
    activa = l.fecha_secado is None
    dias = None
    if l.fecha_parto:
        ref = l.fecha_secado or date.today()
        dias = (ref - l.fecha_parto).days

    return {
        "id": str(l.id),
        "animal_id": str(l.animal_id),
        "numero_lactacion": l.numero,
        "fecha_inicio": l.fecha_parto.isoformat() if l.fecha_parto else None,
        "fecha_fin": l.fecha_secado.isoformat() if l.fecha_secado else None,
        "dias_transcurridos": dias,
        "produccion_promedio": _produccion_media(l),
        "produccion_total": float(l.produccion_total_kg) if l.produccion_total_kg else None,
        "grasa_promedio": float(l.grasa_promedio) if l.grasa_promedio is not None else None,
        "proteina_promedio": float(l.proteina_promedio) if l.proteina_promedio is not None else None,
        "rcs_promedio": l.rcs_promedio,
        "activa": activa,
        "score_calidad": quality_score(l),
    }


def quality_row(animal: Animal, l: Lactacion | None) -> dict[str, Any]:
    """Fila de la tabla de Calidad (animal + lactacion activa, si la hay)."""
    dias = None
    if l is not None and l.fecha_parto:
        dias = ((l.fecha_secado or date.today()) - l.fecha_parto).days
    estado = animal.estado.value if hasattr(animal.estado, "value") else animal.estado
    return {
        "animal_id": str(animal.id),
        "crotal_oficial": animal.crotal_oficial,
        "nombre": animal.nombre,
        "raza": animal.raza,
        "estado": estado,
        "lactacion_id": str(l.id) if l is not None else None,
        "numero_lactacion": l.numero if l is not None else None,
        "dias_en_leche": dias,
        "grasa": float(l.grasa_promedio) if l is not None and l.grasa_promedio is not None else None,
        "proteina": float(l.proteina_promedio) if l is not None and l.proteina_promedio is not None else None,
        "produccion": _produccion_media(l) if l is not None else None,
        "produccion_total": float(l.produccion_total_kg) if l is not None and l.produccion_total_kg else None,
        "rcs": l.rcs_promedio if l is not None else None,
        "score": quality_score(l),
    }


def quality_summary(lactaciones: list[Lactacion]) -> dict[str, Any]:
    if not lactaciones:
        return {
            "lactaciones_activas": 0,
            "produccion_promedio": None,
            "grasa_promedio": None,
            "proteina_promedio": None,
            "rcs_promedio": None,
            "animales_en_control": 0,
            "score_promedio": None,
        }
    return {
        "lactaciones_activas": len(lactaciones),
        "produccion_promedio": round(
            sum(float(l.produccion_total_kg or 0) / 305 for l in lactaciones) / len(lactaciones),
            1,
        ),
        "grasa_promedio": round(sum(float(l.grasa_promedio) for l in lactaciones if l.grasa_promedio) / max(1, sum(1 for l in lactaciones if l.grasa_promedio)), 2) or None,
        "proteina_promedio": round(sum(float(l.proteina_promedio) for l in lactaciones if l.proteina_promedio) / max(1, sum(1 for l in lactaciones if l.proteina_promedio)), 2) or None,
        "rcs_promedio": round(sum(l.rcs_promedio for l in lactaciones if l.rcs_promedio) / max(1, sum(1 for l in lactaciones if l.rcs_promedio))) if any(l.rcs_promedio for l in lactaciones) else None,
        "animales_en_control": len({str(l.animal_id) for l in lactaciones}),
        "score_promedio": _score_promedio(lactaciones),
    }


def _score_promedio(lactaciones: list[Lactacion]) -> int | None:
    scores = [s for s in (quality_score(l) for l in lactaciones) if s is not None]
    return round(sum(scores) / len(scores)) if scores else None
