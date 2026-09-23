"""Recomendacion de trabajadores para una tarea (matching determinista).

No usa servicios externos ni IA: la puntuacion es una suma de criterios
explicables calculados sobre datos reales de la base de datos. Cada
criterio que aporta (o resta) puntos queda registrado como un motivo
(`reasons`) con codigo estable y parametros, para que el frontend muestre
una explicacion traducida ("Recomendado por experiencia en X").

Pesos (maximo teorico sin cualificacion = 20 + 15 + 10 = 45 < 50, de modo
que tener la cualificacion requerida siempre pesa mas que el resto juntos):

- Cualificacion requerida (TareaCatalogo.cualificacion_requerida frente a
  Empleado.cualificaciones, normalizado): hasta +50, proporcional a la
  fraccion de tokens requeridos que cubre el empleado. Si el requisito
  coincide con el rol del empleado (p.ej. "veterinaria" ~ rol
  "veterinario") cuenta igual, con motivo "role".
- Experiencia: +1 por ejecucion COMPLETADA de la misma tarea de catalogo,
  con tope de +20.
- Zona: +15 si la zona principal del empleado es la zona de la tarea.
- Disponibilidad: +10 si esta asignado a un turno que cubre la hora
  planificada.
- Carga de trabajo: -2 por cada tarea abierta ese mismo dia (tope -10).

Los empleados inactivos se excluyen. Desempate determinista: puntuacion,
experiencia, nombre, apellidos e id.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.tools4milk import Empleado, TareaCatalogo, TareaEjecucion
from app.repositories import employees_repository, tasks_repository

W_QUALIFICATION = 50.0
W_EXPERIENCE_PER_TASK = 1.0
W_EXPERIENCE_CAP = 20.0
W_ZONE = 15.0
W_ON_SHIFT = 10.0
W_WORKLOAD_PER_TASK = 2.0
W_WORKLOAD_CAP = 10.0

# Hora local de la explotacion: los turnos (fecha + hora) se guardan en hora
# local, mientras que ts_planificada es timestamptz (UTC en la practica).
try:
    from zoneinfo import ZoneInfo

    FARM_TZ = ZoneInfo("Europe/Madrid")
except Exception:  # pragma: no cover - sin base de datos tz disponible
    FARM_TZ = timezone.utc

_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


def normalize(text: str | None) -> str:
    """Minusculas y sin tildes/diacriticos ("Ordeño" -> "ordeno")."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower().strip()


def tokenize(text: str | None) -> list[str]:
    """Tokens normalizados; separa por cualquier caracter no alfanumerico
    (comas, espacios, guiones bajos, barras...)."""
    return [tok for tok in _TOKEN_SPLIT.split(normalize(text)) if tok]


def tokens_match(a: str, b: str) -> bool:
    """Coincidencia robusta entre dos tokens normalizados: iguales, o misma
    raiz cuando solo cambia la terminacion (veterinaria/veterinario,
    mecanica/mecanico). Solo para palabras de 5+ letras, para no confundir
    siglas cortas como VMS/TMR."""
    if a == b:
        return True
    shortest = min(len(a), len(b))
    if shortest < 5:
        return False
    prefix = 0
    for ca, cb in zip(a, b):
        if ca != cb:
            break
        prefix += 1
    return prefix >= shortest - 1


@dataclass
class _Candidate:
    empleado: Empleado
    score: float = 0.0
    experience: int = 0
    reasons: list[dict[str, Any]] = field(default_factory=list)


def _score_qualification(cand: _Candidate, required_raw: str | None) -> None:
    required = tokenize(required_raw)
    if not required:
        return
    own: list[tuple[str, str]] = []  # (token normalizado, etiqueta original)
    for qual in cand.empleado.cualificaciones or []:
        for tok in tokenize(qual):
            own.append((tok, qual))
    rol = cand.empleado.rol.value if hasattr(cand.empleado.rol, "value") else str(cand.empleado.rol or "")
    role_tokens = tokenize(rol)

    matched_quals: list[str] = []
    matched_by_role = False
    matched = 0
    for req in required:
        hit = next((label for tok, label in own if tokens_match(req, tok)), None)
        if hit is not None:
            matched += 1
            if hit not in matched_quals:
                matched_quals.append(hit)
        elif any(tokens_match(req, tok) for tok in role_tokens):
            matched += 1
            matched_by_role = True

    if matched == 0:
        cand.reasons.append({"code": "missing_qualification", "value": required_raw, "points": 0})
        return
    points = round(W_QUALIFICATION * matched / len(required), 2)
    cand.score += points
    if matched_quals:
        cand.reasons.append({"code": "qualification", "value": ", ".join(matched_quals), "points": points})
    if matched_by_role:
        cand.reasons.append({"code": "role", "value": rol, "points": 0 if matched_quals else points})


