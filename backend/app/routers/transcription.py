from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

from app.security import get_current_user
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
