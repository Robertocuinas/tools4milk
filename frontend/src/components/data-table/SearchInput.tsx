"use client";

import { Search, X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

type SearchInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Texto de estado (p. ej. "12 resultados"), anunciado por lectores de pantalla. */
  status?: string;
  className?: string;
};

/** Buscador etiquetado que filtra mientras se escribe. */
export function SearchInput({ label, value, onChange, placeholder, status, className = "" }: SearchInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const statusId = `${id}-status`;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-dim" />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={status ? statusId : undefined}
          className="h-11 w-full rounded-[10px] border border-app-border bg-white ps-9 pe-10 text-sm text-app-text outline-none transition placeholder:text-app-dim focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("dataTable.clearSearch")}
            className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-app-dim transition hover:bg-app-bg hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      {status && (
        <p id={statusId} aria-live="polite" className="mt-1 text-xs text-app-dim">
          {status}
        </p>
      )}
    </div>
  );
}
