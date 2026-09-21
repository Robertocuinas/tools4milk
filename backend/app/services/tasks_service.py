from typing import Any
from app.enums import EstadoTarea, PrioridadTarea
from app.models.tools4milk import TareaEjecucion, TareaCatalogo
from app.repositories.tasks_repository import _map_estado_to_frontend


def serialize(ejecucion: TareaEjecucion, catalogo: TareaCatalogo | None) -> dict[str, Any]:
    estado_frontend = _map_estado_to_frontend(ejecucion.estado)
    prioridad = ejecucion.prioridad.value if isinstance(ejecucion.prioridad, PrioridadTarea) else ejecucion.prioridad
    tiempo_ejecucion_minutos = None
    if ejecucion.ts_inicio and ejecucion.ts_fin:
        tiempo_ejecucion_minutos = round((ejecucion.ts_fin - ejecucion.ts_inicio).total_seconds() / 60)
    return {
        "id": str(ejecucion.id),
        "tarea_catalogo_id": str(ejecucion.catalogo_id) if ejecucion.catalogo_id else None,
        "tarea_catalogo": {
            "id": str(catalogo.id) if catalogo else str(ejecucion.catalogo_id),
            "nombre": catalogo.nombre if catalogo else "Tarea",
            "categoria": None,
            "frecuencia": None,
            "zona_aplicable": None,
        } if catalogo or ejecucion.catalogo_id else None,
        "zona_id": str(ejecucion.zona_id) if ejecucion.zona_id else None,
        "empleado_id": str(ejecucion.empleado_id) if ejecucion.empleado_id else None,
        "fecha_programada": ejecucion.ts_planificada.isoformat() if ejecucion.ts_planificada else None,
        "fecha_ejecucion": ejecucion.ts_inicio.isoformat() if ejecucion.ts_inicio else None,
        "estado": estado_frontend,
        "prioridad": prioridad,
        "ejecutado_por": str(ejecucion.empleado_id) if ejecucion.empleado_id else None,
        "tiempo_ejecucion_minutos": tiempo_ejecucion_minutos,
        "resultado": None,
        "observaciones": ejecucion.notas,
        "problemas_encontrados": None,
        "acciones_correctivas": None,
        "checklist_completado": "true" if ejecucion.estado == EstadoTarea.COMPLETADA else "false",
        "checklist_datos": None,
        # es_urgente ahora depende de la prioridad explicita, no del estado:
        # antes se derivaba de estado==VENCIDA, lo que hacia imposible marcar
        # una tarea como urgente sin que ya estuviera retrasada. Ver
        # docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md, tarea T9.
        "es_urgente": ejecucion.prioridad == PrioridadTarea.URGENTE,
        "motivo_retraso": None,
        "requiere_seguimiento": ejecucion.estado in {EstadoTarea.VENCIDA},
        "fecha_seguimiento": None,
    }
