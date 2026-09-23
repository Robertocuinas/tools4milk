"""Contrato y coherencia del agregado operativo compartido."""

from __future__ import annotations

import uuid
from datetime import date

from app.models.tools4milk import Alerta, Animal, Incidencia, Lactacion, TareaCatalogo, TareaEjecucion
from app.services import dashboard_trends_service
from app.time_utils import utc_now


def _animal(db, suffix: str, *, estado: str = "produccion") -> Animal:
    animal = Animal(
        id=uuid.uuid4(),
        crotal_oficial=f"OP{suffix[:4]}{uuid.uuid4().hex[:10]}",
        sexo="hembra",
        fecha_nacimiento=date(2021, 1, 1),
        estado=estado,
        fecha_entrada=date(2021, 1, 1),
    )
    db.add(animal)
    db.flush()
    return animal


def _catalog(db) -> TareaCatalogo:
    catalog = TareaCatalogo(
        id=uuid.uuid4(),
        codigo=f"OPS-{uuid.uuid4().hex[:12]}",
        nombre="Tarea operativa de prueba",
    )
    db.add(catalog)
    db.flush()
    return catalog


def test_operational_summary_counts_current_states_and_unique_animal_alerts(db):
    before = dashboard_trends_service.operational_summary(db)
    catalog = _catalog(db)
    now = utc_now()
    alert_animal = _animal(db, "ALERT")
    no_alert_animal = _animal(db, "NO-ALERT")

    db.add_all(
        [
            Incidencia(id=uuid.uuid4(), titulo="CrÃ­tica abierta", severidad="critica", estado="abierta", ts_apertura=now, acciones=[]),
            Incidencia(id=uuid.uuid4(), titulo="En gestiÃ³n", severidad="media", estado="en_gestion", ts_apertura=now, acciones=[]),
            Incidencia(id=uuid.uuid4(), titulo="CrÃ­tica cerrada", severidad="critica", estado="cerrada", ts_apertura=now, acciones=[]),
            TareaEjecucion(id=uuid.uuid4(), catalogo_id=catalog.id, estado="pendiente", ts_planificada=now, creado_en=now),
            TareaEjecucion(id=uuid.uuid4(), catalogo_id=catalog.id, estado="vencida", ts_planificada=now, creado_en=now),
            TareaEjecucion(id=uuid.uuid4(), catalogo_id=catalog.id, estado="completada", ts_planificada=now, creado_en=now),
            # Dos alertas en el mismo animal: se clasifica una sola vez en
            # alta, que es su severidad mÃ¡xima.
            Alerta(id=uuid.uuid4(), animal_id=alert_animal.id, nivel="baja", titulo="Alerta baja", activa=True, ts_generacion=now),
            Alerta(id=uuid.uuid4(), animal_id=alert_animal.id, nivel="alta", titulo="Alerta alta", activa=True, ts_generacion=now),
        ]
    )
    db.flush()

    after = dashboard_trends_service.operational_summary(db)

    assert after.semantica == "estado_actual"
    assert after.incidencias.abiertas == before.incidencias.abiertas + 2
    assert after.incidencias.criticas == before.incidencias.criticas + 1
    assert after.incidencias.total == before.incidencias.total + 3
    assert after.tareas.programadas == before.tareas.programadas + 1
    assert after.tareas.retrasadas == before.tareas.retrasadas + 1
    assert after.tareas.ejecutadas == before.tareas.ejecutadas + 1
    assert after.alertas_animales.altas == before.alertas_animales.altas + 1
    assert after.alertas_animales.bajas == before.alertas_animales.bajas
    assert after.alertas_animales.total_con_alerta == before.alertas_animales.total_con_alerta + 1
    # De los dos animales nuevos, solo uno queda sin alerta activa.
    assert after.alertas_animales.sin_alerta == before.alertas_animales.sin_alerta + 1


def test_operational_summary_exposes_only_recorded_production(db):
    before = dashboard_trends_service.operational_summary(db)
    animal = _animal(db, "MILK")
    db.add(
        Lactacion(
            id=uuid.uuid4(),
            animal_id=animal.id,
            numero=1,
            fecha_parto=date(2026, 1, 1),
            produccion_total_kg=6100,
        )
    )
    db.flush()

    after = dashboard_trends_service.operational_summary(db)
    assert after.produccion is not None
    assert after.produccion.animales_en_control == (before.produccion.animales_en_control if before.produccion else 0) + 1
    expected = 20.0 if before.produccion is None else round(
        (before.produccion.litros_dia * before.produccion.animales_en_control + 20.0)
        / after.produccion.animales_en_control,
        1,
    )
    assert after.produccion.litros_dia == expected
    assert after.produccion.origen == "promedio_lactaciones_activas"


def test_operational_endpoint_and_legacy_summary_share_common_kpis(client, auth_headers):
    operational_response = client.get("/api/v1/dashboard/operational-summary", headers=auth_headers)
    legacy_response = client.get("/api/v1/dashboard/summary", headers=auth_headers)

    assert operational_response.status_code == 200
    assert legacy_response.status_code == 200
    operational = operational_response.json()
    legacy = legacy_response.json()
    assert set(operational) == {"semantica", "incidencias", "tareas", "alertas_animales", "produccion"}
    assert operational["semantica"] == "estado_actual"
    assert {"abiertas", "criticas", "total"} == set(operational["incidencias"])
    assert {"retrasadas", "programadas", "ejecutadas"} == set(operational["tareas"])
    assert legacy["tareas"] == operational["tareas"]
    assert legacy["incidencias"]["abiertas"] == operational["incidencias"]["abiertas"]
    assert legacy["incidencias"]["criticas"] == operational["incidencias"]["criticas"]
