"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, Droplets, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/common/Pagination";
import {
  EmptyValue,
  SearchInput,
  SortableHeader,
  StatusBadge,
  TableShell,
  tdClass,
  theadClass,
  useFilteredSorted,
  type SortAccessors,
  type SortDirection,
} from "@/components/data-table";
import { BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { LoadingRows } from "@/components/ui/loading-rows";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { analyticsApi } from "@/lib/api-analytics";
import { dateLocale } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { QualityTableRow } from "@/lib/types-analytics";

type MetricStatus = "ok" | "warning" | "critical";
type MetricKey = "grasa" | "proteina" | "produccion" | "rcs";
type SortKey = "nombre" | "codigo" | MetricKey | "score";

// Umbrales por metrica que ya usaba esta pantalla (tarjetas de composicion).
// Coinciden con las penalizaciones del score de calidad calculado en backend
// (lactations_service.quality_score).
function metricStatus(metric: MetricKey, value: number | null): MetricStatus {
  if (value == null) return "ok";
  if (metric === "grasa") return value < 3.4 || value > 4.6 ? "warning" : "ok";
  if (metric === "proteina") return value < 3.0 || value > 3.8 ? "warning" : "ok";
  if (metric === "produccion") return value < 16 ? "critical" : value < 20 ? "warning" : "ok";
  return value >= 400000 ? "critical" : value >= 250000 ? "warning" : "ok";
}

// Mismo corte que la tarjeta anterior: >= 85 en verde, por debajo "vigilar".
const SCORE_OK = 85;

const accessors: SortAccessors<QualityTableRow, SortKey> = {
  nombre: (row) => row.nombre,
  codigo: (row) => row.crotal_oficial,
  grasa: (row) => row.grasa,
  proteina: (row) => row.proteina,
  produccion: (row) => row.produccion,
  rcs: (row) => row.rcs,
  score: (row) => row.score,
};
const searchFields = (row: QualityTableRow) => [row.nombre, row.crotal_oficial];
const byCode = (a: QualityTableRow, b: QualityTableRow) =>
  a.crotal_oficial.localeCompare(b.crotal_oficial, undefined, { numeric: true });
// Primer clic = "mejor primero": mas produccion/grasa/proteina/score, menos RCS.
const firstDirection: Partial<Record<SortKey, SortDirection>> = {
  grasa: "desc",
  proteina: "desc",
  produccion: "desc",
  rcs: "asc",
  score: "desc",
};

function formatNumber(value: number | null | undefined, digits: number, locale: string) {
  if (value == null || Number.isNaN(value)) return null;
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Valor numerico con aviso (icono + texto oculto) si esta fuera de rango. */
function MetricCell({ value, status, unit }: { value: string | null; status: MetricStatus; unit: string }) {
  const { t } = useTranslation();
  if (value == null) return <EmptyValue />;
  const Icon = status === "critical" ? AlertOctagon : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 ${
        status === "critical" ? "font-bold text-red-700" : status === "warning" ? "font-semibold text-amber-800" : "text-app-text"
      }`}
    >
      {status !== "ok" && (
        <>
          <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">{t(`quality.status.${status}`)}</span>
        </>
      )}
      {value}
      {unit && <span className="text-xs font-normal text-app-dim">{unit}</span>}
    </span>
  );
}

export default function QualityPage() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  // Leche a la Carta filters (client-side)
  const [filterGrasaMin, setFilterGrasaMin] = useState("");
  const [filterProteinaMin, setFilterProteinaMin] = useState("");
  const [filterRcsMax, setFilterRcsMax] = useState("");
  const [showLecheACarta, setShowLecheACarta] = useState(false);

  // Una fila por animal en produccion con su lactacion activa y el score
  // (calculado en backend): una sola peticion para toda la tabla.
  const rowsQuery = useQuery({
    queryKey: ["quality-table", "produccion"],
    queryFn: () => analyticsApi.qualityTable({ estado: "produccion" }),
    staleTime: 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["quality-summary"],
    queryFn: api.qualitySummary,
    staleTime: 60_000,
  });

  // Auditoria post-implementacion (hallazgo 4.5): un 500 no debe verse
  // identico a "sin datos".
  const isError = rowsQuery.isError || summaryQuery.isError;

  const rows = rowsQuery.data ?? [];
  const table = useFilteredSorted<QualityTableRow, SortKey>({
    rows,
    accessors,
    searchFields,
    initialSort: { key: "score", direction: "asc" },
    firstDirection,
    tiebreak: byCode,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // KPIs sobre las lactaciones activas de los animales en produccion.
  const withLactation = rows.filter((row) => row.lactacion_id != null);

  const hasLecheFilters = Boolean(filterGrasaMin || filterProteinaMin || filterRcsMax);
  const lecheMatches = (() => {
    if (!hasLecheFilters) return [];
    const grasaMin = filterGrasaMin ? Number(filterGrasaMin) : 0;
    const proteinaMin = filterProteinaMin ? Number(filterProteinaMin) : 0;
    const rcsMax = filterRcsMax ? Number(filterRcsMax) * 1000 : Infinity;
    return withLactation.filter((row) => {
      if (filterGrasaMin && (row.grasa ?? 0) < grasaMin) return false;
      if (filterProteinaMin && (row.proteina ?? 0) < proteinaMin) return false;
      if (filterRcsMax && (row.rcs ?? Infinity) > rcsMax) return false;
      return true;
    });
  })();

  const sortProps = { sort: table.sort, onSort: table.toggleSort };
  const inputClass =
    "h-10 rounded-[10px] border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("quality.eyebrow")} title={t("quality.title")} EyebrowIcon={Droplets}>
        <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">
          {t("quality.inControl", { count: summaryQuery.data?.animales_en_control ?? withLactation.length })}
        </span>
      </PageHeader>

      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {isError && (
          <div
            role="alert"
            className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-red-700"
          >
            {t("quality.error")}: {rowsQuery.error?.message || summaryQuery.error?.message || t("common.error")}
          </div>
        )}

        {summaryQuery.isLoading && (
          <div role="status" aria-busy="true" className="grid grid-cols-2 gap-[var(--bento-gap)] xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-[var(--bento-radius)] border border-app-border bg-white" />)}
          </div>
        )}

        {summaryQuery.isSuccess && (
          <div className="grid grid-cols-2 gap-[var(--bento-gap)] xl:grid-cols-4">
            <BentoTile><KpiCard label={t("quality.col.fat")} value={formatNumber(summaryQuery.data.grasa_promedio, 2, locale) ?? "—"} sublabel="%" tone="default" Icon={Droplets} /></BentoTile>
            <BentoTile><KpiCard label={t("quality.col.protein")} value={formatNumber(summaryQuery.data.proteina_promedio, 2, locale) ?? "—"} sublabel="%" tone="default" Icon={Droplets} /></BentoTile>
            <BentoTile><KpiCard label={t("quality.kpi.avgProduction")} value={formatNumber(summaryQuery.data.produccion_promedio, 1, locale) ?? "—"} sublabel={t("quality.kpi.perDay")} tone="default" Icon={Droplets} /></BentoTile>
            <BentoTile><KpiCard label={t("quality.col.rcs")} value={formatNumber(summaryQuery.data.rcs_promedio, 0, locale) ?? "—"} sublabel={t("quality.unitCells")} tone="default" Icon={Droplets} /></BentoTile>
          </div>
        )}

        {/* ── Leche a la Carta ── */}
        <div className="rounded-[var(--bento-radius)] border border-app-border bg-white p-[var(--bento-padding)] shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Droplets aria-hidden="true" className="h-4 w-4 text-brand" />
              <h2 className="font-heading text-base font-bold text-app-text">{t("quality.leche.title")}</h2>
              <span className="rounded-full bg-brand/8 px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
                {t("quality.leche.badge")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowLecheACarta((v) => !v)}
              aria-expanded={showLecheACarta}
              aria-controls="leche-a-la-carta"
              className="rounded-[6px] text-xs font-semibold text-brand-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              {showLecheACarta ? t("quality.leche.hide") : t("quality.leche.expand")}
            </button>
          </div>

          {showLecheACarta && (
            <div id="leche-a-la-carta" className="mt-4 space-y-4">
              <p className="text-xs text-app-dim">{t("quality.leche.description")}</p>
              <div className="flex flex-wrap gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                    {t("quality.leche.fatMin")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={filterGrasaMin}
                    onChange={(e) => setFilterGrasaMin(e.target.value)}
                    placeholder="3.8"
                    className={`${inputClass} w-32`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                    {t("quality.leche.proteinMin")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={filterProteinaMin}
                    onChange={(e) => setFilterProteinaMin(e.target.value)}
                    placeholder="3.1"
                    className={`${inputClass} w-32`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                    {t("quality.leche.rcsMax")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={filterRcsMax}
                    onChange={(e) => setFilterRcsMax(e.target.value)}
                    placeholder="250"
                    className={`${inputClass} w-36`}
                  />
                </label>
                {hasLecheFilters && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterGrasaMin("");
                        setFilterProteinaMin("");
                        setFilterRcsMax("");
                      }}
                      className="h-10 rounded-[10px] border border-app-border px-3 text-sm text-app-dim hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {t("quality.leche.clear")}
                    </button>
                  </div>
                )}
              </div>

              {hasLecheFilters && (
                <div>
                  <p aria-live="polite" className="mb-2 text-xs font-semibold text-app-dim">
                    {t("quality.leche.matching", { count: lecheMatches.length })}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {lecheMatches.slice(0, 12).map((row) => (
                      <div key={row.animal_id} className="rounded-[10px] border border-brand/20 bg-brand/5 px-4 py-3">
                        <Link
                          href={`/animals/${row.animal_id}`}
                          className="rounded-[4px] font-mono text-sm font-bold text-brand-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {row.crotal_oficial}
                        </Link>
                        {row.nombre && <span className="ms-2 text-sm text-app-dim">{row.nombre}</span>}
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-app-dim">
                          {row.grasa != null && <span>{t("quality.col.fat")}: {formatNumber(row.grasa, 2, locale)} %</span>}
                          {row.proteina != null && <span>{t("quality.col.protein")}: {formatNumber(row.proteina, 2, locale)} %</span>}
                          {row.rcs != null && <span>{t("quality.col.rcs")}: {formatNumber(row.rcs / 1000, 0, locale)}k</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <section aria-labelledby="quality-table-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="quality-table-title" className="font-heading text-base font-bold text-app-text">
                {t("quality.table.title")}
              </h2>
              <p className="mt-0.5 text-xs text-app-dim">{t("quality.table.scoreHelp")}</p>
            </div>
            <SearchInput
              className="w-full sm:w-80"
              label={t("quality.searchLabel")}
              placeholder={t("quality.searchPlaceholder")}
              value={table.query}
              onChange={table.setQuery}
              status={
                rowsQuery.isSuccess ? t("dataTable.results", { shown: table.visibleRows.length, total: rows.length }) : undefined
              }
            />
          </div>

          {rowsQuery.isLoading ? (
            <LoadingRows count={6} height="h-12" />
          ) : (
            <TableShell
              caption={t("quality.table.caption")}
              stickyHeader
              minWidthClass="min-w-[820px]"
              isEmpty={rowsQuery.isSuccess && table.visibleRows.length === 0}
              empty={
                rows.length === 0
                  ? { Icon: Droplets, title: t("quality.emptyTitle"), description: t("quality.emptyDescription") }
                  : { Icon: SearchX, title: t("common.noResults"), description: t("dataTable.noMatchesDescription") }
              }
            >
              <thead className={theadClass}>
                <tr>
                  <SortableHeader label={t("quality.col.name")} sortKey="nombre" {...sortProps} />
                  <SortableHeader label={t("quality.col.code")} sortKey="codigo" {...sortProps} />
                  <SortableHeader label={t("quality.col.fat")} sortKey="grasa" align="end" {...sortProps} />
                  <SortableHeader label={t("quality.col.protein")} sortKey="proteina" align="end" {...sortProps} />
                  <SortableHeader label={t("quality.col.production")} sortKey="produccion" align="end" {...sortProps} />
                  <SortableHeader label={t("quality.col.rcs")} sortKey="rcs" align="end" {...sortProps} />
                  <SortableHeader label={t("quality.col.score")} sortKey="score" align="end" {...sortProps} />
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {table.pageRows.map((row) => (
                  <tr key={row.animal_id} className="transition hover:bg-app-bg/60">
                    <td className={`${tdClass} text-start`}>
                      {row.nombre ? (
                        <Link
                          href={`/animals/${row.animal_id}`}
                          className="rounded-[4px] font-semibold text-app-text hover:text-brand-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {row.nombre}
                        </Link>
                      ) : (
                        <EmptyValue title={t("dataTable.noName")} />
                      )}
                      {row.lactacion_id == null && (
                        <span className="ms-2 text-xs text-app-dim">{t("quality.noLactation")}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-start`}>
                      <Link
                        href={`/animals/${row.animal_id}`}
                        className="rounded-[4px] font-mono text-sm font-bold text-brand-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        aria-label={t("dataTable.viewAnimal", { code: row.crotal_oficial })}
                      >
                        {row.crotal_oficial}
                      </Link>
                    </td>
                    <td className={`${tdClass} text-end tabular-nums`}>
                      <MetricCell value={formatNumber(row.grasa, 2, locale)} status={metricStatus("grasa", row.grasa)} unit="%" />
                    </td>
                    <td className={`${tdClass} text-end tabular-nums`}>
                      <MetricCell value={formatNumber(row.proteina, 2, locale)} status={metricStatus("proteina", row.proteina)} unit="%" />
                    </td>
                    <td className={`${tdClass} text-end tabular-nums`}>
                      <MetricCell
                        value={formatNumber(row.produccion, 1, locale)}
                        status={metricStatus("produccion", row.produccion)}
                        unit={t("quality.unitLitresDay")}
                      />
                    </td>
                    <td className={`${tdClass} text-end tabular-nums`}>
                      <MetricCell value={formatNumber(row.rcs, 0, locale)} status={metricStatus("rcs", row.rcs)} unit={t("quality.unitCells")} />
                    </td>
                    <td className={`${tdClass} text-end`}>
                      {row.score != null ? (
                        <StatusBadge
                          tone={row.score >= SCORE_OK ? "ok" : "warning"}
                          label={String(row.score)}
                          title={row.score >= SCORE_OK ? t("quality.status.ok") : t("quality.status.review")}
                          srLabel={row.score >= SCORE_OK ? t("quality.status.ok") : t("quality.status.review")}
                        />
                      ) : (
                        <EmptyValue />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}

          {rowsQuery.isSuccess && table.visibleRows.length > DEFAULT_PAGE_SIZE && (
            <Pagination
              page={table.page}
              pageSize={DEFAULT_PAGE_SIZE}
              currentCount={table.pageRows.length}
              totalItems={table.visibleRows.length}
              hasNext={table.hasNext}
              onPageChange={table.setPage}
            />
          )}
        </section>
      </div>
    </div>
  );
}
