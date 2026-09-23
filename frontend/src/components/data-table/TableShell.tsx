"use client";

import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type TableShellProps = {
  /** Titulo accesible de la tabla (caption oculto + nombre de la region). */
  caption: string;
  children: React.ReactNode;
  isEmpty?: boolean;
  empty?: { Icon: LucideIcon; title: string; description?: string; action?: React.ReactNode };
  /** Cabecera fija con scroll vertical interno (solo en pantallas grandes,
   * para no anidar scrolls en movil). El <thead> debe usar `sticky top-0`. */
  stickyHeader?: boolean;
  /** Ancho minimo de la tabla antes de activar el scroll horizontal. */
  minWidthClass?: string;
};

/** Contenedor de tabla: scroll horizontal propio (no rompe la pagina en
 * movil), region enfocable para desplazarla con teclado y estado vacio. */
export function TableShell({
  caption,
  children,
  isEmpty,
  empty,
  stickyHeader,
  minWidthClass = "min-w-[720px]",
}: TableShellProps) {
  if (isEmpty && empty) return <EmptyState {...empty} />;

  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={`overflow-x-auto rounded-[var(--bento-radius)] border border-app-border bg-white shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        stickyHeader ? "lg:max-h-[70vh] lg:overflow-y-auto" : ""
      }`}
    >
      <table className={`w-full border-collapse text-sm ${minWidthClass}`}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/** Clases comunes para <thead> (fijo si el contenedor tiene scroll). */
export const theadClass = "sticky top-0 z-10 border-b border-app-border bg-app-bg";
/** Clases comunes para celdas de datos. */
export const tdClass = "px-3 py-2.5 align-middle";
