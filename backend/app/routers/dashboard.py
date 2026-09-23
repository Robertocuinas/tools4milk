from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import EstadoAnimal, NivelAlerta, NivelSeveridad
from app.models.tools4milk import Alerta, Animal, Incidencia, TratamientoActivo, Zona
from app.routers.deps import DbSession
from app.schemas.dashboard import OperationalSummaryResponse, SeverityTrendResponse
from app.security import get_current_user
from app.services import dashboard_trends_service

router = APIRouter(prefix="/api/v1", tags=["Frontend Core"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard/summary")
def dashboard_summary(db: DbSession) -> dict[str, Any]:
    # Este payload legacy se conserva, pero sus KPI operativos reutilizan el
    # agregado que consumiran Control e Informes.
    operational = dashboard_trends_service.operational_summary(db)
    pending_alerts = db.scalars(select(Alerta).where(Alerta.activa.is_(True))).all()
    incidencias_abiertas = select(func.count()).select_from(Incidencia).where(
        Incidencia.estado.in_(["abierta", "en_gestion"])
    )
    return {
        "alertas": {
            "total_pendientes": len(pending_alerts),
            # NivelAlerta incluye "critica" desde la auditoria
            # post-implementacion (hallazgo 3.6); antes este campo era un 0
            # fijo porque el enum solo tenia baja/media/alta.
            "criticas": len([a for a in pending_alerts if a.nivel == NivelAlerta.CRITICA]),
            "altas": len([a for a in pending_alerts if a.nivel == "alta"]),
        },
        "tareas": {
            "programadas": operational.tareas.programadas,
            "ejecutadas": operational.tareas.ejecutadas,
            "retrasadas": operational.tareas.retrasadas,
        },
        "animales": {
            "activos": db.scalar(select(func.count()).select_from(Animal).where(Animal.estado != EstadoAnimal.BAJA)) or 0,
            "por_zona": _animals_by_zone(db),
        },
        "tratamientos": {
            "activos": db.scalar(select(func.count()).select_from(TratamientoActivo).where(TratamientoActivo.activo.is_(True))) or 0,
        },
        # T4 (segunda pasada, ver docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md):
        # el dashboard mostraba "incidencias activas" derivandolo del
        # ultimo lote de solo 5 incidencias (api.incidents({limit: 5})).
        # Con el dataset de demostracion (~6 incidencias totales) coincidia
        # casi siempre con el total real; con el dataset realista (100+)
        # se volvio enganoso — mostraba "0 activas" habiendo decenas
        # abiertas, solo porque ninguna de las 5 mas recientes lo estaba.
        # Se añade aqui un agregado real sobre toda la tabla.
        "incidencias": {
            "abiertas": operational.incidencias.abiertas,
            "criticas": operational.incidencias.criticas,
            "altas": db.scalar(incidencias_abiertas.where(Incidencia.severidad == NivelSeveridad.ALTA.value)) or 0,
        },
    }


@router.get("/dashboard/operational-summary", response_model=OperationalSummaryResponse)
def dashboard_operational_summary(db: DbSession) -> OperationalSummaryResponse:
    """Estado actual compartido por los KPI de Control e Informes.

    Es aditivo: ``/dashboard/summary`` mantiene su contrato existente para
    cualquier cliente que aÃºn lo consuma.
    """
    return dashboard_trends_service.operational_summary(db)


@router.get("/dashboard/severity-trend", response_model=SeverityTrendResponse)
def dashboard_severity_trend(
    db: DbSession,
    days: int = Query(7, ge=1, le=90, description="Dias a mostrar (el frontend usa 7 o 30)"),
) -> SeverityTrendResponse:
    # Evolucion diaria de incidencias (ts_apertura) y alertas (ts_generacion)
    # agrupadas en tres bandas de criticidad (critica se suma a alta). Ver
    # app/services/dashboard_trends_service.py para el detalle del calculo.
    return dashboard_trends_service.severity_trend(db, days)


def _animals_by_zone(db: Session) -> list[dict[str, Any]]:
    # Zonas con al menos un animal activo. Es naming-agnóstico: funciona con cualquier
    # convención de nombres de zona presente en la base de datos (p. ej. "Nave",
    # "Boxes de terneros", "Zona de recria") y excluye de forma natural las zonas sin
    # animales (Oficina, General, Silos, etc.) al usar un INNER JOIN.
    rows = (
        db.execute(
            select(Zona.id, Zona.nombre, func.count(Animal.id).label("total"))
            .join(Animal, (Animal.zona_id == Zona.id) & (Animal.estado != EstadoAnimal.BAJA))
            .group_by(Zona.id, Zona.nombre)
            .order_by(func.count(Animal.id).desc(), Zona.nombre)
        ).all()
    )
    return [{"zona_id": str(r.id), "nombre": r.nombre, "total": r.total} for r in rows]
