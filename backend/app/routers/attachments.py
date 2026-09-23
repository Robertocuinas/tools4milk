from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.models import Usuario
from app.models.tools4milk import Empleado
from app.repositories import attachments_repository, incidents_repository
from app.routers.deps import DbSession, OperationsManager
from app.security import StableHTTPException, get_current_user
from app.services import attachments_service
from app.services.attachments_service import AttachmentValidationError
from app.services.storage_service import StorageError, get_storage_service

router = APIRouter(prefix="/api/v1", tags=["adjuntos"], dependencies=[Depends(get_current_user)])

_ENTIDAD_INCIDENCIA = "incidencia"


def _empleado_id_de(db: DbSession, user: Usuario):
    return db.scalar(select(Empleado.id).where(Empleado.usuario_id == user.id))


def _adjunto_url(adjunto) -> str:
    url = get_storage_service().get_url(adjunto.storage_key)
    return url or f"/api/v1/adjuntos/{adjunto.id}/contenido"


def _get_incident_or_404(db: DbSession, incident_id: str):
    incident = incidents_repository.get_by_id(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    return incident


@router.get("/incidents/{incident_id}/adjuntos")
def list_incident_attachments(incident_id: str, db: DbSession) -> list[dict[str, Any]]:
    _get_incident_or_404(db, incident_id)
    items = attachments_repository.list_by_entidad(db, _ENTIDAD_INCIDENCIA, incident_id)
    return [attachments_service.serialize(a, _adjunto_url(a)) for a in items]


@router.post("/incidents/{incident_id}/adjuntos", status_code=201)
async def upload_incident_attachment(
    incident_id: str,
    db: DbSession,
    user: OperationsManager,
    file: UploadFile,
) -> dict[str, Any]:
    _get_incident_or_404(db, incident_id)

    existentes = attachments_repository.count_by_entidad(db, _ENTIDAD_INCIDENCIA, incident_id)
    if existentes >= attachments_service.MAX_ADJUNTOS_POR_ENTIDAD:
        raise HTTPException(
            status_code=422,
            detail=f"Esta incidencia ya tiene el maximo de {attachments_service.MAX_ADJUNTOS_POR_ENTIDAD} adjuntos",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="El fichero esta vacio")

    try:
        clean_bytes, mime_type, extension, width, height = attachments_service.validate_and_normalize_image(raw)
    except AttachmentValidationError as exc:
        raise StableHTTPException(status_code=422, detail=str(exc), code=exc.code) from exc

    hash_sha256 = attachments_service.compute_sha256(clean_bytes)

    # Deduplicacion: si esta misma imagen (por contenido, no por nombre) ya
    # esta adjunta a esta incidencia, se devuelve la existente en vez de
    # duplicar almacenamiento.
    duplicado = attachments_repository.get_by_hash(db, _ENTIDAD_INCIDENCIA, incident_id, hash_sha256)
    if duplicado is not None:
        return attachments_service.serialize(duplicado, _adjunto_url(duplicado))

    import uuid as _uuid

    storage_key = f"{_ENTIDAD_INCIDENCIA}/{incident_id}/{_uuid.uuid4()}.{extension}"
    try:
        get_storage_service().save(clean_bytes, storage_key, mime_type)
    except StorageError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo guardar el adjunto: {exc}") from exc

    empleado_id = _empleado_id_de(db, user)
    item = attachments_repository.create(
        db,
        {
            "entidad_tipo": _ENTIDAD_INCIDENCIA,
            "entidad_id": incident_id,
            "tipo_media": "imagen",
            "nombre_original": file.filename or "imagen",
            "mime_type": mime_type,
            "tamano_bytes": len(clean_bytes),
            "storage_key": storage_key,
            "ancho_px": width,
            "alto_px": height,
            "hash_sha256": hash_sha256,
            "subido_por": empleado_id,
        },
    )
    return attachments_service.serialize(item, _adjunto_url(item))


@router.delete("/adjuntos/{adjunto_id}", status_code=204)
def delete_attachment(adjunto_id: str, db: DbSession, _user: OperationsManager) -> None:
    item = attachments_repository.get_by_id(db, adjunto_id)
    if item is None or item.eliminado:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    try:
        get_storage_service().delete(item.storage_key)
    except StorageError:
        pass  # el borrado logico en BD es lo que importa de cara al usuario
    attachments_repository.soft_delete(db, item)


@router.get("/adjuntos/{adjunto_id}/contenido")
def get_attachment_content(adjunto_id: str, db: DbSession) -> Response:
    """Sirve el contenido solo cuando el backend activo es local (sin URL
    directa). Con Azure Blob, el cliente usa la URL SAS que ya viene en el
    campo `url` de la serializacion — este endpoint no se usa en ese caso."""
    item = attachments_repository.get_by_id(db, adjunto_id)
    if item is None or item.eliminado:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    try:
        data = get_storage_service().read(item.storage_key)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(
        content=data,
        media_type=item.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{item.id}"'},
    )
