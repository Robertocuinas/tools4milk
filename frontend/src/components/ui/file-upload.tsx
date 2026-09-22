"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRef } from "react";

type FileUploadProps = {
  onSelect: (file: File) => void;
  disabled?: boolean;
  label: string;
  /** Formatos aceptados por el selector del navegador (no sustituye la
   * validacion real del backend por contenido, solo evita que el usuario
   * pierda tiempo eligiendo un fichero que sabemos que se va a rechazar). */
  accept?: string;
};

/** Selector de fichero con soporte de camara en movil/tablet: el atributo
 * `capture="environment"` hace que, en un dispositivo con camara, el propio
 * navegador ofrezca "hacer foto" ademas de "elegir de la galeria" — no hace
 * falta ninguna API de camara propia. */
export function FileUpload({ onSelect, disabled, label, accept = "image/*" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero tras un error
    if (file) onSelect(file);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="tablet-touch inline-flex items-center gap-2 rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm font-semibold text-app-text transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {label}
      </button>
    </>
  );
}
