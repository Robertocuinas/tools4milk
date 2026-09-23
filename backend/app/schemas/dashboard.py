"""Esquemas de respuesta del Centro de control (dashboard).

Se mantienen fuera de app/schemas/api.py para no mezclar los contratos
nuevos del dashboard con los esquemas compartidos del resto de routers.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class SeverityDayCount(BaseModel):
    """Recuento de un día (calendario local de la explotación) por criticidad.

    `alta` incluye los registros de nivel "critica" (ver
    dashboard_trends_service: la gráfica solo muestra tres bandas).
    """

    fecha: date
    alta: int = 0
    media: int = 0
    baja: int = 0
    total: int = 0


class SeverityTotals(BaseModel):
    alta: int = 0
    media: int = 0
    baja: int = 0
    total: int = 0
    # Subconjunto de `alta` que en origen era "critica". Se expone para que
    # la interfaz pueda aclararlo sin perder la agrupación en tres niveles.
    criticas: int = 0


class SeveritySeries(BaseModel):
    serie: list[SeverityDayCount]
    totales: SeverityTotals
    # Total del periodo inmediatamente anterior de la misma longitud.
    total_periodo_anterior: int = 0


class SeverityTrendResponse(BaseModel):
    days: int = Field(..., ge=1, le=90)
    desde: date
    hasta: date
    zona_horaria: str
    incidencias: SeveritySeries
    alertas: SeveritySeries
    # Comparación (incidencias + alertas) del periodo actual frente al
    # anterior. "sin_datos" cuando ambos periodos están a cero.
    tendencia: Literal["mejorando", "empeorando", "estable", "sin_datos"]
    total_actual: int = 0
    total_anterior: int = 0
