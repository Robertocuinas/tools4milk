"""Contratos para sugerencias obtenidas de texto transcrito.

Estas respuestas no son comandos de escritura. Todos los valores llevan su
evidencia y deben presentarse como editables antes de crear una incidencia o
un pedido.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


ExtractionContext = Literal["incidencia", "pedido"]
Confidence = Literal["alta", "media"]


class ExtractionRequest(BaseModel):
    contexto: ExtractionContext
    texto: str = Field(..., min_length=1, max_length=4_000)


class TextSuggestion(BaseModel):
    value: str | None = None
    confidence: Confidence | None = None
    evidence: list[str] = Field(default_factory=list)
    requires_review: bool = True


class NumberSuggestion(BaseModel):
    value: float | None = None
    confidence: Confidence | None = None
    evidence: list[str] = Field(default_factory=list)
    requires_review: bool = True


class DateSuggestion(BaseModel):
    value: date | None = None
    confidence: Confidence | None = None
    evidence: list[str] = Field(default_factory=list)
    requires_review: bool = True


class IncidentExtraction(BaseModel):
    """Campos que se pueden enviar al formulario de alta de incidencias."""

    zona_id: TextSuggestion
    tipo: TextSuggestion
    prioridad: TextSuggestion
    titulo: TextSuggestion
    # Es exactamente la transcripcion; el cliente puede asignarla al campo
    # descripcion sin perder las palabras originales de la persona usuaria.
    descripcion: str


class OrderProductExtraction(BaseModel):
    """Un producto que puede convertirse en un pedido individual existente."""

    insumo: TextSuggestion
    cantidad: NumberSuggestion
    unidad: TextSuggestion


class OrderExtraction(BaseModel):
    """Sugerencias para el formulario actual de pedidos.

    `proveedor`, `productos` y `observaciones` se corresponden con campos
    existentes. El modelo de datos no tiene cliente ni fecha prevista de
    entrega: ambos se exponen solo como contexto revisable y no deben
    persistirse silenciosamente como proveedor ni como fecha de recepcion.
    """

    proveedor: TextSuggestion
    productos: list[OrderProductExtraction] = Field(default_factory=list)
    cliente: TextSuggestion
    fecha_mencionada: DateSuggestion
    observaciones: TextSuggestion


class ExtractionResponse(BaseModel):
    texto: str
    contexto: ExtractionContext
    incidencia: IncidentExtraction | None = None
    pedido: OrderExtraction | None = None
    # El endpoint solo devuelve sugerencias: nunca crea ni modifica registros.
    requires_confirmation: bool = True
