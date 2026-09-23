from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

from app.repositories import zones_repository
from app.routers.deps import DbSession
from app.schemas.extraction import ExtractionRequest, ExtractionResponse
from app.security import get_current_user
from app.services.natural_language_extraction import ZoneCandidate, extract_incident, extract_order
from app.services.transcription_service import TranscriptionError, transcribe

router = APIRouter(prefix="/api/v1", tags=["transcripcion"], dependencies=[Depends(get_current_user)])


@router.post("/transcripciones")
async def create_transcription(file: UploadFile, language: str = Form("es")) -> dict[str, Any]:
    raw = await file.read()
    try:
        texto = await transcribe(raw, file.filename or "audio.webm", file.content_type or "", language)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"texto": texto}


@router.post("/extracciones", response_model=ExtractionResponse)
def extract_transcribed_text(payload: ExtractionRequest, db: DbSession) -> ExtractionResponse:
    """Devuelve sugerencias editables a partir de un texto ya transcrito.

    El endpoint no escribe en base de datos ni desencadena la creación de una
    incidencia o un pedido. Para incidencias, solo devuelve una zona que siga
    existiendo y sea inequívoca entre las zonas de la explotación.
    """
    text = payload.texto.strip()
    if payload.contexto == "incidencia":
        zones = [
            ZoneCandidate(id=str(zone.id), nombre=zone.nombre, codigo=zone.codigo)
            for zone in zones_repository.get_all(db)
        ]
        return ExtractionResponse(texto=text, contexto=payload.contexto, incidencia=extract_incident(text, zones))
    return ExtractionResponse(texto=text, contexto=payload.contexto, pedido=extract_order(text))
