"use client";

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dateLocale } from "@/lib/i18n";
import type { ShiftHandover } from "@/lib/types";

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHandoverMarkedAsRead(handoverId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = `handover_read_${handoverId}`;
  return localStorage.getItem(key) === "true";
}

function markHandoverAsRead(handoverId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(`handover_read_${handoverId}`, "true");
  }
}

export function LastHandoverCard({
  handover,
  onMarkAsRead,
  readOnly = false,
}: {
  handover: ShiftHandover;
  onMarkAsRead: () => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  // Check localStorage regardless of readOnly — all modes should hide after Tablet validation
  const isRead = getHandoverMarkedAsRead(handover.id);

  if (isRead) return null;

  const handleMarkAsRead = () => {
    markHandoverAsRead(handover.id);
    onMarkAsRead();
  };

  return (
    <div className="mb-6 rounded-[14px] border-2 border-state-info/50 bg-state-info/5 p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-bold text-state-info">{t("zone.handover.title")}</h3>
            <span className="rounded-full bg-state-info/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-state-info">
              {t("zone.handover.new")}
            </span>
          </div>
          <p className="mt-1 text-xs text-app-dim">{t("zone.handover.generatedAt", { date: formatDate(handover.ts_generacion, dateLocale(i18n.language)) })}</p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleMarkAsRead}
            className="tablet-touch flex w-full items-center justify-center gap-2 rounded-[10px] bg-state-ok px-4 py-2 text-sm font-bold text-white transition hover:bg-state-ok/90 sm:ms-auto sm:w-auto"
          >
            <Check className="h-4 w-4" />
            {t("zone.handover.markSeen")}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="mt-4 space-y-3">
        {/* Notes */}
        {handover.notas_saliente && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-app-dim">{t("zone.handover.comments")}</p>
            <p className="mt-1 text-sm text-app-text">{handover.notas_saliente}</p>
          </div>
        )}

        {/* Incidents */}
        {handover.incidencias_abiertas && handover.incidencias_abiertas.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-state-atencion">
              {t("zone.handover.reportedIncidents")}
            </p>
            <ul className="mt-1 space-y-1 text-sm text-app-text">
              {handover.incidencias_abiertas.map((incident: unknown, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-state-atencion" />
                  <span>
                    {typeof incident === "string"
                      ? incident
                      : typeof incident === "object" && incident !== null && "descripcion" in incident
                        ? (incident as Record<string, string>).descripcion || t("zone.handover.incidentFallback")
                        : t("zone.handover.incidentFallback")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pending tasks */}
        {handover.tareas_pendientes && handover.tareas_pendientes.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-state-info">{t("zone.handover.pendingTasks")}</p>
            <ul className="mt-1 space-y-1 text-sm text-app-text">
              {handover.tareas_pendientes.map((task: unknown, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-state-info" />
                  <span>
                    {typeof task === "string"
                      ? task
                      : typeof task === "object" && task !== null && "nombre" in task
                        ? (task as Record<string, string>).nombre || t("leanfarming.taskFallback")
                        : t("leanfarming.taskFallback")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
