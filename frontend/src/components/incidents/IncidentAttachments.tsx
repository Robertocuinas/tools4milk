"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileUpload } from "@/components/ui/file-upload";
import { API_BASE_URL, TOKEN_STORAGE_KEY } from "@/lib/config";
import { api } from "@/lib/api";
import type { Attachment } from "@/lib/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

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

    const token = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
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
          title="Eliminar foto"
          className="tablet-touch absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
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

export function IncidentAttachments({ incidentId, canManage }: { incidentId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attachmentsQ = useQuery({
    queryKey: ["incident-attachments", incidentId],
    queryFn: () => api.incidentAttachments(incidentId),
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadIncidentAttachment(incidentId, file),
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["incident-attachments", incidentId] });
    },
    onError: (err: Error) => setUploadError(err.message || "Error al subir la foto"),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident-attachments", incidentId] });
    },
  });

  const attachments = attachmentsQ.data ?? [];

  function handleSelect(file: File) {
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(`La foto supera el límite de ${MAX_SIZE_BYTES / (1024 * 1024)} MB`);
      return;
    }
    uploadMutation.mutate(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
          Fotos {attachments.length > 0 && `(${attachments.length})`}
        </p>
        {canManage && attachments.length < 10 && (
          <FileUpload onSelect={handleSelect} disabled={uploadMutation.isPending} label="Añadir foto" />
        )}
      </div>

      {uploadError && (
        <p className="rounded-[10px] bg-state-critica/10 px-3 py-2 text-xs font-semibold text-state-critica">
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
        <p className="text-sm text-app-dim">Sin fotos adjuntas.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {attachments.map((a) => (
            <AttachmentThumbnail
              key={a.id}
              attachment={a}
              canManage={canManage}
              onOpen={() => setLightboxAttachment(a)}
              onDelete={() => {
                if (confirm("¿Eliminar esta foto?")) deleteMutation.mutate(a.id);
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
