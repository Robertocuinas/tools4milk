"use client";

// Evolución diaria de alertas e incidencias por criticidad (Centro de control).
// Columnas apiladas por día (baja abajo, media, alta arriba) hechas con
// React + CSS (sin librerías de gráficos), en la línea de MiniCharts. Las
// columnas se reparten con flex, así que escalan al ancho del contenedor y se
// reflejan solas en RTL. El color siempre va acompañado de texto (leyenda con
// etiqueta y recuento, title por columna y tabla oculta para lectores de
// pantalla).

import { useQuery } from "@tanstack/react-query";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dashboardApi } from "@/lib/api-dashboard";
import { dateLocale } from "@/lib/i18n";
import type { SeverityDayCount, SeverityTrendResponse } from "@/lib/types-dashboard";

type Band = "alta" | "media" | "baja";
type Source = "all" | "incidencias" | "alertas";

const RANGE_OPTIONS = [7, 30] as const;

// Alta → rojo, Media → naranja, Baja → verde (tokens de estado de globals.css).
const BAND_COLORS: Record<Band, string> = {
  alta: "var(--color-state-critica)",
  media: "var(--color-state-atencion)",
  baja: "var(--color-state-ok)",
};

// Orden de apilado de abajo arriba.
const STACK_ORDER: Band[] = ["baja", "media", "alta"];
// Orden de lectura en leyenda y tabla (más grave primero).
const READ_ORDER: Band[] = ["alta", "media", "baja"];

const CHART_HEIGHT = 176;

