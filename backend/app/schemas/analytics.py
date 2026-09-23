"""Esquemas de respuesta de las tablas analiticas (Predicciones y Calidad).

Se definen aparte de app/schemas/api.py para no tocar ese fichero
compartido. Son filas "planas" pensadas para tablas ordenables y
filtrables en el frontend: una fila por animal, con los datos ya
resueltos en backend (sin N peticiones por animal).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RiesgoNivel = Literal["bajo", "medio", "alto", "critico"]
Tendencia = Literal["aumento", "descenso", "estable"]


class PredictionTableRow(BaseModel):
    """Resumen por animal de la prediccion heuristica (misma logica que
    GET /predictions/{animal_id}, calculada en bloque)."""

    model_config = ConfigDict(populate_by_name=True)

    animal_id: str
    crotal_oficial: str
    nombre: str | None = None
    raza: str | None = None
    estado: str
    riesgo: RiesgoNivel
    factores_riesgo: list[str] = []
    # None cuando no hay ni lecturas de robot ni lactacion activa: en vez de
    # un 0 que parezca una produccion real.
    produccion_prevista: float | None = Field(None, description="L/dia previstos (horizonte 7 dias)")
    tendencia_produccion: Tendencia
    origen_produccion: str
    # Solo se rellenan si la composicion procede de la lactacion activa del
    # propio animal; si la heuristica recurre al promedio del tanque o a la
    # referencia sectorial, se devuelve None (no es un dato del animal).
    grasa: float | None = Field(None, description="% grasa prevista")
    proteina: float | None = Field(None, description="% proteina prevista")
    origen_composicion: str
    mock: bool = Field(False, alias="_mock")


class QualityTableRow(BaseModel):
    """Fila de la tabla de calidad: animal + medias de su lactacion activa."""

    animal_id: str
    crotal_oficial: str
    nombre: str | None = None
    raza: str | None = None
    estado: str
    lactacion_id: str | None = None
    numero_lactacion: int | None = None
    dias_en_leche: int | None = None
    grasa: float | None = Field(None, description="% grasa media de la lactacion activa")
    proteina: float | None = Field(None, description="% proteina media de la lactacion activa")
    produccion: float | None = Field(None, description="L/dia (produccion_total_kg / 305, mismo criterio que /lactations)")
    produccion_total: float | None = None
    rcs: int | None = Field(None, description="Recuento de celulas somaticas medio (cel/mL)")
    score: int | None = Field(None, description="Score de calidad 0-100 (ver lactations_service.quality_score)")
