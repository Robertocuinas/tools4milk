from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, examples=["testuser"])
    password: str = Field(..., min_length=8, examples=["testpass123"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    activo: bool
    role: str = "operario"


class AuthResponse(BaseModel):
    user: UserResponse
    token: TokenResponse


class AlertCreate(BaseModel):
    animal_id: str
    tipo_alerta: str
    severidad: Literal["baja", "media", "alta", "critica"]
    descripcion: str
    recomendacion: str | None = None
    confianza_prediccion: float | None = None


class AlertUpdate(BaseModel):
    estado: Literal["pendiente", "revisada", "resuelta", "falsa_alarma"] | None = None
    notas_operario: str | None = None


GenealogyRelation = Literal[
    "madre",
    "padre",
    "abuela_materna",
    "abuelo_materno",
    "abuela_paterna",
    "abuelo_paterno",
]


class GenealogyRelative(BaseModel):
    """Un ascendiente del animal. `registrado` indica si existe como animal
    en la explotación (entonces `id` permite enlazar a su ficha); un toro
    externo de inseminación llega con id=None y solo crotal/nombre."""

    id: str | None = None
    nombre: str | None = None
    crotal: str | None = None
    relacion: GenealogyRelation
    registrado: bool
    sexo: str | None = None
    raza: str | None = None
    fecha_nacimiento: str | None = None


class AnimalGenealogyResponse(BaseModel):
    """Genealogía hasta abuelos. Cada campo es None si no hay dato: nunca se
    rellena con valores inventados."""

    animal_id: str
    madre: GenealogyRelative | None = None
    padre: GenealogyRelative | None = None
    abuela_materna: GenealogyRelative | None = None
    abuelo_materno: GenealogyRelative | None = None
    abuela_paterna: GenealogyRelative | None = None
    abuelo_paterno: GenealogyRelative | None = None


class AlertsResponse(BaseModel):
    animal_id: str | None = None
    total: int
    alertas: list[dict[str, Any]]
    estadisticas: dict[str, Any] | None = None
    skip: int = 0
    limit: int = 50
