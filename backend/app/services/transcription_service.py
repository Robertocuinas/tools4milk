"""Transcripcion de voz a texto (T14 ampliado, ver conversacion con el
cliente: no se piden adjuntos de audio reproducibles sino notas de voz que
se convierten en texto para rellenar campos de observaciones/notas en
tareas, relevos e incidencias).

Dos proveedores encadenados, por decision explicita del cliente:
1. Vosk (modelo local, gratis, sin red): se intenta primero si hay un
   modelo configurado para el idioma pedido. Vosk trabaja sobre PCM 16-bit
   mono a 16kHz, no sobre el webm/mp4 que graba el navegador — hace falta
   decodificar con ffmpeg antes de pasarselo al reconocedor.
2. OpenAI Whisper (API externa, de pago): fallback automatico si Vosk no
   esta configurado para el idioma pedido, o si falla por cualquier motivo
   (modelo no encontrado, ffmpeg no instalado, audio irreconocible...).

El audio en si nunca se guarda en disco de forma persistente ni en BD —
se procesa en memoria (o en un fichero temporal para ffmpeg) y se descarta
en cuanto se obtiene la transcripcion, a diferencia de los adjuntos de
imagen de T7.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from threading import Lock

import httpx

from app.config import settings

logger = logging.getLogger("tools4milk.transcription")

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

_VOSK_SAMPLE_RATE = 16000


class TranscriptionError(Exception):
    """No se pudo transcribir el audio por ningun proveedor disponible."""


def _validar(data: bytes, content_type: str) -> None:
    if not data:
        raise TranscriptionError("El audio está vacío")
    if len(data) > MAX_AUDIO_BYTES:
        raise TranscriptionError(f"El audio supera el límite de {MAX_AUDIO_BYTES // (1024 * 1024)} MB")
    # Validacion superficial por Content-Type declarado: a diferencia de los
    # adjuntos de T7, este fichero nunca se guarda ni se sirve de vuelta, asi
    # que el riesgo de contenido malicioso disfrazado es mucho menor — el
    # peor caso es que el proveedor rechace un fichero que no es audio.
    base_type = content_type.split(";")[0].strip().lower()
    if base_type not in _ALLOWED_CONTENT_TYPES:
        raise TranscriptionError(f"Tipo de audio no soportado: {content_type or 'desconocido'}")


# ---------------------------------------------------------------------------
# Proveedor 1: Vosk (local)
# ---------------------------------------------------------------------------

_vosk_models_cache: dict[str, object] = {}
_vosk_lock = Lock()


def _vosk_model_path(language: str) -> str | None:
    return settings.vosk_model_paths.get(language)


def _load_vosk_model(model_path: str):
    # Cache en proceso: cargar un modelo Vosk implica leer varios ficheros
    # de disco y reservar memoria (decenas de MB incluso en la variante
    # "small") — cargarlo en cada peticion seria muy lento.
    with _vosk_lock:
        cached = _vosk_models_cache.get(model_path)
        if cached is not None:
            return cached
        from vosk import Model  # import diferido: opcional si no se usa Vosk

        model = Model(model_path)
        _vosk_models_cache[model_path] = model
        return model


def _decode_to_pcm16(data: bytes, content_type: str) -> bytes:
    """Decodifica el audio del navegador (webm/opus, mp4/aac...) a PCM
    16-bit mono a 16kHz sin cabecera, el formato que espera Vosk."""
    suffix = ".webm" if "webm" in content_type else ".mp4" if "mp4" in content_type else ".audio"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        tmp_in.write(data)
        tmp_in_path = tmp_in.name
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", tmp_in_path,
                "-f", "s16le", "-acodec", "pcm_s16le",
                "-ar", str(_VOSK_SAMPLE_RATE), "-ac", "1",
                "-loglevel", "error", "pipe:1",
            ],
            capture_output=True,
            timeout=30,
            check=True,
        )
        return result.stdout
    finally:
        Path(tmp_in_path).unlink(missing_ok=True)


def _transcribe_vosk(data: bytes, content_type: str, language: str) -> str | None:
    """Intenta transcribir con Vosk. Devuelve None (nunca lanza) si no hay
    modelo configurado para `language` o si falla por cualquier motivo —
    el llamador debe interpretar None como "usa el siguiente proveedor"."""
    model_path = _vosk_model_path(language)
    if not model_path:
        return None

    try:
        import json

        from vosk import KaldiRecognizer

        model = _load_vosk_model(model_path)
        pcm = _decode_to_pcm16(data, content_type)
        if not pcm:
            return None

        recognizer = KaldiRecognizer(model, _VOSK_SAMPLE_RATE)
        recognizer.SetWords(False)
        chunk = 4000
        for i in range(0, len(pcm), chunk):
            recognizer.AcceptWaveform(pcm[i : i + chunk])
        result = json.loads(recognizer.FinalResult())
        texto = (result.get("text") or "").strip()
        return texto or None
    except Exception:  # noqa: BLE001 — cualquier fallo de Vosk cae al fallback
        logger.warning("Vosk fallo transcribiendo audio (idioma=%s), usando fallback", language, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Proveedor 2: OpenAI Whisper (API externa)
# ---------------------------------------------------------------------------


async def _transcribe_openai(data: bytes, filename: str, content_type: str) -> str:
    if not settings.openai_api_key:
        raise TranscriptionError("La transcripción de voz no está configurada en este servidor")

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
        raise TranscriptionError(f"El servicio de transcripción rechazó el audio: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise TranscriptionError("No se pudo contactar con el servicio de transcripción") from exc

    try:
        texto = response.json()["text"]
    except (KeyError, ValueError) as exc:
        raise TranscriptionError("Respuesta inválida del servicio de transcripción") from exc

    return texto.strip()


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------


async def transcribe(data: bytes, filename: str, content_type: str, language: str = "es") -> str:
    _validar(data, content_type)

    texto = _transcribe_vosk(data, content_type, language)
    if texto:
        return texto

    return await _transcribe_openai(data, filename, content_type)
