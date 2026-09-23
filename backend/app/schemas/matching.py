"""Esquemas de respuesta de la recomendacion de trabajadores para una tarea.

Se mantienen en un modulo propio (en vez de app/schemas/api.py) para no
colisionar con otros cambios en paralelo sobre ese fichero.
"""

from typing import Literal

from pydantic import BaseModel, Field

ReasonCode = Literal[
    "qualification",
    "role",
    "missing_qualification",
    "experience",
    "zone",
    "on_shift",
    "workload",
]


class RecommendationReason(BaseModel):
    """Motivo explicable de la puntuacion. `code` es estable (el frontend lo
    traduce); `value`/`count` son los parametros reales que lo justifican."""

    code: ReasonCode
    value: str | None = None
    count: int | None = None
    points: float = 0


class EmployeeCandidate(BaseModel):
    empleado_id: str
    nombre: str
    apellidos: str | None = None
    role: str | None = None
    zona_principal_id: str | None = None
    score: float
    rank: int
    is_recommended: bool
    reasons: list[RecommendationReason] = Field(default_factory=list)


class EmployeeRecommendationResponse(BaseModel):
    catalogo_id: str | None = None
    zona_id: str | None = None
    ts_planificada: str | None = None
    cualificacion_requerida: str | None = None
    candidates: list[EmployeeCandidate]
