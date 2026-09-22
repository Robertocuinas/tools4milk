"""Capa de almacenamiento para adjuntos (T7).

Dos implementaciones detras de una misma interfaz, elegidas por
`settings.storage_backend` ("local" | "azure_blob"), para no atar el resto
del codigo (router, servicio de adjuntos) a la decision de infraestructura.
Ver docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md, seccion T7.

- LocalStorageService: escribe en un volumen del contenedor. Solo valida si
  ese volumen es realmente persistente entre despliegues (por ejemplo, un
  volumen montado explicitamente) — en un PaaS con filesystem efimero por
  defecto (Azure App Service/Container Apps sin Azure Files, Railway, etc.)
  los ficheros se perderian silenciosamente en el siguiente despliegue.
- AzureBlobStorageService: sube a un contenedor de Azure Blob Storage y
  genera URLs SAS de solo lectura con expiracion — sobrevive a redespliegues
  sin depender del disco del contenedor.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import settings


class StorageError(Exception):
    """Fallo de lectura/escritura/borrado en el backend de almacenamiento."""


class StorageService(ABC):
    @abstractmethod
    def save(self, data: bytes, key: str, content_type: str) -> None:
        """Guarda los bytes bajo `key`. `key` ya viene generada (UUID) por
        quien llama — nunca debe derivarse del nombre original del fichero."""

    @abstractmethod
    def read(self, key: str) -> bytes:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        ...

    @abstractmethod
    def get_url(self, key: str) -> str | None:
        """URL de acceso directo (p.ej. SAS de Azure). None si este backend
        no ofrece URL directa y el contenido debe servirse a traves del
        propio backend (ver GET /adjuntos/{id}/contenido)."""


class LocalStorageService(StorageService):
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        # `key` es una ruta relativa generada por nosotros (UUID + extension),
        # pero se revalida igualmente contra path traversal por defensa en
        # profundidad antes de tocar el filesystem.
        path = (self.base_path / key).resolve()
        base = self.base_path.resolve()
        if base not in path.parents and path != base:
            raise StorageError("Clave de almacenamiento invalida")
        return path

    def save(self, data: bytes, key: str, content_type: str) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        try:
            return self._resolve(key).read_bytes()
        except FileNotFoundError as exc:
            raise StorageError(f"Adjunto no encontrado en almacenamiento: {key}") from exc

    def delete(self, key: str) -> None:
        try:
            self._resolve(key).unlink(missing_ok=True)
        except OSError as exc:
            raise StorageError(f"No se pudo borrar el adjunto: {key}") from exc

    def get_url(self, key: str) -> str | None:
        return None


class AzureBlobStorageService(StorageService):
    def __init__(self, connection_string: str, container: str):
        # Import diferido: evita que el SDK de Azure sea obligatorio cuando
        # STORAGE_BACKEND=local (p.ej. en tests o en desarrollo local).
        from azure.storage.blob import BlobServiceClient

        self._client = BlobServiceClient.from_connection_string(connection_string)
        self._container_name = container
        container_client = self._client.get_container_client(container)
        if not container_client.exists():
            container_client.create_container()

    def _blob_client(self, key: str):
        return self._client.get_blob_client(container=self._container_name, blob=key)

    def save(self, data: bytes, key: str, content_type: str) -> None:
        from azure.core.exceptions import AzureError
        from azure.storage.blob import ContentSettings

        try:
            self._blob_client(key).upload_blob(
                data, overwrite=True, content_settings=ContentSettings(content_type=content_type)
            )
        except AzureError as exc:
            raise StorageError(f"Fallo al subir el adjunto a Azure Blob: {exc}") from exc

    def read(self, key: str) -> bytes:
        from azure.core.exceptions import AzureError

        try:
            return self._blob_client(key).download_blob().readall()
        except AzureError as exc:
            raise StorageError(f"Adjunto no encontrado en Azure Blob: {key}") from exc

    def delete(self, key: str) -> None:
        from azure.core.exceptions import AzureError

        try:
            self._blob_client(key).delete_blob()
        except AzureError:
            pass  # borrado logico ya aplicado en BD; el blob puede no existir

    def get_url(self, key: str) -> str:
        from azure.storage.blob import BlobSasPermissions, generate_blob_sas

        account_key = self._client.credential.account_key
        sas = generate_blob_sas(
            account_name=self._client.account_name,
            container_name=self._container_name,
            blob_name=key,
            account_key=account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        return f"{self._blob_client(key).url}?{sas}"


_instance: StorageService | None = None


def get_storage_service() -> StorageService:
    global _instance
    if _instance is not None:
        return _instance
    if settings.storage_backend == "azure_blob":
        _instance = AzureBlobStorageService(
            settings.azure_storage_connection_string, settings.azure_storage_container
        )
    else:
        _instance = LocalStorageService(settings.storage_local_path)
    return _instance
