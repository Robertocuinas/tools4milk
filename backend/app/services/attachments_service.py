"""Validacion y procesado de adjuntos de imagen (T7).

La validacion de tipo se hace por contenido real (Pillow abre y decodifica
los bytes), nunca por extension ni por el Content-Type que declara el
cliente — un .exe renombrado a .jpg falla aqui porque Pillow no puede
decodificarlo como imagen. Se excluye SVG explicitamente de la lista blanca
(riesgo de XSS si se sirviera inline) aunque Pillow no lo decodificaria de
todas formas al no ser un formato rasterizado.
"""

from __future__ import annotations

import hashlib
import io
from typing import Any

from app.models.tools4milk import Adjunto

MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB, decision T7.6
MAX_ADJUNTOS_POR_ENTIDAD = 10

# Formato Pillow -> (mime real, extension). No incluye SVG a proposito.
_ALLOWED_FORMATS: dict[str, tuple[str, str]] = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}
_HEIF_FORMATS = {"HEIF", "HEIC"}


class AttachmentValidationError(Exception):
    """Fichero rechazado: tipo no permitido, demasiado grande o corrupto."""

    def __init__(self, detail: str, code: str = "ATTACHMENT_INVALID_IMAGE") -> None:
        super().__init__(detail)
        self.code = code


def _enable_heif_decoder() -> None:
    """Register pillow-heif, or reject HEIF explicitly if it is unavailable."""
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except (ImportError, OSError) as exc:
        raise AttachmentValidationError(
            "El servidor no tiene disponible el decodificador HEIC/HEIF",
            "ATTACHMENT_HEIF_DECODER_UNAVAILABLE",
        ) from exc


def _looks_like_heif(raw: bytes) -> bool:
    """Detect ISO-BMFF HEIF brands without trusting a client filename."""
    return len(raw) >= 12 and raw[4:8] == b"ftyp" and raw[8:12] in {
        b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1",
    }


def validate_and_normalize_image(raw: bytes) -> tuple[bytes, str, str, int, int]:
    """Valida que `raw` sea una imagen real de un formato permitido y la
    re-serializa desde cero (elimina EXIF, incluida geolocalizacion, y
    cualquier payload no-imagen oculto tras los datos de pixel).

    Devuelve (bytes_limpios, mime_type, extension, ancho_px, alto_px).
    Lanza AttachmentValidationError si el fichero no es una imagen valida
    de un formato permitido.
    """
    from PIL import Image, UnidentifiedImageError

    if len(raw) > MAX_SIZE_BYTES:
        raise AttachmentValidationError(
            f"El fichero supera el limite de {MAX_SIZE_BYTES // (1024 * 1024)} MB",
            "ATTACHMENT_FILE_TOO_LARGE",
        )

    # Pillow needs an explicit plugin to recognize HEIC/HEIF. Content is
    # still authenticated by decode/verify, never by filename or MIME type.
    if _looks_like_heif(raw):
        _enable_heif_decoder()

    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()  # solo valida integridad; no se puede reutilizar el objeto
            fmt = probe.format
    except (UnidentifiedImageError, OSError) as exc:
        raise AttachmentValidationError("El fichero no es una imagen valida") from exc

    if fmt not in _ALLOWED_FORMATS and fmt not in _HEIF_FORMATS:
        raise AttachmentValidationError(f"Formato de imagen no permitido: {fmt or 'desconocido'}")
    output_fmt = "JPEG" if fmt in _HEIF_FORMATS else fmt
    mime_type, extension = _ALLOWED_FORMATS[output_fmt]

    # Reabrir: verify() deja el objeto inutilizable para mas operaciones.
    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGB") if output_fmt == "JPEG" else img.convert("RGBA") if img.mode in ("P", "LA") else img
        width, height = img.size
        buffer = io.BytesIO()
        save_kwargs: dict[str, Any] = {"format": output_fmt}
        if output_fmt == "JPEG":
            save_kwargs["quality"] = 90
        img.save(buffer, **save_kwargs)  # sin exif=... => no se conserva metadata original
        clean_bytes = buffer.getvalue()

    return clean_bytes, mime_type, extension, width, height


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def serialize(adjunto: Adjunto, url: str) -> dict[str, Any]:
    return {
        "id": str(adjunto.id),
        "entidad_tipo": adjunto.entidad_tipo,
        "entidad_id": str(adjunto.entidad_id),
        "tipo_media": adjunto.tipo_media,
        "nombre_original": adjunto.nombre_original,
        "mime_type": adjunto.mime_type,
        "tamano_bytes": adjunto.tamano_bytes,
        "ancho_px": adjunto.ancho_px,
        "alto_px": adjunto.alto_px,
        "url": url,
        "subido_por": str(adjunto.subido_por) if adjunto.subido_por else None,
        "ts_subida": adjunto.ts_subida.isoformat() if adjunto.ts_subida else None,
    }
