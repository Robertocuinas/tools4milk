"""Create a deterministic operational plan for the current Monday-Sunday week.

This is a development seed, run deliberately with ``python scripts/seed_weekly_shifts.py``.
It reuses active employees, zones and catalog tasks already in the database and
never removes existing shift history.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.enums import EstadoTarea, PrioridadTarea, TipoTurno  # noqa: E402
from app.models.tools4milk import (  # noqa: E402
    AsignacionTurno,
    Empleado,
    TareaCatalogo,
    TareaEjecucion,
    Turno,
    Zona,
)

_SEED_NAMESPACE = uuid5(NAMESPACE_URL, "tools4milk/seed-weekly-shifts/v1")
_SHIFTS = (
    (TipoTurno.MANANA, time(6), time(14)),
    (TipoTurno.TARDE, time(14), time(22)),
    (TipoTurno.NOCHE, time(22), time(6)),
)


def _stable_id(key: str) -> UUID:
    return uuid5(_SEED_NAMESPACE, key)


def seed_weekly_plan(
    db: Session,
    today: date,
    *,
    night_enabled: bool,
) -> dict[str, int]:
    """Ensure this week's shifts, assignments and linked tasks exist.

    Existing shift records are reused, and records with stable IDs are never
    duplicated on rerun. ``night_enabled`` must come from the persisted farm
    configuration at the call site.
    """
    employees = db.scalars(
        select(Empleado)
        .where(Empleado.activo.is_(True), Empleado.fecha_baja.is_(None))
        .order_by(Empleado.id)
    ).all()
    zones = db.scalars(select(Zona).where(Zona.activa.is_(True)).order_by(Zona.id)).all()
    catalog = db.scalars(
        select(TareaCatalogo).where(TareaCatalogo.activa.is_(True)).order_by(TareaCatalogo.codigo, TareaCatalogo.id)
    ).all()
    if not employees or not zones or not catalog:
        return {"turnos": 0, "asignaciones": 0, "tareas": 0}

    start = today - timedelta(days=today.weekday())
    existing_turns = {
        (turno.fecha, turno.tipo_turno): turno
        for turno in db.scalars(
            select(Turno).where(Turno.fecha >= start, Turno.fecha < start + timedelta(days=7))
        ).all()
    }
    assignment_pairs = set(
        db.execute(select(AsignacionTurno.turno_id, AsignacionTurno.empleado_id)).all()
    )
    existing_assignment_ids = set(db.scalars(select(AsignacionTurno.id)).all())
    existing_task_ids = set(db.scalars(select(TareaEjecucion.id)).all())

    created_shifts = created_assignments = created_tasks = 0
    slot_index = 0
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)

    for day_index in range(7):
        shift_date = start + timedelta(days=day_index)
        for shift_type, start_time, end_time in _SHIFTS:
            if shift_type is TipoTurno.NOCHE and not night_enabled:
                continue

            turn_key = f"{shift_date.isoformat()}/{shift_type.value}"
            turno = existing_turns.get((shift_date, shift_type))
            if turno is None:
                turno = Turno(
                    id=_stable_id(f"turno/{turn_key}"),
                    fecha=shift_date,
                    tipo_turno=shift_type,
                    hora_inicio=start_time,
                    hora_fin=end_time,
                    notas=f"seed-weekly-shifts:{turn_key}",
                )
                db.add(turno)
                db.flush()
                existing_turns[(shift_date, shift_type)] = turno
                created_shifts += 1

            employee = employees[slot_index % len(employees)]
            preferred_zone = next((zone for zone in zones if zone.id == employee.zona_principal_id), None)
            zone = preferred_zone or zones[slot_index % len(zones)]
            assignment_id = _stable_id(f"asignacion/{turn_key}/{employee.id}")
            if (turno.id, employee.id) not in assignment_pairs and assignment_id not in existing_assignment_ids:
                db.add(
                    AsignacionTurno(
                        id=assignment_id,
                        turno_id=turno.id,
                        empleado_id=employee.id,
                        zona_id=zone.id,
                        rol=employee.rol,
                    )
                )
                assignment_pairs.add((turno.id, employee.id))
                existing_assignment_ids.add(assignment_id)
                created_assignments += 1

            task_id = _stable_id(f"tarea/{turn_key}")
            if task_id not in existing_task_ids:
                catalog_item = catalog[slot_index % len(catalog)]
                plan_time = datetime.combine(shift_date, start_time, tzinfo=timezone.utc)
                status = (EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO, EstadoTarea.COMPLETADA)[slot_index % 3]
                task = TareaEjecucion(
                    id=task_id,
                    catalogo_id=catalog_item.id,
                    empleado_id=employee.id,
                    zona_id=zone.id,
                    estado=status,
                    prioridad=PrioridadTarea.NORMAL,
                    ts_planificada=plan_time,
                    creado_en=now,
                    notas=f"seed-weekly-shifts:{turn_key}",
                )
                if status in {EstadoTarea.EN_CURSO, EstadoTarea.COMPLETADA}:
                    task.ts_inicio = plan_time
                if status is EstadoTarea.COMPLETADA:
                    task.ts_fin = plan_time + timedelta(minutes=catalog_item.duracion_estimada_min or 30)
                db.add(task)
                existing_task_ids.add(task_id)
                created_tasks += 1

            slot_index += 1

    db.commit()
    return {"turnos": created_shifts, "asignaciones": created_assignments, "tareas": created_tasks}


def read_night_setting(db: Session) -> bool:
    """Read the persistent setting when available; preserve legacy default true.

    Uses the shared settings service and defaults to enabled only for legacy
    databases where the settings migration has not been applied.
    """
    from app.services.settings_service import night_shift_enabled

    try:
        return night_shift_enabled(db)
    except Exception as exc:
        # Until the persistent settings migration lands, retain the existing
        # enabled behavior. This narrowly targets a missing table/schema.
        message = str(exc).lower()
        if "configuracion_sistema" in message and ("does not exist" in message or "no such table" in message):
            db.rollback()
            return True
        raise


def main() -> None:
    db = SessionLocal()
    try:
        night_enabled = read_night_setting(db)
        counts = seed_weekly_plan(db, date.today(), night_enabled=night_enabled)
        print(
            "Plan semanal asegurado: "
            f"{counts['turnos']} turnos, {counts['asignaciones']} asignaciones, "
            f"{counts['tareas']} tareas nuevos. Noche habilitada: {night_enabled}."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
