"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  Minus,
  RefreshCw,
  SearchX,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/common/Pagination";
import {
  EmptyValue,
  RiskBadge,
  SearchInput,
  SortableHeader,
  TableShell,
  tdClass,
  theadClass,
  useFilteredSorted,
  type SortAccessors,
  type SortDirection,
} from "@/components/data-table";
import { AccessDenied } from "@/components/ui/access-denied";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { LoadingRows } from "@/components/ui/loading-rows";
import { PageHeader } from "@/components/ui/page-header";
import { analyticsApi } from "@/lib/api-analytics";
import { dateLocale } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { PredictionTrend, RiskLevel } from "@/lib/types";
import type { PredictionTableRow } from "@/lib/types-analytics";
import { usePermissions } from "@/lib/use-permissions";

type SortKey = "nombre" | "codigo" | "grasa" | "proteina" | "riesgo" | "produccion";

// Rango de gravedad: orden ascendente = alto -> medio -> bajo.
const RISK_RANK: Record<RiskLevel, number> = { critico: 0, alto: 1, medio: 2, bajo: 3 };

// Definidos a nivel de modulo para que sean estables entre renders.
const accessors: SortAccessors<PredictionTableRow, SortKey> = {
  nombre: (row) => row.nombre,
  codigo: (row) => row.crotal_oficial,
  grasa: (row) => row.grasa,
  proteina: (row) => row.proteina,
  riesgo: (row) => RISK_RANK[row.riesgo],
  produccion: (row) => row.produccion_prevista,
};
const searchFields = (row: PredictionTableRow) => [row.nombre, row.crotal_oficial];
const byCode = (a: PredictionTableRow, b: PredictionTableRow) =>
  a.crotal_oficial.localeCompare(b.crotal_oficial, undefined, { numeric: true });
// Las columnas numericas empiezan de mayor a menor al pulsarlas.
const firstDirection: Partial<Record<SortKey, SortDirection>> = {
  grasa: "desc",
  proteina: "desc",
  produccion: "desc",
};

const trendIcon: Record<PredictionTrend, typeof TrendingUp> = {
  aumento: TrendingUp,
  descenso: TrendingDown,
  estable: Minus,
};

const trendColor: Record<PredictionTrend, string> = {
  aumento: "text-state-ok",
  descenso: "text-state-critica",
  estable: "text-app-dim",
};