function parseDay(value: string) {
  // "YYYY-MM-DD" como fecha local, sin desplazamiento por zona horaria.
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function niceTop(max: number) {
  if (max <= 0) return 2;
  return Math.ceil(max / 2) * 2;
}

function mergeSeries(data: SeverityTrendResponse, source: Source): SeverityDayCount[] {
  if (source === "incidencias") return data.incidencias.serie;
  if (source === "alertas") return data.alertas.serie;
  return data.incidencias.serie.map((day, index) => {
    const other = data.alertas.serie[index];
    return {
      fecha: day.fecha,
      alta: day.alta + (other?.alta ?? 0),
      media: day.media + (other?.media ?? 0),
      baja: day.baja + (other?.baja ?? 0),
      total: day.total + (other?.total ?? 0),
    };
  });
}

function sourceTotals(data: SeverityTrendResponse, source: Source) {
  const inc = data.incidencias;
  const ale = data.alertas;
  if (source === "incidencias") {
    return { ...inc.totales, previous: inc.total_periodo_anterior };
  }
  if (source === "alertas") {
    return { ...ale.totales, previous: ale.total_periodo_anterior };
  }
  return {
    alta: inc.totales.alta + ale.totales.alta,
    media: inc.totales.media + ale.totales.media,
    baja: inc.totales.baja + ale.totales.baja,
    total: inc.totales.total + ale.totales.total,
    criticas: inc.totales.criticas + ale.totales.criticas,
    previous: inc.total_periodo_anterior + ale.total_periodo_anterior,
  };
}

function SegmentedToggle<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] border border-app-border bg-app-bg p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-[8px] px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
              active ? "bg-white text-brand-dark shadow-sm" : "text-app-dim hover:text-app-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SeverityTrendChart({
  series,
  locale,
}: {
  series: SeverityDayCount[];
  locale: string;
}) {
  const { t } = useTranslation();
  const bandLabel: Record<Band, string> = {
    alta: t("dashboard.severityTrend.high"),
    media: t("dashboard.severityTrend.medium"),
    baja: t("dashboard.severityTrend.low"),
  };
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const longDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const top = niceTop(Math.max(0, ...series.map((d) => d.total)));
  const ticks = [top, top / 2, 0];
  // Con 30 días se etiqueta uno de cada cinco para que el eje siga legible en móvil.
  const labelStep = series.length > 10 ? 5 : 1;

  return (
    <div>
      <div className="flex gap-2" aria-hidden="true">
        {/* Eje Y */}
        <div className="flex shrink-0 flex-col justify-between text-end text-[10px] font-semibold tabular-nums text-app-dim" style={{ height: CHART_HEIGHT }}>
          {ticks.map((tick) => (
            <span key={tick} className="leading-none">
              {tick}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: CHART_HEIGHT }}>
          {/* Líneas guía */}
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute border-t border-dashed border-app-border"
              style={{ insetInlineStart: 0, insetInlineEnd: 0, top: `${(1 - tick / top) * 100}%` }}
            />
          ))}

          {/* Columnas apiladas */}
          <div className="relative flex h-full items-end gap-[2px] sm:gap-1">
            {series.map((day) => {
              const title = t("dashboard.severityTrend.barTitle", {
                date: longDate.format(parseDay(day.fecha)),
                high: day.alta,
                medium: day.media,
                low: day.baja,
                total: day.total,
              });
              return (
                <div
                  key={day.fecha}
                  title={title}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-[4px]"
                    style={{ height: `${(day.total / top) * 100}%` }}
                  >
                    {STACK_ORDER.map((band) =>
                      day[band] > 0 ? (
                        <div
                          key={band}
                          style={{ height: `${(day[band] / Math.max(1, day.total)) * 100}%`, backgroundColor: BAND_COLORS[band] }}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Eje X */}
      <div className="flex gap-2" aria-hidden="true">
        <div className="invisible shrink-0 text-[10px] tabular-nums">{top}</div>
        <div className="flex min-w-0 flex-1 gap-[2px] pt-1.5 sm:gap-1">
          {series.map((day, index) => {
            // Se cuenta desde el final para que siempre se etiquete el día actual.
            const show = (series.length - 1 - index) % labelStep === 0;
            return (
              <div key={day.fecha} className="relative min-w-0 flex-1 text-center text-[10px] font-semibold text-app-dim">
                {show ? <span className="whitespace-nowrap">{shortDate.format(parseDay(day.fecha))}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-app-dim" aria-hidden="true">
        <span>{t("dashboard.severityTrend.axisCount")}</span>
        <span>{t("dashboard.severityTrend.axisDate")}</span>
      </div>

      {/* Resumen textual para lectores de pantalla */}
      <table className="sr-only">
        <caption>{t("dashboard.severityTrend.tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.severityTrend.colDate")}</th>
            {READ_ORDER.map((band) => (
              <th key={band} scope="col">{bandLabel[band]}</th>
            ))}
            <th scope="col">{t("dashboard.severityTrend.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((day) => (
            <tr key={day.fecha}>
              <th scope="row">{longDate.format(parseDay(day.fecha))}</th>
              {READ_ORDER.map((band) => (
                <td key={band}>{day[band]}</td>
              ))}
              <td>{day.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SeverityTrendPanel() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [source, setSource] = useState<Source>("all");

  const trend = useQuery({
    queryKey: ["dashboard-severity-trend", days],
    queryFn: () => dashboardApi.severityTrend(days),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const data = trend.data;
  const series = useMemo(() => (data ? mergeSeries(data, source) : []), [data, source]);
  const totals = data ? sourceTotals(data, source) : null;

  const bandLabel: Record<Band, string> = {
    alta: t("dashboard.severityTrend.high"),
    media: t("dashboard.severityTrend.medium"),
    baja: t("dashboard.severityTrend.low"),
  };

  // Tendencia: total del periodo frente al periodo anterior de igual
  // longitud, ambos calculados en el backend con datos reales.
  let trendBadge: { Icon: typeof TrendingUp; label: string; tone: string } | null = null;
  if (totals && (totals.total > 0 || totals.previous > 0)) {
    if (totals.total < totals.previous) {
      trendBadge = { Icon: TrendingDown, label: t("dashboard.severityTrend.trendImproving"), tone: "bg-state-ok/10 text-state-ok" };
    } else if (totals.total > totals.previous) {
      trendBadge = { Icon: TrendingUp, label: t("dashboard.severityTrend.trendWorsening"), tone: "bg-state-critica/10 text-state-critica" };
    } else {
      trendBadge = { Icon: Minus, label: t("dashboard.severityTrend.trendStable"), tone: "bg-app-surface2 text-app-dim" };
    }
  }

  return (
    <section aria-labelledby="severity-trend-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-app-dim">
            {t("dashboard.severityTrend.eyebrow")}
          </p>
          <h2 id="severity-trend-title" className="mt-0.5 font-heading text-base font-bold text-app-text">
            {t("dashboard.severityTrend.title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle
            label={t("dashboard.severityTrend.sourceLabel")}
            value={source}
            onChange={setSource}
            options={[
              { value: "all", label: t("dashboard.severityTrend.sourceAll") },
              { value: "incidencias", label: t("dashboard.severityTrend.sourceIncidents") },
              { value: "alertas", label: t("dashboard.severityTrend.sourceAlerts") },
            ]}
          />
          <SegmentedToggle
            label={t("dashboard.severityTrend.rangeLabel")}
            value={days}
            onChange={setDays}
            options={RANGE_OPTIONS.map((value) => ({ value, label: t("dashboard.severityTrend.rangeDays", { days: value }) }))}
          />
        </div>
      </div>

      {trend.isLoading ? (
        <div className="animate-pulse rounded-[10px] bg-app-surface2" style={{ height: CHART_HEIGHT + 40 }} />
      ) : trend.isError || !data || !totals ? (
        <div className="grid place-items-center rounded-[10px] border border-dashed border-app-border text-sm text-app-dim" style={{ height: CHART_HEIGHT + 40 }}>
          {t("dashboard.severityTrend.loadError")}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {/* Leyenda: color + texto + recuento del periodo */}
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label={t("dashboard.severityTrend.legend")}>
              {READ_ORDER.map((band) => (
                <li key={band} className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
                  <span aria-hidden="true" className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: BAND_COLORS[band] }} />
                  {bandLabel[band]}
                  <span className="font-bold tabular-nums">{totals[band]}</span>
                </li>
              ))}
              <li className="text-xs text-app-dim">
                {t("dashboard.severityTrend.periodTotal", { total: totals.total })}
              </li>
            </ul>
            {trendBadge && (
              <p className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${trendBadge.tone}`}>
                <trendBadge.Icon aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" />
                <span>{trendBadge.label}</span>
                <span className="font-semibold opacity-80">
                  {t("dashboard.severityTrend.trendVs", { current: totals.total, previous: totals.previous, days })}
                </span>
              </p>
            )}
          </div>

          <div className="relative">
            <SeverityTrendChart series={series} locale={dateLocale(i18n.language)} />
            {totals.total === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm font-semibold text-app-dim">
                {t("dashboard.severityTrend.noData")}
              </p>
            )}
          </div>

          {totals.criticas > 0 && (
            <p className="mt-2 text-xs text-app-dim">
              {t("dashboard.severityTrend.criticalNote", { total: totals.criticas })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
