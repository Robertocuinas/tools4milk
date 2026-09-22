"""Transcripcion de voz a texto (T14 ampliado, ver conversacion con el
cliente: no se piden adjuntos de audio reproducibles sino notas de voz que
se convierten en texto para rellenar campos de observaciones/notas en
tareas, relevos e incidencias).

El audio es efimero: se reenvia tal cual a la API de OpenAI Whisper y se
descarta en cuanto se obtiene la transcripcion — nunca se persiste en disco
ni en BD, a diferencia de los adjuntos de imagen de T7.
"""

from __future__ import annotations

import httpx

from app.config import settings

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # limite de la propia API de OpenAI

_ALLOWED_CONTENT_TYPES = {
    "audio/webm",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
}


class TranscriptionError(Exception):
    """No se pudo transcribir el audio (proveedor no configurado, fichero
    invalido, o fallo de la API externa)."""


def _validar(data: bytes, content_type: str) -> None:
    if not data:
        raise TranscriptionError("El audio esta vacio")
    if len(data) > MAX_AUDIO_BYTES:
        raise TranscriptionError(f"El audio supera el limite de {MAX_AUDIO_BYTES // (1024 * 1024)} MB")
    # Validacion superficial por Content-Type declarado: a diferencia de los
    # adjuntos de T7, este fichero nunca se guarda ni se sirve de vuelta, asi
    # que el riesgo de contenido malicioso disfrazado es mucho menor — el
    # peor caso es que la API de Whisper rechace un fichero que no es audio.
    base_type = content_type.split(";")[0].strip().lower()
    if base_type not in _ALLOWED_CONTENT_TYPES:
        raise TranscriptionError(f"Tipo de audio no soportado: {content_type or 'desconocido'}")


async def transcribe(data: bytes, filename: str, content_type: str) -> str:
    _validar(data, content_type)

    if not settings.openai_api_key:
        raise TranscriptionError("La transcripcion de voz no esta configurada en este servidor")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": (filename or "audio.webm", data, content_type or "audio/webm")},
                data={"model": settings.whisper_model},
            )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise TranscriptionError(f"El servicio de transcripcion rechazo el audio: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise TranscriptionError("No se pudo contactar con el servicio de transcripcion") from exc

    try:
        texto = response.json()["text"]
    except (KeyError, ValueError) as exc:
        raise TranscriptionError("Respuesta invalida del servicio de transcripcion") from exc

    return texto.strip()
