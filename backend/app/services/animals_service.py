from typing import Any

from sqlalchemy.orm import Session

from app.models.tools4milk import Animal, MovimientoAnimal
from app.repositories import animals_repository


def serialize(
    a: Animal,
    produccion_promedio: float | None = None,
    tratamientos_activos: int = 0,
) -> dict[str, Any]:
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
        # Campos de genealogia (solo añadidos; el resto del contrato no cambia).
        "madre_id": str(a.madre_id) if a.madre_id else None,
        "padre_id": str(a.padre_id) if a.padre_id else None,
        "padre_crotal": a.padre_crotal,
        "padre_nombre": a.padre_nombre,
        "produccion_promedio": produccion_promedio,
        "tratamientos_activos": tratamientos_activos,
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


# ---------------------------------------------------------------------------
# Genealogia
# ---------------------------------------------------------------------------

def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _relative(a: Animal, relacion: str) -> dict[str, Any]:
    """Ascendiente registrado en la explotacion (enlazable a su ficha)."""
    return {
        "id": str(a.id),
        "nombre": a.nombre,
        "crotal": a.crotal_oficial,
        "relacion": relacion,
        "registrado": True,
        "sexo": _enum_value(a.sexo),
        "raza": a.raza,
        "fecha_nacimiento": a.fecha_nacimiento.isoformat() if a.fecha_nacimiento else None,
    }


def _external_sire(a: Animal, relacion: str) -> dict[str, Any] | None:
    """Toro externo (no dado de alta en animales), p.ej. semental de IA.
    Solo se devuelve si hay algun dato real: nunca se inventa."""
    if not a.padre_crotal and not a.padre_nombre:
        return None
    return {
        "id": None,
        "nombre": a.padre_nombre,
        "crotal": a.padre_crotal,
        "relacion": relacion,
        "registrado": False,
        "sexo": "macho",
        "raza": None,
        "fecha_nacimiento": None,
    }


def _parents_of(
    a: Animal | None, by_id: dict, madre_rel: str, padre_rel: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if a is None:
        return None, None
    madre = by_id.get(a.madre_id) if a.madre_id else None
    padre = by_id.get(a.padre_id) if a.padre_id else None
    return (
        _relative(madre, madre_rel) if madre else None,
        _relative(padre, padre_rel) if padre else _external_sire(a, padre_rel),
    )


def build_genealogy(db: Session, animal: Animal) -> dict[str, Any]:
    """Genealogia hasta abuelos con 2 consultas (padres y luego abuelos),
    ademas de la del propio animal que ya hizo el router."""
    parents = animals_repository.get_many_by_ids(db, [animal.madre_id, animal.padre_id])
    madre_animal = parents.get(animal.madre_id) if animal.madre_id else None
    padre_animal = parents.get(animal.padre_id) if animal.padre_id else None

    grand_ids = []
    for p in (madre_animal, padre_animal):
        if p is not None:
            grand_ids.extend([p.madre_id, p.padre_id])
    grandparents = animals_repository.get_many_by_ids(db, grand_ids)

    madre, padre = _parents_of(animal, parents, "madre", "padre")
    abuela_materna, abuelo_materno = _parents_of(madre_animal, grandparents, "abuela_materna", "abuelo_materno")
    abuela_paterna, abuelo_paterno = _parents_of(padre_animal, grandparents, "abuela_paterna", "abuelo_paterno")

    return {
        "animal_id": str(animal.id),
        "madre": madre,
        "padre": padre,
        "abuela_materna": abuela_materna,
        "abuelo_materno": abuelo_materno,
        "abuela_paterna": abuela_paterna,
        "abuelo_paterno": abuelo_paterno,
    }
