from typing import Any
from app.models.tools4milk import Incidencia


def serialize(i: Incidencia) -> dict[str, Any]:
    return {
        "id": str(i.id),
        "tipo": i.tipo,
        "subtipo": i.subtipo,
        "zona_id": str(i.zona_id) if i.zona_id else None,
        "maquinaria_id": str(i.maquinaria_id) if i.maquinaria_id else None,
        "animal_id": str(i.animal_id) if i.animal_id else None,
        # titulo y descripcion se exponen por separado (antes se fusionaban
        # aqui y el titulo real introducido por el usuario se perdia siempre
        # que hubiera descripcion). Ver docs/ESPECIFICACION_MEJORAS_
        # TOOLS4MILK.md, tarea T8.
        "titulo": i.titulo,
        "descripcion": i.descripcion or i.titulo,
        "prioridad": i.severidad,
        "estado": i.estado,
        "fecha_creacion": i.ts_apertura.isoformat() if i.ts_apertura else None,
        "fecha_resolucion": i.ts_cierre.isoformat() if i.ts_cierre else None,
        "resolucion": i.resolucion,
        "reportado_por": str(i.reportado_por) if i.reportado_por else None,
        "asignado_a": str(i.asignado_a) if i.asignado_a else None,
        "foto_url": i.foto_url,
        "acciones": i.acciones or [],
    }
