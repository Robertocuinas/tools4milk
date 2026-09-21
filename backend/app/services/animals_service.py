from typing import Any
from app.models.tools4milk import Animal, MovimientoAnimal


def serialize(a: Animal) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "crotal_oficial": a.crotal_oficial,
        "nombre": a.nombre,
        "sexo": a.sexo,
        "fecha_nacimiento": a.fecha_nacimiento.isoformat() if a.fecha_nacimiento else None,
        "raza": a.raza,
        "estado": a.estado,
        "estado_reproductivo": a.estado_reproductivo,
        "fecha_entrada": a.fecha_entrada.isoformat() if a.fecha_entrada else None,
        "fecha_baja": a.fecha_baja.isoformat() if a.fecha_baja else None,
        "zona_id": str(a.zona_id) if getattr(a, "zona_id", None) else None,
        "motivo_baja": a.motivo_baja,
        "notas": a.notas,
    }


def serialize_movimiento(m: MovimientoAnimal) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "animal_id": str(m.animal_id),
        "zona_origen_id": str(m.zona_origen_id) if m.zona_origen_id else None,
        "zona_destino_id": str(m.zona_destino_id),
        "fecha": m.fecha.isoformat() if m.fecha else None,
        "motivo": m.motivo,
        "empleado_id": str(m.empleado_id) if m.empleado_id else None,
        "notas": m.notas,
    }
