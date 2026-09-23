"""Tablas analiticas de Predicciones y Calidad (agente A02, tareas T4/T7).

Cubre los endpoints de listado en bloque:
- GET /api/v1/predictions            -> una fila por animal, ordenada por riesgo
- GET /api/v1/lactations/quality/animals -> una fila por animal con score
y que los contratos existentes solo GANAN campos (compatibilidad).
"""

import uuid
from datetime import date, timedelta

from app.models.tools4milk import Animal, Lactacion, TratamientoActivo
from app.services import lactations_service, predictions_service


def _animal(db, crotal: str, nombre: str | None = None, estado: str = "produccion") -> Animal:
    animal = Animal(
        id=uuid.uuid4(),
        crotal_oficial=crotal,
        nombre=nombre,
        sexo="hembra",
        fecha_nacimiento=date(2020, 1, 1),
        raza="frisona",
        estado=estado,
        estado_reproductivo="vacia",
        fecha_entrada=date(2020, 1, 1),
    )
    db.add(animal)
    db.flush()
    return animal


def _lactacion(db, animal: Animal, *, rcs: int | None, grasa: float | None, proteina: float | None, total: float | None) -> Lactacion:
    lac = Lactacion(
        id=uuid.uuid4(),
        animal_id=animal.id,
        numero=1,
        fecha_parto=date.today() - timedelta(days=100),
        fecha_secado=None,
        produccion_total_kg=total,
        grasa_promedio=grasa,
        proteina_promedio=proteina,
        rcs_promedio=rcs,
    )
    db.add(lac)
    db.flush()
    return lac


def _seed(db) -> dict[str, Animal]:
    alto = _animal(db, "A02-ALTO", "Rubia")
    _lactacion(db, alto, rcs=150_000, grasa=3.9, proteina=3.3, total=9000)
    db.add(TratamientoActivo(
        id=uuid.uuid4(),
        animal_id=alto.id,
        farmaco="Antibiotico",
        dosis="10 ml",
        dias_tratamiento=5,
        fecha_inicio=date.today(),
        fecha_fin_prevista=date.today() + timedelta(days=5),
        activo=True,
        checkboxes=[],
    ))
    medio = _animal(db, "A02-MEDIO", "Pinta")
    _lactacion(db, medio, rcs=300_000, grasa=3.2, proteina=3.3, total=9000)
    bajo = _animal(db, "A02-BAJO", "Moura")
    _lactacion(db, bajo, rcs=100_000, grasa=4.0, proteina=3.4, total=9000)
    sin_lac = _animal(db, "A02-SINLAC")
    seca = _animal(db, "A02-SECA", estado="seca")
    db.commit()
    return {"alto": alto, "medio": medio, "bajo": bajo, "sin_lac": sin_lac, "seca": seca}


def _mias(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["crotal_oficial"].startswith("A02-")]


# ---------------------------------------------------------------------------
# Predicciones
# ---------------------------------------------------------------------------

