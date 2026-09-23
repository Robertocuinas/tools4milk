"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  Tablet,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/common/Pagination";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";
import type { ShiftHandover } from "@/lib/types";
import { useState } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CountPill({
  count,
  label,
  Icon,
  tone,
}: {
  count: number;
  label: string;
  Icon: typeof AlertOctagon;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-app-bg px-3 py-2">
      <Icon className={`h-4 w-4 ${tone}`} />
      <span className={`font-heading text-base font-bold ${tone}`}>{count}</span>
      <span className="text-xs text-app-dim">{label}</span>
    </div>
  );
}

function HandoverCard({ handover, shiftLookup }: {
  handover: ShiftHandover;
  shiftLookup: Map<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const saliente = shiftLookup.get(handover.turno_saliente_id);
  const entrante = shiftLookup.get(handover.turno_entrante_id);
  const isConfirmed = !!handover.ts_confirmacion;

  return (
    <article className={`rounded-[var(--bento-radius)] border bg-white shadow-card ${isConfirmed ? "border-state-ok/30" : "border-app-border"}`}>
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-app-dim">
              <span className="font-semibold text-app-text">
                {saliente ?? handover.turno_saliente_id.slice(0, 8) + "…"}
              </span>
              <ArrowLeftRight className="h-4 w-4 shrink-0" />
              <span className="font-semibold text-app-text">
                {entrante ?? handover.turno_entrante_id.slice(0, 8) + "…"}
              </span>
            </div>
            <p className="mt-1 text-xs text-app-dim">
              {t("handover.generatedAt", { date: formatDate(handover.ts_generacion, locale) })}
            </p>
          </div>
          {isConfirmed ? (
            <span className="flex items-center gap-1.5 rounded-full bg-state-ok/15 px-2.5 py-1 text-[11px] font-extrabold uppercase text-state-ok">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("handover.confirmed")}
            </span>
          ) : (
            <span className="rounded-full bg-state-atencion/10 px-2.5 py-1 text-[11px] font-extrabold uppercase text-state-atencion">
              {t("handover.pending")}
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="mt-4 flex flex-wrap gap-2">
          <CountPill
            count={handover.incidencias_abiertas.length}
            label={t("handover.pillIncidents", { count: handover.incidencias_abiertas.length })}
            Icon={AlertOctagon}
            tone={handover.incidencias_abiertas.length > 0 ? "text-state-critica" : "text-app-dim"}
          />
          <CountPill
            count={handover.tareas_pendientes.length}
            label={t("handover.pillPendingTasks", { count: handover.tareas_pendientes.length })}
            Icon={ClipboardList}
            tone={handover.tareas_pendientes.length > 0 ? "text-state-atencion" : "text-app-dim"}
          />
        </div>

        {/* Notes */}
        {handover.notas_saliente && (
          <div className="mt-4 rounded-[10px] bg-app-bg px-4 py-3">
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-app-dim">
              {t("handover.outgoingNotes")}
            </p>
            <p className="text-sm text-app-text">{handover.notas_saliente}</p>
          </div>
        )}

        {/* Confirmation info */}
        {isConfirmed && (
          <p className="mt-3 text-xs text-app-dim">
            {t("handover.confirmedAt", { date: formatDate(handover.ts_confirmacion, locale) })}
          </p>
        )}
      </div>
    </article>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function HandoverPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  const handoversQuery = useQuery({
    queryKey: ["shift-handovers", page],
    queryFn: () =>
      api.shiftHandovers({
        skip: getSkip(page, pageSize),
        limit: pageSize + 1,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Load shifts for cross-reference display (turno_id → human label)
  const shiftsQuery = useQuery({
    queryKey: ["shifts", "todos", "", 1],
    queryFn: () => api.shifts({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const shiftLookup = new Map<string, string>();
  for (const s of shiftsQuery.data?.turnos ?? []) {
    if (s.fecha && s.tipo_turno) {
      const tipoLabel = enumLabel("shiftType", s.tipo_turno);
      const label = `${s.fecha} · ${tipoLabel} (${s.hora_inicio?.slice(0, 5) ?? ""}–${s.hora_fin?.slice(0, 5) ?? ""})`;
      shiftLookup.set(s.id, label);
    }
  }

  const pageData = handoversQuery.data?.resumenes ?? [];
  const hasNext = pageData.length > pageSize;
  const pageItems = pageData.slice(0, pageSize);
  const total = handoversQuery.data?.total ?? 0;
  const confirmed = handoversQuery.data?.confirmados ?? 0;
  const pending = handoversQuery.data?.pendientes ?? 0;

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("handover.eyebrow")} title={t("nav.handover")} EyebrowIcon={ArrowLeftRight}>
        <div className="flex items-center gap-3">
          {handoversQuery.data && (
            <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">
              {t("handover.summariesCount", { count: total })}
            </span>
          )}
          <Link
            href="/handover/tablet"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-app-bg px-3 py-2 text-sm font-semibold text-app-dim transition hover:border-brand/30 hover:text-brand"
          >
            <Tablet className="h-4 w-4" />
            {t("handover.tabletLink")}
          </Link>
        </div>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* KPIs */}
        {handoversQuery.isSuccess && (
          <BentoGrid>
            <BentoTile footprint={pending > 0 ? "2x1" : "1x1"}><KpiCard label={t("handover.kpiPending")} value={pending} tone={pending > 0 ? "warning" : "success"} sublabel={t("handover.kpiPendingSublabel")} featured={pending > 0} /></BentoTile>
            <BentoTile><KpiCard label={t("handover.kpiConfirmed")} value={confirmed} tone="success" Icon={CheckCircle2} /></BentoTile>
            <BentoTile><KpiCard label={t("handover.kpiTotal")} value={total} tone="default" /></BentoTile>
          </BentoGrid>
        )}

        {/* Info notice */}
        <div className="rounded-[10px] border border-state-info/30 bg-state-info/5 px-4 py-3 text-xs font-semibold text-state-info">
          {t("handover.infoNotice")}
        </div>

        {/* Loading */}
        {handoversQuery.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-[10px] bg-app-bg" />
            ))}
          </div>
        )}

        {/* Error */}
        {handoversQuery.isError && (
          <div className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
            {t("handover.loadError", { message: handoversQuery.error.message })}
          </div>
        )}

        {/* Empty */}
        {handoversQuery.isSuccess && pageItems.length === 0 && (
          <EmptyState
            Icon={ArrowLeftRight}
            title={t("handover.emptyTitle")}
            description={t("handover.emptyDescription")}
          />
        )}

        {/* List */}
        <div className="space-y-3">
          {pageItems.map((handover) => (
            <HandoverCard
              key={handover.id}
              handover={handover}
              shiftLookup={shiftLookup}
            />
          ))}
        </div>

        {/* Pagination */}
        {!handoversQuery.isLoading && pageItems.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            currentCount={pageItems.length}
            hasNext={hasNext}
            isLoading={handoversQuery.isFetching}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
