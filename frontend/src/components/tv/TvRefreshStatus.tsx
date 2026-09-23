"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type QueryStatusInfo = {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
};

type TvRefreshStatusProps = {
  queries: QueryStatusInfo[];
  className?: string;
};

/**
 * Indicador de frescura de los datos para pantallas TV.
 * - Punto azul: datos al dia, sin peticiones en curso
 * - Punto ambar (pulsando): refrescando en segundo plano
 * - Punto rojo (pulsando): alguna consulta en error
 * Se re-renderiza cada 10 s para mantener actualizado el "hace X s".
 */
export function TvRefreshStatus({ queries, className = "" }: TvRefreshStatusProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);

  // Tick cada 10 s: suficiente para la etiqueta sin castigar el DOM.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const hasError = queries.some((q) => q.isError);
  const isFetching = queries.some((q) => q.isFetching || q.isLoading);
  const lastUpdate = Math.max(0, ...queries.map((q) => q.dataUpdatedAt));
  const secondsAgo = lastUpdate > 0 ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null;

  const dotClass = hasError
    ? "bg-state-critica animate-pulse"
    : isFetching
      ? "bg-state-atencion animate-pulse"
      : "bg-tv-accent";

  let label: string;
  if (hasError) {
    label = t("tv.refresh.error");
  } else if (isFetching) {
    label = t("tv.refresh.updating");
  } else if (secondsAgo === null) {
    label = t("tv.refresh.noData");
  } else if (secondsAgo < 60) {
    label = t("tv.refresh.secondsAgo", { n: secondsAgo });
  } else {
    label = t("tv.refresh.minutesAgo", { n: Math.round(secondsAgo / 60) });
  }

  return (
    <div
      className={`flex items-center gap-(--tvu-gap-sm) text-(length:--tvu-fs-xs) font-semibold ${hasError ? "text-state-critica" : "text-tv-dim"} ${className}`}
    >
      <span className={`size-(--tvu-dot) shrink-0 rounded-full ${dotClass}`} />
      {label}
    </div>
  );
}
