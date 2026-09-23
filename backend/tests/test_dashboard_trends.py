"""Tests de GET /api/v1/dashboard/severity-trend (Centro de control).

Los tests de recuento exacto llaman al servicio con un `now` fijo en 2001,
fecha en la que no hay datos sembrados ni de migraciones, para que los
resultados no dependan del contenido previo de la base de datos de test.
Los tests HTTP comparan el antes/después de sembrar registros "de hoy".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models.tools4milk import Alerta, Incidencia
from app.services import dashboard_trends_service
from app.time_utils import utc_now

FARM_TZ = ZoneInfo(dashboard_trends_service.FARM_TIMEZONE)
FIXED_NOW = datetime(2001, 6, 15, 10, 0, tzinfo=timezone.utc)


def _local(day: date, hour: int = 12, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=FARM_TZ)


def _incident(db, severidad: str, ts: datetime) -> None:
    db.add(
        Incidencia(
            id=uuid.uuid4(),
            severidad=severidad,
            titulo=f"Incidencia test {severidad}",
            ts_apertura=ts,
            acciones=[],
        )
    )


def _alert(db, nivel: str, ts: datetime) -> None:
    db.add(Alerta(id=uuid.uuid4(), nivel=nivel, titulo=f"Alerta test {nivel}", ts_generacion=ts))


def test_zero_filled_days_without_data(db):
    result = dashboard_trends_service.severity_trend(db, 7, now=FIXED_NOW)

    assert result.hasta == date(2001, 6, 15)
    assert result.desde == date(2001, 6, 9)
    for series in (result.incidencias, result.alertas):
        assert [d.fecha for d in series.serie] == [date(2001, 6, 9) + timedelta(days=i) for i in range(7)]
        assert all(d.alta == d.media == d.baja == d.total == 0 for d in series.serie)
        assert series.totales.total == 0
    assert result.tendencia == "sin_datos"


def test_counts_per_severity_and_critica_grouped_into_alta(db):
    today = date(2001, 6, 15)
    _incident(db, "critica", _local(today))
    _incident(db, "alta", _local(today))
    _incident(db, "media", _local(today - timedelta(days=2)))
    _incident(db, "baja", _local(today - timedelta(days=6)))
    _alert(db, "critica", _local(today - timedelta(days=1)))
    _alert(db, "baja", _local(today - timedelta(days=1)))
    _alert(db, "baja", _local(today - timedelta(days=1)))
    # Fuera de la ventana de 7 días (cae en el periodo anterior).
    _incident(db, "alta", _local(today - timedelta(days=7)))
    # 00:30 hora local del día 15 = 22:30 UTC del día 14: debe contar como día 15.
    _alert(db, "media", _local(today, 0, 30))
    db.flush()

    result = dashboard_trends_service.severity_trend(db, 7, now=FIXED_NOW)
    inc = {d.fecha: d for d in result.incidencias.serie}
    ale = {d.fecha: d for d in result.alertas.serie}

    assert (inc[today].alta, inc[today].media, inc[today].baja, inc[today].total) == (2, 0, 0, 2)
    assert inc[today - timedelta(days=2)].media == 1
    assert inc[today - timedelta(days=6)].baja == 1
    assert result.incidencias.totales.model_dump() == {"alta": 2, "media": 1, "baja": 1, "total": 4, "criticas": 1}
    assert result.incidencias.total_periodo_anterior == 1

    assert (ale[today - timedelta(days=1)].alta, ale[today - timedelta(days=1)].baja) == (1, 2)
    assert ale[today].media == 1
    assert result.alertas.totales.model_dump() == {"alta": 1, "media": 1, "baja": 2, "total": 4, "criticas": 1}

    assert result.total_actual == 8
    assert result.total_anterior == 1
    assert result.tendencia == "empeorando"


def test_trend_improving_when_previous_period_has_more(db):
    today = date(2001, 6, 15)
    for offset in (8, 9, 10):
        _alert(db, "alta", _local(today - timedelta(days=offset)))
    _alert(db, "baja", _local(today))
    db.flush()

    result = dashboard_trends_service.severity_trend(db, 7, now=FIXED_NOW)
    assert result.total_actual == 1
    assert result.total_anterior == 3
    assert result.tendencia == "mejorando"


def test_endpoint_counts_new_records_today(client, db, auth_headers):
    before = client.get("/api/v1/dashboard/severity-trend", headers=auth_headers)
    assert before.status_code == 200
    body_before = before.json()
    assert body_before["days"] == 7
    assert len(body_before["incidencias"]["serie"]) == 7
    assert len(body_before["alertas"]["serie"]) == 7

    now = utc_now()
    _incident(db, "alta", now)
    _alert(db, "media", now)
    _alert(db, "baja", now)
    db.commit()

    after = client.get("/api/v1/dashboard/severity-trend", params={"days": 30}, headers=auth_headers)
    assert after.status_code == 200
    body = after.json()
    assert len(body["incidencias"]["serie"]) == 30
    assert body["hasta"] == now.astimezone(FARM_TZ).date().isoformat()

    last_inc_before = body_before["incidencias"]["serie"][-1]
    last_inc = body["incidencias"]["serie"][-1]
    last_ale_before = body_before["alertas"]["serie"][-1]
    last_ale = body["alertas"]["serie"][-1]
    assert last_inc["alta"] - last_inc_before["alta"] == 1
    assert last_ale["media"] - last_ale_before["media"] == 1
    assert last_ale["baja"] - last_ale_before["baja"] == 1


def test_days_param_validation(client, auth_headers):
    for bad in (0, 91, -3):
        response = client.get("/api/v1/dashboard/severity-trend", params={"days": bad}, headers=auth_headers)
        assert response.status_code == 422
    response = client.get("/api/v1/dashboard/severity-trend", params={"days": "abc"}, headers=auth_headers)
    assert response.status_code == 422


def test_requires_authentication(client):
    response = client.get("/api/v1/dashboard/severity-trend")
    assert response.status_code in (401, 403)
