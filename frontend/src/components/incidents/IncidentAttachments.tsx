"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileUpload } from "@/components/ui/file-upload";
import { API_BASE_URL } from "@/lib/config";
import { api, getToken } from "@/lib/api";
import type { Attachment } from "@/lib/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Formatos admitidos por el backend. HEIC/HEIF se normalizan a JPEG en el
 * servidor, por lo que la galería puede enviar la foto original. */
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

function resolveUrl(url: string): string {
  // El backend con almacenamiento local devuelve una ruta relativa
  // (/api/v1/adjuntos/{id}/contenido); con Azure Blob devuelve una URL SAS
  // absoluta que ya incluye su propia autorizacion en la query string.
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`;
}

/** Descarga el contenido con el mismo Bearer token que usa el resto de la
 * app y lo expone como object URL. Un <img src> normal no puede mandar la
 * cabecera Authorization que exige el endpoint de contenido local; con la
 * URL SAS de Azure esto tambien funciona (fetch simplemente ignora el
 * header si no hace falta). */
function useAttachmentObjectUrl(url: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;

    const token = getToken();
    fetch(resolveUrl(url), token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar la imagen");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [url]);

  return { objectUrl, failed };
}

function AttachmentThumbnail({
  attachment,
  canManage,
  onOpen,
  onDelete,
  deleting,
}: {
  attachment: Attachment;
  canManage: boolean;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const { objectUrl, failed } = useAttachmentObjectUrl(attachment.url);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-[10px] border border-app-border bg-app-bg">
      {objectUrl ? (
        <button type="button" onClick={onOpen} className="block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image no aporta nada aqui */}
          <img src={objectUrl} alt={attachment.nombre_original} className="h-full w-full object-cover" />
        </button>
      ) : failed ? (
        <div className="flex h-full w-full items-center justify-center text-app-dim">
          <AlertTriangle className="h-5 w-5" />
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-app-surface2" />
      )}
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title={t("attachments.delete")}
          aria-label={t("attachments.delete")}
          className="tablet-touch absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const { t } = useTranslation();
  const { objectUrl } = useAttachmentObjectUrl(attachment.url);
  // Portal a document.body: si se renderiza en su sitio natural (dentro de
  // la tarjeta de incidencia expandida), un ancestro con transform/filter
  // (transiciones de hover, etc.) puede crear un containing block propio y
  // "fixed inset-0" deja de cubrir el viewport real — se vio en la
  // verificacion visual (overlay recortado a la derecha del contenido).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="tablet-touch absolute end-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {objectUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={attachment.nombre_original}
          className="max-h-full max-w-full rounded-[10px] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>,
    document.body,
  );
}

type PendingPhoto = { file: File; previewUrl: string };

/** Paso de confirmacion antes de subir: miniatura local (object URL, sin
 * red) con "Subir" / "Cancelar". La camara nativa ya permite repetir la
 * foto, pero aqui el usuario ve el resultado dentro de la propia app antes
 * de que quede adjunto a la incidencia (sirve igual para la galeria). */
function PendingPhotoPreview({
  photo,
  uploading,
  onConfirm,
  onCancel,
}: {
  photo: PendingPhoto;
  uploading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("attachments.previewTitle")}
      className="flex items-center gap-3 rounded-[10px] border border-app-border bg-app-bg p-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL local, next/image no aporta nada aqui */}
      <img
        src={photo.previewUrl}
        alt={t("attachments.previewAlt")}
        className="h-20 w-20 shrink-0 rounded-[8px] object-cover"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-xs text-app-dim" dir="auto">
          {photo.file.name} · {(photo.file.size / (1024 * 1024)).toFixed(1)} MB
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={uploading}
            aria-busy={uploading || undefined}
            className="tablet-touch inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? t("attachments.uploading") : t("attachments.upload")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="tablet-touch inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm font-semibold text-app-text transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IncidentAttachments({ incidentId, canManage }: { incidentId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);

  // Libera el object URL de la vista previa al sustituirla, descartarla,
  // subirla o desmontar el componente.
  const pendingPreviewUrl = pendingPhoto?.previewUrl;
  useEffect(() => {
    if (!pendingPreviewUrl) return;
    return () => URL.revokeObjectURL(pendingPreviewUrl);
  }, [pendingPreviewUrl]);

  const attachmentsQ = useQuery({
    queryKey: ["incident-attachments", incidentId],
    queryFn: () => api.incidentAttachments(incidentId),
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadIncidentAttachment(incidentId, file),
    onSuccess: () => {
      setUploadError(null);
      setPendingPhoto(null);
      queryClient.invalidateQueries({ queryKey: ["incident-attachments", incidentId] });
    },
    // Se conserva la vista previa para poder reintentar sin repetir la foto.
    onError: (err: Error) => setUploadError(err.message || t("attachments.uploadError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident-attachments", incidentId] });
    },
  });

  const attachments = attachmentsQ.data ?? [];
  const uploading = uploadMutation.isPending;

  function handleSelect(file: File) {
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(t("attachments.tooLarge", { max: MAX_SIZE_BYTES / (1024 * 1024) }));
      return;
    }
    setUploadError(null);
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
          {t("attachments.title")} {attachments.length > 0 && `(${attachments.length})`}
        </p>
        {canManage && attachments.length < 10 && (
          <FileUpload
            onSelect={handleSelect}
            disabled={uploading}
            label={t("fileUpload.uploadImage")}
            cameraLabel={t("fileUpload.takePhoto")}
            accept={ACCEPTED_IMAGE_TYPES}
          />
        )}
      </div>

      {pendingPhoto && (
        <PendingPhotoPreview
          photo={pendingPhoto}
          uploading={uploading}
          onConfirm={() => uploadMutation.mutate(pendingPhoto.file)}
          onCancel={() => {
            setPendingPhoto(null);
            setUploadError(null);
          }}
        />
      )}

      {uploadError && (
        <p
          role="alert"
          className="rounded-[10px] bg-state-critica/10 px-3 py-2 text-xs font-semibold text-state-critica"
        >
          {uploadError}
        </p>
      )}

      {attachmentsQ.isLoading ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-[10px] bg-app-surface2" />
          ))}
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-app-dim">{t("attachments.empty")}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {attachments.map((a) => (
            <AttachmentThumbnail
              key={a.id}
              attachment={a}
              canManage={canManage}
              onOpen={() => setLightboxAttachment(a)}
              onDelete={() => {
                if (confirm(t("attachments.confirmDelete"))) deleteMutation.mutate(a.id);
              }}
              deleting={deleteMutation.isPending && deleteMutation.variables === a.id}
            />
          ))}
        </div>
      )}

      {lightboxAttachment && (
        <Lightbox attachment={lightboxAttachment} onClose={() => setLightboxAttachment(null)} />
      )}
    </div>
  );
}
