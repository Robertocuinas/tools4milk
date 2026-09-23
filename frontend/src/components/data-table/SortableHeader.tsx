"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SortState } from "./table-logic";

type Align = "start" | "end";

const thBase = "whitespace-nowrap px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim";

/** Cabecera de columna no ordenable, con el mismo estilo que las ordenables. */
export function Th({ children, align = "start" }: { children: React.ReactNode; align?: Align }) {
  return (
    <th scope="col" className={`${thBase} ${align === "end" ? "text-end" : "text-start"}`}>
      {children}
    </th>
  );
}

type SortableHeaderProps<K extends string> = {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: Align;
};

/** Cabecera ordenable: boton accesible por teclado dentro del <th>, con
 * aria-sort e icono de direccion (nunca solo color). */
export function SortableHeader<K extends string>({ label, sortKey, sort, onSort, align = "start" }: SortableHeaderProps<K>) {
  const { t } = useTranslation();
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={ariaSort} className={`${thBase} ${align === "end" ? "text-end" : "text-start"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 uppercase tracking-[0.12em] transition hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          active ? "text-brand-dark" : ""
        }`}
      >
        {label}
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${active ? "" : "opacity-50"}`} />
        <span className="sr-only">
          {active
            ? sort.direction === "asc"
              ? t("dataTable.sortedAscending")
              : t("dataTable.sortedDescending")
            : t("dataTable.sortable")}
        </span>
      </button>
    </th>
  );
}