function formatNumber(value: number, digits: number, locale: string) {
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function PredictionsPage() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const { role, can } = usePermissions();
  const canViewPredictions = can("view_predictions");

  // Una sola peticion con todas las filas (ya calculadas en bloque en
  // backend): permite ordenar por riesgo y buscar en todo el rebaño.
  const predictionsQuery = useQuery({
    queryKey: ["predictions-table", "produccion"],
    queryFn: () => analyticsApi.predictionsTable({ estado: "produccion" }),
    staleTime: 5 * 60_000,
    enabled: canViewPredictions,
  });

  const rows = predictionsQuery.data ?? [];
  const table = useFilteredSorted<PredictionTableRow, SortKey>({
    rows,
    accessors,
    searchFields,
    initialSort: { key: "riesgo", direction: "asc" },
    firstDirection,
    tiebreak: byCode,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const withAlert = rows.filter(
    (row) => row.riesgo === "alto" || row.riesgo === "critico" || row.tendencia_produccion === "descenso",
  ).length;
  const highRisk = rows.filter((row) => row.riesgo === "alto" || row.riesgo === "critico").length;

  if (!canViewPredictions) {
    return (
      <div className="min-h-full">
        <PageHeader eyebrow={t("predictions.eyebrow")} title={t("predictions.title")} EyebrowIcon={BrainCircuit} />
        <AccessDenied role={role} requiredCapability="view_predictions" description={t("predictions.accessDenied")} />
      </div>
    );
  }

  const sortProps = { sort: table.sort, onSort: table.toggleSort };

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("predictions.eyebrow")} title={t("predictions.title")} EyebrowIcon={BrainCircuit}>
        <button
          type="button"
          onClick={() => predictionsQuery.refetch()}
          disabled={predictionsQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-[10px] bg-brand-dark px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:bg-sidebar-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${predictionsQuery.isFetching ? "animate-spin" : ""}`} />
          {t("predictions.refresh")}
        </button>
      </PageHeader>

      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <BentoGrid>
          <BentoTile footprint="2x1">
            <KpiCard
              label={t("predictions.kpi.withAlert")}
              value={withAlert}
              tone={withAlert > 0 ? "warning" : "success"}
              Icon={ShieldAlert}
              sublabel={t("predictions.kpi.withAlertSub")}
              featured
            />
          </BentoTile>
          <BentoTile>
            <KpiCard
              label={t("predictions.kpi.highRisk")}
              value={highRisk}
              tone={highRisk > 0 ? "critical" : "success"}
              Icon={ShieldAlert}
            />
          </BentoTile>
          <BentoTile>
            <KpiCard label={t("predictions.kpi.analysed")} value={rows.length} tone="info" Icon={BrainCircuit} />
          </BentoTile>
        </BentoGrid>

        {/* Etiqueta honesta: heuristicas aritmeticas, no un modelo de ML. */}
        <p className="rounded-[10px] border border-state-info/30 bg-state-info/5 px-4 py-3 text-xs font-semibold text-state-info">
          {t("predictions.disclaimer")}
        </p>

        {predictionsQuery.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-red-700"
          >
            <span>
              {t("predictions.error")}: {predictionsQuery.error?.message}
            </span>
            <button
              type="button"
              onClick={() => predictionsQuery.refetch()}
              className="rounded-[8px] border border-current px-3 py-1 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <section aria-labelledby="predictions-table-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="predictions-table-title" className="font-heading text-base font-bold text-app-text">
              {t("predictions.table.title")}
            </h2>
            <SearchInput
              className="w-full sm:w-80"
              label={t("predictions.searchLabel")}
              placeholder={t("predictions.searchPlaceholder")}
              value={table.query}
              onChange={table.setQuery}
              status={
                predictionsQuery.isSuccess
                  ? t("dataTable.results", { shown: table.visibleRows.length, total: rows.length })
                  : undefined
              }
            />
          </div>

          {predictionsQuery.isLoading ? (
            <LoadingRows count={6} height="h-12" />
          ) : (
            <TableShell
              caption={t("predictions.table.caption")}
              stickyHeader
              isEmpty={predictionsQuery.isSuccess && table.visibleRows.length === 0}
              empty={
                rows.length === 0
                  ? { Icon: BrainCircuit, title: t("predictions.emptyTitle"), description: t("predictions.emptyDescription") }
                  : { Icon: SearchX, title: t("common.noResults"), description: t("dataTable.noMatchesDescription") }
              }
            >
              <thead className={theadClass}>
                <tr>
                  <SortableHeader label={t("predictions.col.name")} sortKey="nombre" {...sortProps} />
                  <SortableHeader label={t("predictions.col.code")} sortKey="codigo" {...sortProps} />
                  <SortableHeader label={t("predictions.col.fat")} sortKey="grasa" align="end" {...sortProps} />
                  <SortableHeader label={t("predictions.col.protein")} sortKey="proteina" align="end" {...sortProps} />
                  <SortableHeader label={t("predictions.col.risk")} sortKey="riesgo" {...sortProps} />
                  <SortableHeader label={t("predictions.col.production")} sortKey="produccion" align="end" {...sortProps} />
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {table.pageRows.map((row) => {
                  const TrendIcon = trendIcon[row.tendencia_produccion];
                  return (
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
                        {row.grasa != null ? `${formatNumber(row.grasa, 2, locale)} %` : <EmptyValue />}
                      </td>
                      <td className={`${tdClass} text-end tabular-nums`}>
                        {row.proteina != null ? `${formatNumber(row.proteina, 2, locale)} %` : <EmptyValue />}
                      </td>
                      <td className={`${tdClass} text-start`}>
                        <RiskBadge
                          level={row.riesgo}
                          title={row.factores_riesgo.length > 0 ? row.factores_riesgo.join(" · ") : undefined}
                        />
                      </td>
                      <td className={`${tdClass} text-end tabular-nums`}>
                        {row.produccion_prevista != null ? (
                          <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-app-text">
                            <TrendIcon aria-hidden="true" className={`h-4 w-4 ${trendColor[row.tendencia_produccion]}`} />
                            <span className="sr-only">{t(`predictions.trend.${row.tendencia_produccion}`)}</span>
                            {formatNumber(row.produccion_prevista, 1, locale)} {t("predictions.unitLitresDay")}
                          </span>
                        ) : (
                          <EmptyValue />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}

          {predictionsQuery.isSuccess && table.visibleRows.length > DEFAULT_PAGE_SIZE && (
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
