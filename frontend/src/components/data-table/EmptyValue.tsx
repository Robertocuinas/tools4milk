"use client";

import { useTranslation } from "react-i18next";

/** Celda sin dato: muestra "—" y lo anuncia como "sin dato" (nunca un 0 falso). */
export function EmptyValue({ title }: { title?: string }) {
  const { t } = useTranslation();
  return (
    <span title={title ?? t("dataTable.noData")} className="text-app-dim">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{title ?? t("dataTable.noData")}</span>
    </span>
  );
}
