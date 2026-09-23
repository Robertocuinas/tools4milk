"""Esquemas de respuesta del Centro de control (dashboard).

Se mantienen fuera de app/schemas/api.py para no mezclar los contratos
nuevos del dashboard con los esquemas compartidos del resto de routers.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class OperationalIncidents(BaseModel):
    """Incidencias del estado operativo actual.

    ``abiertas`` y ``criticas`` solo incluyen incidencias en ``abierta`` o
    ``en_gestion``. ``total`` conserva todos los registros de incidencias,
    incluidos los ya resueltos o cerrados, para poder rotularlo de forma
    inequÃ­voca como total histÃ³rico en una pantalla que lo necesite.
    """

    abiertas: int = 0
    criticas: int = 0
    total: int = 0


class OperationalTasks(BaseModel):
    """Tareas agrupadas por su estado actual, sin filtro temporal."""

    retrasadas: int = 0
    programadas: int = 0
    ejecutadas: int = 0


class AnimalAlertsBySeverity(BaseModel):
    """Animales activos con alertas activas, por su alerta mÃ¡s severa.

    Un animal con varias alertas se cuenta una sola vez, en la banda de mayor
    severidad. ``sin_alerta`` se calcula sobre animales activos y permite que
    un donut o barras representen el conjunto completo sin inventar datos.
    """

    criticas: int = 0
    altas: int = 0
    medias: int = 0
    bajas: int = 0
    total_con_alerta: int = 0
    sin_alerta: int = 0


class OperationalProduction(BaseModel):
    """ProducciÃ³n media disponible desde lactaciones activas registradas."""

    litros_dia: float = Field(..., ge=0)
    animales_en_control: int = Field(..., ge=1)
    origen: str = "promedio_lactaciones_activas"


class OperationalSummaryResponse(BaseModel):
    """Agregado Ãºnico para KPI de estado actual en Control e Informes.

    La producciÃ³n es ``null`` si no hay una lactaciÃ³n activa con producciÃ³n
    registrada; el endpoint nunca rellena una cifra estimada.
    """

    semantica: Literal["estado_actual"] = "estado_actual"
    incidencias: OperationalIncidents
    tareas: OperationalTasks
    alertas_animales: AnimalAlertsBySeverity
    produccion: OperationalProduction | None = None


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
