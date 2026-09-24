from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.enums import TipoTurno
from app.models.tools4milk import (
    AsignacionTurno,
    Empleado,
    TareaCatalogo,
    TareaEjecucion,
    Turno,
    Zona,
)
from scripts.seed_weekly_shifts import seed_weekly_plan


def _seed_inputs(db):
    zones = [
        Zona(id=uuid4(), nombre=f"Planner zone {i}", codigo=f"PZ{i}", activa=True)
        for i in range(2)
    ]
    employees = [
        Empleado(
            id=uuid4(),
            nombre=f"Planner {i}",
            apellidos="Worker",
            rol="auxiliar",
            zona_principal_id=zones[i].id,
            cualificaciones=[],
            activo=True,
            fecha_alta=date(2020, 1, 1),
        )
        for i in range(2)
    ]
    catalog = [
        TareaCatalogo(
            id=uuid4(),
            codigo=f"planner-{i}",
            nombre=f"Planner task {i}",
            activa=True,
            duracion_estimada_min=20,
        )
        for i in range(2)
    ]
    # La relación de zona principal se expresa por ID, no por relationship
    # ORM; persistimos primero las zonas para respetar la FK en PostgreSQL.
    db.add_all(zones)
    db.commit()
    db.add_all([*employees, *catalog])
    db.commit()
    return zones, employees, catalog


def test_weekly_plan_is_complete_linked_balanced_and_idempotent(db):
    zones, employees, catalog = _seed_inputs(db)
    today = date(2026, 9, 24)

    first = seed_weekly_plan(db, today, night_enabled=True)
    second = seed_weekly_plan(db, today, night_enabled=True)

    start = today - timedelta(days=today.weekday())
    turns = db.scalars(
        select(Turno).where(Turno.fecha >= start, Turno.fecha < start + timedelta(days=7))
    ).all()
    assignments = db.scalars(select(AsignacionTurno)).all()
    tasks = db.scalars(
        select(TareaEjecucion).where(TareaEjecucion.notas.like("seed-weekly-shifts:%"))
    ).all()

    assert first == {"turnos": 21, "asignaciones": 21, "tareas": 21}
    assert second == {"turnos": 0, "asignaciones": 0, "tareas": 0}
    assert len(turns) == 21
    assert Counter(turno.tipo_turno for turno in turns) == {
        TipoTurno.MANANA: 7,
        TipoTurno.TARDE: 7,
        TipoTurno.NOCHE: 7,
    }
    assert len(assignments) == len(tasks) == 21
    assigned_counts = Counter(row.empleado_id for row in assignments)
    assert max(assigned_counts.values()) - min(assigned_counts.values()) <= 1
    # El planificador reutiliza todos los datos operativos activos del entorno,
    # no solo las filas creadas por este fixture.
    valid_employee_ids = set(db.scalars(select(Empleado.id)).all())
    valid_zone_ids = set(db.scalars(select(Zona.id)).all())
    valid_catalog_ids = set(db.scalars(select(TareaCatalogo.id)).all())
    assert all(row.empleado_id in valid_employee_ids and row.zona_id in valid_zone_ids for row in assignments)
    assert all(
        task.empleado_id in valid_employee_ids
        and task.zona_id in valid_zone_ids
        and task.catalogo_id in valid_catalog_ids
        for task in tasks
    )


def test_weekly_plan_omits_night_when_setting_is_disabled(db):
    _seed_inputs(db)
    today = date(2026, 9, 24)

    counts = seed_weekly_plan(db, today, night_enabled=False)
    turns = db.scalars(select(Turno)).all()
    tasks = db.scalars(
        select(TareaEjecucion).where(TareaEjecucion.notas.like("seed-weekly-shifts:%"))
    ).all()

    assert counts == {"turnos": 14, "asignaciones": 14, "tareas": 14}
    assert len(turns) == 14
    assert all(turno.tipo_turno is not TipoTurno.NOCHE for turno in turns)
    assert len(tasks) == 14
