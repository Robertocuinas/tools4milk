"use client";

import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

type FileUploadProps = {
  onSelect: (file: File) => void;
  disabled?: boolean;
  /** Muestra el spinner en los botones. Si no se indica se usa `disabled`
   * (comportamiento historico: deshabilitado == subiendo). */
  loading?: boolean;
  /** Texto del boton de galeria / sistema de ficheros. */
  label?: string;
  /** Texto del boton de camara. */
  cameraLabel?: string;
  /** Permite ofrecer "Hacer foto". Por defecto, true si `accept` admite
   * imagenes. Aun asi solo se muestra en dispositivos tactiles. */
  allowCamera?: boolean;
  /** Formatos aceptados por el selector del navegador (no sustituye la
   * validacion real del backend por contenido, solo evita que el usuario
   * pierda tiempo eligiendo un fichero que sabemos que se va a rechazar). */
  accept?: string;
};

const COARSE_POINTER_QUERY = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** true si el puntero principal es tactil (movil/tablet). En servidor y
 * durante la hidratacion devuelve false, asi el HTML inicial coincide y el
 * boton de camara aparece justo despues de montar, sin mismatch. */
function useIsCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}

function acceptsImages(accept: string) {
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((s) => s === "image/*" || s.startsWith("image/") || /^\.(jpe?g|png|webp|heic|heif|gif)$/.test(s));
}

const BUTTON_CLASS =
  "tablet-touch inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm font-semibold text-app-text transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50";

/** Selector de imagen con dos acciones separadas:
 * - "Hacer foto": input con `capture="environment"`, abre directamente la
 *   camara nativa (que ya trae su propio confirmar/repetir). Solo se ofrece
 *   en dispositivos tactiles: en escritorio `capture` se ignora y el boton
 *   abriria el mismo dialogo de ficheros, lo que confunde.
 * - "Subir imagen": input sin `capture`, abre galeria / sistema de ficheros.
 *   Hace falta separarlo porque en muchos Android `capture` fuerza la camara
 *   y deja al usuario sin forma de elegir una foto ya hecha. */
export function FileUpload({
  onSelect,
  disabled,
  loading,
  label,
  cameraLabel,
  allowCamera,
  accept = "image/*",
}: FileUploadProps) {
  const { t } = useTranslation();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isCoarsePointer = useIsCoarsePointer();

  const cameraAllowed = allowCamera ?? acceptsImages(accept);
  const showCamera = cameraAllowed && isCoarsePointer;
  const busy = loading ?? disabled;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero tras un error
    if (file) onSelect(file);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showCamera && (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleChange}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            aria-busy={busy || undefined}
            className={BUTTON_CLASS}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="h-4 w-4" aria-hidden="true" />
            )}
            {cameraLabel ?? t("fileUpload.takePhoto")}
          </button>
        </>
      )}
      <input
        ref={galleryInputRef}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => galleryInputRef.current?.click()}
        disabled={disabled}
        aria-busy={busy || undefined}
        className={BUTTON_CLASS}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
        )}
        {label ?? t("fileUpload.uploadImage")}
      </button>
    </div>
  );
}
