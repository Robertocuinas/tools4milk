"""Evolución diaria de alertas e incidencias por criticidad (Centro de control).

Decisiones:
- Día de referencia: calendario local de la explotación (Europe/Madrid). La
  base de datos guarda todo en UTC (app/time_utils.utc_now) y no existe otra
  convención de zona horaria en el backend; agrupar por día UTC haría que una
  incidencia abierta a las 00:30 hora local cayera en el día anterior.
- Mapeo de criticidad a las tres bandas de la gráfica: "critica" se agrupa en
  "alta" (misma urgencia operativa: rojo). Se expone además el recuento de
  críticas como subconjunto de "alta" en los totales.
- Incidencias se fechan por ts_apertura (creación); alertas por
  ts_generacion.
- La agregación se hace en SQL (GROUP BY día, nivel) sobre una ventana de
  2*days días para obtener en una sola consulta por tabla el periodo actual
  y el anterior (para el indicador de tendencia). Los días sin registros se
  rellenan con ceros en Python.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.models.tools4milk import Alerta, Incidencia
from app.schemas.dashboard import (
    SeverityDayCount,
    SeveritySeries,
    SeverityTotals,
    SeverityTrendResponse,
)
from app.time_utils import utc_now

FARM_TIMEZONE = "Europe/Madrid"

# Nivel de origen (incidencias.severidad / alertas.nivel) -> banda de la gráfica.
SEVERITY_BAND = {
    "critica": "alta",
    "alta": "alta",
    "media": "media",
    "baja": "baja",
}


def _level_value(level: Any) -> str:
    return getattr(level, "value", level)


def _daily_counts(
    db: Session, ts_column: Any, level_column: Any, start_utc: datetime, end_utc: datetime
) -> list[tuple[date, str, int]]:
    dia = cast(func.timezone(FARM_TIMEZONE, ts_column), Date).label("dia")
    rows = db.execute(
        select(dia, level_column.label("nivel"), func.count().label("total"))
        .where(ts_column >= start_utc, ts_column < end_utc)
        .group_by(dia, level_column)
    ).all()
    return [(r.dia, _level_value(r.nivel), int(r.total)) for r in rows]


def _build_series(
    rows: list[tuple[date, str, int]], desde: date, hasta: date
) -> SeveritySeries:
    by_day: dict[date, SeverityDayCount] = {}
    current = desde
    while current <= hasta:
        by_day[current] = SeverityDayCount(fecha=current)
        current += timedelta(days=1)

    totales = SeverityTotals()
    previous_total = 0
    for dia, nivel, total in rows:
        band = SEVERITY_BAND.get(nivel)
        if band is None:
            continue
        if dia < desde:
            previous_total += total
            continue
        day = by_day.get(dia)
        if day is None:
            continue
        setattr(day, band, getattr(day, band) + total)
        day.total += total
        setattr(totales, band, getattr(totales, band) + total)
        totales.total += total
        if nivel == "critica":
            totales.criticas += total

    return SeveritySeries(
        serie=list(by_day.values()),
        totales=totales,
        total_periodo_anterior=previous_total,
    )


def severity_trend(db: Session, days: int, now: datetime | None = None) -> SeverityTrendResponse:
    tz = ZoneInfo(FARM_TIMEZONE)
    local_today = (now or utc_now()).astimezone(tz).date()
    desde = local_today - timedelta(days=days - 1)
    previous_desde = desde - timedelta(days=days)
    # Límites de la ventana como medianoches locales convertidas a UTC.
    start_utc = datetime.combine(previous_desde, time.min, tzinfo=tz)
    end_utc = datetime.combine(local_today + timedelta(days=1), time.min, tzinfo=tz)

    incidencias = _build_series(
        _daily_counts(db, Incidencia.ts_apertura, Incidencia.severidad, start_utc, end_utc),
        desde,
        local_today,
    )
    alertas = _build_series(
        _daily_counts(db, Alerta.ts_generacion, Alerta.nivel, start_utc, end_utc),
        desde,
        local_today,
    )

    total_actual = incidencias.totales.total + alertas.totales.total
    total_anterior = incidencias.total_periodo_anterior + alertas.total_periodo_anterior
    if total_actual == 0 and total_anterior == 0:
        tendencia = "sin_datos"
    elif total_actual < total_anterior:
        tendencia = "mejorando"
    elif total_actual > total_anterior:
        tendencia = "empeorando"
    else:
        tendencia = "estable"

    return SeverityTrendResponse(
        days=days,
        desde=desde,
        hasta=local_today,
        zona_horaria=FARM_TIMEZONE,
        incidencias=incidencias,
        alertas=alertas,
        tendencia=tendencia,
        total_actual=total_actual,
        total_anterior=total_anterior,
    )