def rank_candidates(
    empleados: list[Empleado],
    *,
    cualificacion_requerida: str | None,
    zona_id: uuid.UUID | None,
    experience: dict[uuid.UUID, int],
    on_shift: dict[uuid.UUID, str],
    open_workload: dict[uuid.UUID, int],
) -> list[dict[str, Any]]:
    """Puntua y ordena candidatos a partir de datos ya cargados (funcion
    pura: sin acceso a BD, determinista para las mismas entradas)."""
    candidates: list[_Candidate] = []
    for emp in empleados:
        if not emp.activo:
            continue
        cand = _Candidate(empleado=emp)
        _score_qualification(cand, cualificacion_requerida)

        count = experience.get(emp.id, 0)
        cand.experience = count
        if count > 0:
            points = min(count * W_EXPERIENCE_PER_TASK, W_EXPERIENCE_CAP)
            cand.score += points
            cand.reasons.append({"code": "experience", "count": count, "points": points})

        if zona_id is not None and emp.zona_principal_id == zona_id:
            cand.score += W_ZONE
            cand.reasons.append({"code": "zone", "points": W_ZONE})

        if emp.id in on_shift:
            cand.score += W_ON_SHIFT
            cand.reasons.append({"code": "on_shift", "value": on_shift[emp.id], "points": W_ON_SHIFT})

        load = open_workload.get(emp.id, 0)
        if load > 0:
            penalty = min(load * W_WORKLOAD_PER_TASK, W_WORKLOAD_CAP)
            cand.score -= penalty
            cand.reasons.append({"code": "workload", "count": load, "points": -penalty})

        cand.score = round(cand.score, 2)
        candidates.append(cand)

    candidates.sort(
        key=lambda c: (
            -c.score,
            -c.experience,
            normalize(c.empleado.nombre),
            normalize(c.empleado.apellidos),
            str(c.empleado.id),
        )
    )

    result: list[dict[str, Any]] = []
    for index, cand in enumerate(candidates):
        emp = cand.empleado
        # Los motivos positivos primero (los de mas peso delante), la
        # penalizacion y la cualificacion ausente al final.
        reasons = sorted(cand.reasons, key=lambda r: -float(r.get("points") or 0))
        result.append(
            {
                "empleado_id": str(emp.id),
                "nombre": emp.nombre,
                "apellidos": emp.apellidos,
                "role": emp.rol.value if hasattr(emp.rol, "value") else emp.rol,
                "zona_principal_id": str(emp.zona_principal_id) if emp.zona_principal_id else None,
                "score": cand.score,
                "rank": index + 1,
                # Solo se marca como recomendado si hay alguna base real.
                "is_recommended": index == 0 and cand.score > 0,
                "reasons": reasons,
            }
        )
    return result


def _to_uuid(value: str | uuid.UUID | None) -> uuid.UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return None


def _parse_dt(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if dt.tzinfo is None:
        # Sin zona horaria se interpreta como hora local de la explotacion
        # (lo que envia un <input type="datetime-local">).
        dt = dt.replace(tzinfo=FARM_TZ)
    return dt


def recommend_employees(
    db: Session,
    *,
    catalogo_id: str | None = None,
    zona_id: str | None = None,
    ts_planificada: str | datetime | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    """Lista completa de empleados activos ordenada por idoneidad para la
    tarea. Si se pasa `task_id`, sus datos (catalogo, zona, fecha) se usan
    por defecto y la propia tarea no cuenta como carga de trabajo."""
    task_uuid = _to_uuid(task_id)
    ejecucion = db.get(TareaEjecucion, task_uuid) if task_uuid else None

    cat_uuid = _to_uuid(catalogo_id) or (ejecucion.catalogo_id if ejecucion else None)
    zona_uuid = _to_uuid(zona_id) or (ejecucion.zona_id if ejecucion else None)
    ts = _parse_dt(ts_planificada) or (ejecucion.ts_planificada if ejecucion else None)
    if ts is not None and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    catalogo = db.get(TareaCatalogo, cat_uuid) if cat_uuid else None

    experience = tasks_repository.count_completed_by_employee(db, catalogo.id) if catalogo else {}
    on_shift: dict[uuid.UUID, str] = {}
    open_workload: dict[uuid.UUID, int] = {}
    if ts is not None:
        local = ts.astimezone(FARM_TZ)
        on_shift = employees_repository.get_on_shift(db, local.replace(tzinfo=None))
        day_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
        open_workload = tasks_repository.count_open_by_employee_between(
            db,
            day_start,
            day_start + timedelta(days=1),
            exclude_task_id=ejecucion.id if ejecucion else None,
        )

    empleados = employees_repository.get_all(db, activo=True)
    candidates = rank_candidates(
        empleados,
        cualificacion_requerida=catalogo.cualificacion_requerida if catalogo else None,
        zona_id=zona_uuid,
        experience=experience,
        on_shift=on_shift,
        open_workload=open_workload,
    )
    return {
        "catalogo_id": str(catalogo.id) if catalogo else None,
        "zona_id": str(zona_uuid) if zona_uuid else None,
        "ts_planificada": ts.isoformat() if ts else None,
        "cualificacion_requerida": catalogo.cualificacion_requerida if catalogo else None,
        "candidates": candidates,
    }