def test_predictions_table_orders_by_risk_and_matches_single_prediction(client, auth_headers, db):
    animales = _seed(db)
    response = client.get("/api/v1/predictions", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()

    # Orden global alto -> medio -> bajo en toda la respuesta.
    orden = [predictions_service.ORDEN_RIESGO[r["riesgo"]] for r in rows]
    assert orden == sorted(orden)

    mias = {r["crotal_oficial"]: r for r in _mias(rows)}
    assert "A02-SECA" not in mias  # por defecto solo animales en produccion
    assert mias["A02-ALTO"]["riesgo"] == "alto"
    assert "Tratamiento activo" in mias["A02-ALTO"]["factores_riesgo"]
    assert "ACTIVE_TREATMENT" in mias["A02-ALTO"]["factores_riesgo_codigos"]
    assert mias["A02-MEDIO"]["riesgo"] == "medio"
    assert mias["A02-BAJO"]["riesgo"] == "bajo"

    # Coherencia con el endpoint individual (misma heuristica).
    single = client.get(f"/api/v1/predictions/{animales['medio'].id}", headers=auth_headers).json()
    fila = mias["A02-MEDIO"]
    assert fila["riesgo"] == single["riesgo_sanitario"]["riesgo_promedio"]
    assert fila["factores_riesgo_codigos"] == single["riesgo_sanitario"]["factores_riesgo_codigos"]
    assert fila["produccion_prevista"] == single["produccion"]["produccion_promedio_predicha"]
    assert fila["grasa"] == single["composicion"]["grasa"]["prediccion"]
    assert fila["proteina"] == single["composicion"]["proteina"]["prediccion"]
    assert fila["nombre"] == "Pinta"
    assert {"_mock", "tendencia_produccion", "origen_composicion"} <= set(fila)


def test_predictions_table_does_not_fake_composition_or_production(client, auth_headers, db):
    _seed(db)
    rows = client.get("/api/v1/predictions", headers=auth_headers).json()
    sin_lac = next(r for r in rows if r["crotal_oficial"] == "A02-SINLAC")
    # Sin lactacion ni lecturas: nada de ceros ni referencias genericas.
    assert sin_lac["produccion_prevista"] is None
    assert sin_lac["grasa"] is None
    assert sin_lac["proteina"] is None
    assert sin_lac["origen_composicion"] != "lactacion_activa"


def test_predictions_table_filters_and_validates_estado(client, auth_headers, db):
    _seed(db)
    rows = client.get("/api/v1/predictions", params={"estado": "seca"}, headers=auth_headers).json()
    assert [r["crotal_oficial"] for r in _mias(rows)] == ["A02-SECA"]
    assert client.get("/api/v1/predictions", params={"estado": "inventado"}, headers=auth_headers).status_code == 422


def test_predictions_table_requires_auth(client):
    # HTTPBearer de FastAPI responde 403 cuando falta la cabecera.
    assert client.get("/api/v1/predictions").status_code in (401, 403)
    assert client.get("/api/v1/lactations/quality/animals").status_code in (401, 403)


# ---------------------------------------------------------------------------
# Calidad
# ---------------------------------------------------------------------------

def test_quality_table_rows_and_score_rule(client, auth_headers, db):
    _seed(db)
    response = client.get("/api/v1/lactations/quality/animals", headers=auth_headers)
    assert response.status_code == 200
    mias = {r["crotal_oficial"]: r for r in _mias(response.json())}
    assert set(mias) == {"A02-ALTO", "A02-MEDIO", "A02-BAJO", "A02-SINLAC"}

    bajo = mias["A02-BAJO"]
    assert bajo["nombre"] == "Moura"
    assert bajo["grasa"] == 4.0 and bajo["proteina"] == 3.4 and bajo["rcs"] == 100_000
    assert bajo["produccion"] == round(9000 / 305, 1)
    assert bajo["dias_en_leche"] == 100
    assert bajo["score"] == 100
    # RCS >= 250k (-15) y grasa < 3.4 (-8) segun la regla existente.
    assert mias["A02-MEDIO"]["score"] == 77
    # Sin lactacion activa: sin datos, sin score inventado.
    sin_lac = mias["A02-SINLAC"]
    assert sin_lac["score"] is None and sin_lac["grasa"] is None and sin_lac["lactacion_id"] is None


def test_quality_score_rule_matches_previous_frontend_rule():
    def lac(rcs, grasa, proteina, total):
        return Lactacion(rcs_promedio=rcs, grasa_promedio=grasa, proteina_promedio=proteina, produccion_total_kg=total)

    assert lactations_service.quality_score(None) is None
    assert lactations_service.quality_score(lac(None, None, None, None)) is None
    assert lactations_service.quality_score(lac(450_000, 3.9, 3.3, 9000)) == 70
    # Produccion media < 20 L/dia (-12), proteina > 3.8 (-8)
    assert lactations_service.quality_score(lac(100_000, 3.9, 3.9, 305 * 15)) == 80
    # Todas las penalizaciones: 100-30-12-8-8
    assert lactations_service.quality_score(lac(400_000, 5.0, 2.5, 305 * 10)) == 42


def test_existing_lactation_contracts_only_gain_fields(client, auth_headers, db):
    _seed(db)
    lactations = client.get("/api/v1/lactations", params={"activa": True, "limit": 500}, headers=auth_headers).json()
    assert lactations
    assert {
        "id", "animal_id", "numero_lactacion", "fecha_inicio", "dias_transcurridos",
        "produccion_promedio", "grasa_promedio", "proteina_promedio", "rcs_promedio", "activa", "score_calidad",
    } <= set(lactations[0])
    summary = client.get("/api/v1/lactations/quality/summary", headers=auth_headers).json()
    assert {"lactaciones_activas", "produccion_promedio", "animales_en_control", "score_promedio"} <= set(summary)
