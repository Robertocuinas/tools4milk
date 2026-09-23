"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Beef,
  CheckCircle2,
  ClipboardList,
  Droplets,
  MapPin,
  Package,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AccessDenied } from "@/components/ui/access-denied";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { PanelCard, SectionTitle } from "@/components/ui/panel-card";
import { WeatherPanel } from "@/components/ui/WeatherPanel";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { visualZoneSummaries, visualZoneText } from "@/lib/visual-zones";
import type { Incident, Order, Task } from "@/lib/types";

// ── Period helpers ────────────────────────────────────────────────────────────

type Period = "7d" | "semana" | "30d";

// Los rotulos de periodo se resuelven con t() en render: report.periods.<p>
// (boton / titulo) y report.periodIn.<p> (sublabel de KPI).

function getPeriodStart(period: Period): Date {
  const now = new Date();
  if (period === "semana") {
    const day = now.getDay();
    const d = new Date(now);
    d.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = period === "30d" ? 30 : 7;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inPeriod(iso: string | null | undefined, start: Date): boolean {
  if (!iso) return false;
  return new Date(iso) >= start;
}

// ── Mini table row ────────────────────────────────────────────────────────────

function MiniRow({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-app-border py-2.5 text-sm last:border-0">
      <span className="text-app-dim">{label}</span>
      <span className={`font-bold text-app-text ${tone}`}>{value}</span>
    </div>
  );
}

// ── Status comment generator ──────────────────────────────────────────────────

function buildStatusComment(
  t: TFunction,
  criticalIncidents: number,
  openIncidents: number,
  delayedTasks: number,
  pendingOrders: number,
): { text: string; tone: string } {
  if (criticalIncidents > 0) {
    return { text: t("report.comment.critical", { count: criticalIncidents }), tone: "text-state-critica" };
  }
  if (openIncidents > 2) {
    return { text: t("report.comment.openIncidents", { count: openIncidents }), tone: "text-state-atencion" };
  }
  if (delayedTasks > 3) {
    return { text: t("report.comment.delayedTasks", { count: delayedTasks }), tone: "text-state-atencion" };
  }
  if (pendingOrders > 0) {
    return { text: t("report.comment.pendingOrders", { count: pendingOrders }), tone: "text-state-info" };
  }
  return { text: t("report.comment.allClear"), tone: "text-state-ok" };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const { role, can } = usePermissions();
  const canViewReport = can("view_report");

  const [period, setPeriod] = useState<Period>("7d");
  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  const summaryQ = useQuery({ queryKey: ["dashboard-summary"], queryFn: api.dashboardSummary, staleTime: 30_000, enabled: canViewReport });
  const tasksQ = useQuery({ queryKey: ["report-tasks"], queryFn: () => api.tasks({ limit: 300 }), staleTime: 30_000, enabled: canViewReport });
  const incidentsQ = useQuery({ queryKey: ["report-incidents"], queryFn: () => api.incidents({ limit: 200 }), staleTime: 30_000, enabled: canViewReport });
  const ordersQ = useQuery({ queryKey: ["report-orders"], queryFn: () => api.orders({ limit: 100 }), staleTime: 30_000, enabled: canViewReport });
  const qualityQ = useQuery({ queryKey: ["quality-summary"], queryFn: api.qualitySummary, staleTime: 60_000, enabled: canViewReport });
  const zonesQ = useQuery({ queryKey: ["zones"], queryFn: api.zones, staleTime: 60_000, enabled: canViewReport });

  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const allIncidents = useMemo(() => (incidentsQ.data ?? []) as Incident[], [incidentsQ.data]);
  const allOrders = useMemo(() => ordersQ.data?.pedidos ?? [], [ordersQ.data]);
  const zones = zonesQ.data ?? [];
  const zoneSummaries = visualZoneSummaries(zones, allTasks);

  // Period-filtered data
  const tasks = useMemo(() => allTasks.filter((t: Task) => inPeriod(t.fecha_programada, periodStart)), [allTasks, periodStart]);
  const incidents = useMemo(() => allIncidents.filter((i) => inPeriod(i.fecha_creacion, periodStart)), [allIncidents, periodStart]);
  const orders = useMemo(() => allOrders.filter((o: Order) => inPeriod(o.ts_solicitud, periodStart)), [allOrders, periodStart]);

  // Current state (regardless of period)
  const openIncidents = allIncidents.filter((i) => i.estado === "abierta" || i.estado === "en_gestion");
  const criticalIncidents = openIncidents.filter((i) => i.prioridad === "critica");
  const highIncidents = incidents.filter((i) => i.prioridad === "alta").length;
  const pendingOrders = allOrders.filter((o: Order) => o.estado === "solicitado" || o.estado === "aprobado");

  // Period stats
  const tasksDone = tasks.filter((t: Task) => t.estado === "ejecutada").length;
  const tasksPending = tasks.filter((t: Task) => t.estado === "programada").length;
  const tasksDelayed = tasks.filter((t: Task) => t.estado === "retrasada").length;

  const incidentsOpen = incidents.filter((i) => i.estado === "abierta" || i.estado === "en_gestion").length;
  const incidentsClosed = incidents.filter((i) => i.estado === "resuelta" || i.estado === "cerrada").length;
  const incidentsCritical = incidents.filter((i) => i.prioridad === "critica").length;

  const ordersReceived = orders.filter((o: Order) => o.estado === "recibido").length;
  const ordersPending = orders.filter((o: Order) => o.estado === "solicitado" || o.estado === "en_transito").length;

  const statusComment = buildStatusComment(t, criticalIncidents.length, openIncidents.length, tasksDelayed, pendingOrders.length);

  const isLoading = summaryQ.isLoading || tasksQ.isLoading || incidentsQ.isLoading;

  if (!canViewReport) {
    return (
      <div className="min-h-full">
        <PageHeader eyebrow={t("report.eyebrow")} title={t("report.title")} EyebrowIcon={BarChart3} />
        <AccessDenied
          role={role}
          requiredCapability="view_report"
          description={t("report.accessDeniedDescription")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("report.eyebrow")} title={t("report.title")} EyebrowIcon={BarChart3}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-app-dim">{t("report.periodLabel")}</span>
          {(["semana", "7d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-bold transition ${period === p ? "bg-brand-dark text-white shadow-brand" : "border border-app-border bg-white text-app-dim hover:border-brand/30"}`}
            >
              {t(`report.periods.${p}`)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Disclaimer */}
        <div className="rounded-[10px] border border-state-info/20 bg-state-info/5 px-4 py-2.5 text-xs text-state-info">
          {t("report.disclaimer")}
        </div>

        {/* Status comment */}
        {!isLoading && (
          <div className={`flex items-start gap-3 rounded-[14px] border px-5 py-4 ${
            statusComment.tone === "text-state-critica" ? "border-state-critica/20 bg-state-critica/5"
            : statusComment.tone === "text-state-atencion" ? "border-state-atencion/20 bg-state-atencion/5"
            : statusComment.tone === "text-state-info" ? "border-state-info/20 bg-state-info/5"
            : "border-state-ok/20 bg-state-ok/5"
          }`}>
            <p className={`text-sm font-semibold ${statusComment.tone}`}>{statusComment.text}</p>
          </div>
        )}

        {/* KPI grid */}
        <BentoGrid>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[var(--bento-radius)] bg-app-surface2" />
            ))
          ) : (
            <>
              <BentoTile footprint={criticalIncidents.length > 0 ? "2x2" : "1x1"}>
                <KpiCard label={t("report.kpi.criticalIncidents")} value={criticalIncidents.length} tone={criticalIncidents.length > 0 ? "critical" : "success"} Icon={AlertTriangle} sublabel={t("report.kpi.openNow")} featured={criticalIncidents.length > 0} />
              </BentoTile>
              <BentoTile footprint={tasksDelayed > 0 ? "2x1" : "1x1"}>
                <KpiCard label={t("report.kpi.delayedTasks")} value={tasksDelayed} tone={tasksDelayed > 0 ? "critical" : "success"} Icon={AlertOctagon} sublabel={t(`report.periodIn.${period}`)} featured={tasksDelayed > 0} />
              </BentoTile>
              <BentoTile footprint={criticalIncidents.length === 0 && openIncidents.length > 0 ? "2x2" : "1x1"}>
                <KpiCard label={t("report.kpi.openIncidents")} value={openIncidents.length} tone={openIncidents.length > 0 ? "warning" : "success"} Icon={AlertTriangle} sublabel={t("report.kpi.currentState")} featured={criticalIncidents.length === 0 && openIncidents.length > 0} />
              </BentoTile>
              <BentoTile>
                <KpiCard label={t("report.kpi.completedTasks")} value={tasksDone} tone="success" Icon={CheckCircle2} sublabel={t(`report.periodIn.${period}`)} />
              </BentoTile>
              <BentoTile>
                <KpiCard label={t("report.kpi.pendingTasks")} value={tasksPending} tone={tasksPending > 10 ? "warning" : "default"} Icon={ClipboardList} />
              </BentoTile>
              <BentoTile>
                <KpiCard label={t("report.kpi.pendingOrders")} value={pendingOrders.length} tone={pendingOrders.length > 0 ? "info" : "success"} Icon={Package} sublabel={t("report.kpi.toReceive")} />
              </BentoTile>
            </>
          )}
        </BentoGrid>

        {/* Two-column layout */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* LEFT: Tasks + Incidents */}
          <div className="space-y-5">
            {/* Tasks */}
            <PanelCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-brand" />
                  <SectionTitle>{t("report.tasksTitle", { period: t(`report.periods.${period}`) })}</SectionTitle>
                </div>
                <Link href="/tasks" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeAllF")}</Link>
              </div>

              {tasksQ.isError && (
                <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
                  {t("report.errors.tasks")}
                </div>
              )}

              {tasksQ.isLoading ? (
                <div className="h-20 animate-pulse rounded-[10px] bg-app-surface2" />
              ) : tasks.length === 0 ? (
                <p className="text-sm text-app-dim">{t("report.noTasks")}</p>
              ) : (
                <>
                  <MiniRow label={t("report.rows.completed")} value={tasksDone} tone="text-state-ok" />
                  <MiniRow label={t("report.rows.scheduled")} value={tasksPending} />
                  <MiniRow label={t("report.rows.delayed")} value={tasksDelayed} tone={tasksDelayed > 0 ? "text-state-critica" : ""} />
                  <MiniRow label={t("report.rows.totalInPeriod")} value={tasks.length} />
                </>
              )}

              {/* Upcoming delayed tasks */}
              {!tasksQ.isLoading && tasksDelayed > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-app-border pt-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-state-critica">{t("report.urgentDelayed")}</p>
                  {tasks.filter((t: Task) => t.estado === "retrasada").slice(0, 3).map((task: Task) => (
                    <div key={task.id} className="rounded-[10px] bg-state-critica/5 px-3 py-2">
                      <p className="text-xs font-semibold text-app-text">{task.tarea_catalogo?.nombre ?? t("report.taskFallback")}</p>
                      <p className="text-[11px] text-app-dim">
                        {new Date(task.fecha_programada).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>

            {/* Incidents */}
            <PanelCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-state-atencion" />
                  <SectionTitle>{t("nav.incidents")}</SectionTitle>
                </div>
                <Link href="/incidents" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeAllF")}</Link>
              </div>

              {incidentsQ.isError && (
                <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
                  {t("report.errors.incidents")}
                </div>
              )}

              {incidentsQ.isLoading ? (
                <div className="h-20 animate-pulse rounded-[10px] bg-app-surface2" />
              ) : (
                <>
                  <MiniRow label={t("report.rows.inPeriod")} value={incidents.length} />
                  <MiniRow label={t("report.rows.openInManagement")} value={incidentsOpen} tone={incidentsOpen > 0 ? "text-state-atencion" : ""} />
                  <MiniRow label={t("report.rows.critical")} value={incidentsCritical} tone={incidentsCritical > 0 ? "text-state-critica" : ""} />
                  <MiniRow label={t("report.rows.resolvedClosed")} value={incidentsClosed} tone="text-state-ok" />
                </>
              )}

              {!incidentsQ.isLoading && incidents.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-app-border pt-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("report.recent")}</p>
                  {incidents.slice(0, 3).map((i) => (
                    <div key={i.id} className="rounded-[10px] border border-app-border bg-app-bg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] capitalize text-app-dim">{t(`incidents.types.${i.tipo}`, { defaultValue: i.tipo.replace(/_/g, " ") })}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${i.prioridad === "critica" ? "bg-state-critica/10 text-state-critica" : "bg-state-atencion/10 text-state-atencion"}`}>
                          {enumLabel("severity", i.prioridad)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-app-text">{i.descripcion}</p>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          </div>

          {/* RIGHT: Alerts + Orders + Quality */}
          <div className="space-y-5">
            {/* Priority incidents */}
            <PanelCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-state-critica" />
                  <SectionTitle>{t("report.priorityIncidents")}</SectionTitle>
                </div>
                <Link href="/incidents" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeAllPlain")}</Link>
              </div>

              {incidentsQ.isError && (
                <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
                  {t("report.errors.incidents")}
                </div>
              )}

              {incidentsQ.isLoading ? (
                <div className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
              ) : (
                <>
                  <MiniRow label={t("report.rows.inPeriod")} value={incidents.length} />
                  <MiniRow label={t("report.rows.critical")} value={incidentsCritical} tone={incidentsCritical > 0 ? "text-state-critica" : ""} />
                  <MiniRow label={t("report.rows.high")} value={highIncidents} tone={highIncidents > 0 ? "text-state-atencion" : ""} />
                  <MiniRow label={t("report.rows.resolvedClosed")} value={incidentsClosed} tone="text-state-ok" />
                </>
              )}
            </PanelCard>

            {/* Orders */}
            <PanelCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-brand" />
                  <SectionTitle>{t("nav.orders")}</SectionTitle>
                </div>
                <Link href="/orders" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeAllM")}</Link>
              </div>

              {ordersQ.isError && (
                <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
                  {t("report.errors.orders")}
                </div>
              )}

              {ordersQ.isLoading ? (
                <div className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
              ) : orders.length === 0 ? (
                <p className="text-sm text-app-dim">{t("report.noOrders")}</p>
              ) : (
                <>
                  <MiniRow label={t("report.rows.inPeriod")} value={orders.length} />
                  <MiniRow label={t("report.rows.pendingInTransit")} value={ordersPending} tone={ordersPending > 0 ? "text-state-info" : ""} />
                  <MiniRow label={t("report.rows.received")} value={ordersReceived} tone="text-state-ok" />
                </>
              )}
            </PanelCard>

            {/* Quality */}
            <PanelCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-state-info" />
                  <SectionTitle>{t("report.milkQuality")}</SectionTitle>
                </div>
                <Link href="/quality" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeQuality")}</Link>
              </div>

              {qualityQ.isError && (
                <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
                  {t("report.errors.quality")}
                </div>
              )}

              {qualityQ.isLoading ? (
                <div className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
              ) : (
                <>
                  <MiniRow label={t("report.animalsInControl")} value={qualityQ.data?.animales_en_control ?? "—"} />
                  <MiniRow label={t("report.rows.activeLactations")} value={qualityQ.data?.lactaciones_activas ?? "—"} />
                  {qualityQ.data?.produccion_promedio != null && (
                    <MiniRow label={t("report.rows.avgProduction")} value={t("report.productionValue", { value: qualityQ.data.produccion_promedio.toFixed(1) })} />
                  )}
                  {qualityQ.data?.grasa_promedio != null && (
                    <MiniRow label={t("report.rows.avgFat")} value={`${qualityQ.data.grasa_promedio.toFixed(2)}%`} />
                  )}
                  {qualityQ.data?.rcs_promedio != null && (
                    <MiniRow label={t("report.rows.avgScc")} value={t("report.sccValue", { value: (qualityQ.data.rcs_promedio / 1000).toFixed(0) })} tone={qualityQ.data.rcs_promedio >= 250000 ? "text-state-atencion" : "text-state-ok"} />
                  )}
                </>
              )}
            </PanelCard>
          </div>
        </div>

        {/* Zones summary */}
        <PanelCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand" />
              <SectionTitle>{t("report.zonesTitle")}</SectionTitle>
            </div>
            <Link href="/zones" className="text-xs font-semibold text-brand-dark hover:underline">{t("report.seeZones")}</Link>
          </div>

          {zonesQ.isError && (
            <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
              {t("report.errors.zones")}
            </div>
          )}

          {zonesQ.isLoading ? (
            <div className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
          ) : zoneSummaries.length === 0 ? (
            <p className="text-sm text-app-dim">{t("report.noZones")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
              {zoneSummaries.map((z) => {
                const zTasks = z.items;
                const delayed = zTasks.filter((t: Task) => t.estado === "retrasada").length;
                return (
                  <Link
                    key={z.key}
                    href={`/zones/${z.key}`}
                    className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3 transition hover:border-brand/30 hover:bg-white"
                  >
                    <p className="font-mono text-[11px] text-app-dim">{z.key}</p>
                    <p className="text-sm font-bold text-app-text">{visualZoneText(z.titleKey, z.title)}</p>
                    {delayed > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-state-critica">{t("report.zoneDelayed", { count: delayed })}</p>
                    )}
                    {delayed === 0 && zTasks.length > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-state-ok">{t("report.zoneTasks", { count: zTasks.length })}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </PanelCard>

        {/* Animales KPI */}
        <PanelCard>
          <div className="mb-4 flex items-center gap-2">
            <Beef className="h-4 w-4 text-brand" />
            <SectionTitle>{t("report.livestock")}</SectionTitle>
          </div>
          {summaryQ.isError && (
            <div className="mb-3 rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
              {t("report.errors.livestock")}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("report.activeAnimals")}</p>
              <p className="mt-1.5 font-heading text-3xl font-bold text-app-text">{summaryQ.data?.animales.activos ?? "—"}</p>
            </div>
            <div className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("report.activeTreatments")}</p>
              <p className={`mt-1.5 font-heading text-3xl font-bold ${(summaryQ.data?.tratamientos.activos ?? 0) > 10 ? "text-state-atencion" : "text-app-text"}`}>
                {summaryQ.data?.tratamientos.activos ?? "—"}
              </p>
            </div>
            <div className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("report.animalsInControl")}</p>
              <p className="mt-1.5 font-heading text-3xl font-bold text-app-text">
                {qualityQ.data?.animales_en_control ?? "—"}
              </p>
            </div>
          </div>
        </PanelCard>

        {/* Weather */}
        <WeatherPanel />

        {/* Quick links */}
        <div className="rounded-[var(--bento-radius)] border border-app-border bg-white p-[var(--bento-padding)] shadow-card">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-app-dim">{t("report.quickLinks")}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/dashboard", labelKey: "report.links.dashboard" },
              { href: "/incidents", labelKey: "nav.incidents" },
              { href: "/tasks", labelKey: "report.links.tasks" },
              { href: "/orders", labelKey: "nav.orders" },
              { href: "/zones", labelKey: "nav.zones" },
              { href: "/quality", labelKey: "nav.quality" },
              { href: "/animals", labelKey: "nav.animals" },
            ].map(({ href, labelKey }) => (
              <Link
                key={href}
                href={href}
                className="rounded-[10px] border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-dim transition hover:border-brand/30 hover:text-brand"
              >
                {t(labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
