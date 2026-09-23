"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  ArrowLeftRight,
  BarChart3,
  Beef,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudSun,
  ListTodo,
  MapPin,
  Milk,
  Package,
  Pill,
  RefreshCw,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { SeverityTrendPanel } from "@/components/charts/SeverityTrendChart";
import { TvModeButton } from "@/components/tv/TvModeButton";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { PanelCard } from "@/components/ui/panel-card";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import type { Capability } from "@/lib/role-capabilities";
import type { Incident } from "@/lib/types";

function SeverityBadge({ severity }: { severity: Incident["prioridad"] }) {
  const map: Record<Incident["prioridad"], string> = {
    critica: "bg-state-critica/10 text-state-critica",
    alta: "bg-state-atencion/10 text-state-atencion",
    media: "bg-state-info/10 text-state-info",
    baja: "bg-state-neutral/10 text-state-neutral",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase ${map[severity]}`}>
      {severity}
    </span>
  );
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("es-ES", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: api.dashboardSummary,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const incidents = useQuery({
    queryKey: ["dashboard-incidents-recent"],
    queryFn: () => api.incidents({ limit: 5 }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const quality = useQuery({
    queryKey: ["quality-summary"],
    queryFn: api.qualitySummary,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const weather = useQuery({
    queryKey: ["weather-current"],
    queryFn: api.weather,
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const s = summary.data;
  const q = quality.data;
  const w = weather.data;
  const recentIncidents = incidents.data?.slice(0, 5) ?? [];
  // KPI de incidencias activas: usa el agregado real de dashboard-summary,
  // no un recuento derivado de las 5 incidencias mas recientes — con pocas
  // incidencias de demo coincidian casi siempre, pero con el dataset
  // realista (100+) podia mostrar "0 activas" habiendo decenas abiertas,
  // solo porque ninguna de las 5 mas recientes lo estaba (T4, segunda
  // pasada de verificacion).
  const incidenciasResumen = s?.incidencias;
  const taskTotal = (s?.tareas.programadas ?? 0) + (s?.tareas.ejecutadas ?? 0) + (s?.tareas.retrasadas ?? 0);
  const taskDonePct = s ? Math.round((s.tareas.ejecutadas / Math.max(1, taskTotal)) * 100) : 0;

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        EyebrowIcon={RefreshCw}
      >
        {/* El enlace "TV Global" y la píldora "Actualización cada 30 s" se
            sustituyen por el botón Modo TV; los intervalos de refresco de las
            consultas se mantienen igual. */}
        <TvModeButton />
      </PageHeader>

      <div className="space-y-6 px-6 py-6 lg:px-8">
        {/* Operational bento: size communicates urgency and priority. */}
        {summary.isLoading ? (
          <div className="dashboard-bento">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] bg-app-surface2" />
            ))}
          </div>
        ) : (
          <div className="dashboard-bento">
            <Link href="/incidents">
              <KpiCard
                Icon={AlertOctagon}
                label={t("dashboard.kpiActiveIncidents")}
                value={incidenciasResumen?.abiertas ?? 0}
                sublabel={t("dashboard.incidentsSublabel", {
                  critical: incidenciasResumen?.criticas ?? 0,
                  high: incidenciasResumen?.altas ?? 0,
                })}
                tone={(incidenciasResumen?.criticas ?? 0) > 0 ? "critical" : (incidenciasResumen?.altas ?? 0) > 0 ? "warning" : "success"}
                featured
              />
            </Link>
            <Link href="/tasks">
              <KpiCard
                Icon={Clock}
                label={t("dashboard.kpiDelayedTasks")}
                value={s?.tareas.retrasadas ?? "—"}
                sublabel={t("dashboard.delayedTasksSublabel")}
                tone={s && s.tareas.retrasadas > 0 ? "warning" : "success"}
              />
            </Link>
            <Link href="/tasks">
              <KpiCard
                Icon={ClipboardList}
                label={t("dashboard.kpiTasksToday")}
                value={taskTotal}
                sublabel={t("dashboard.tasksTodaySublabel", { count: s?.tareas.ejecutadas ?? 0 })}
                tone="info"
              />
            </Link>
            <Link href="/animals">
              <KpiCard
                Icon={Beef}
                label={t("dashboard.kpiActiveAnimals")}
                value={s?.animales.activos ?? "—"}
                sublabel={t("dashboard.activeAnimalsSublabel")}
                tone="default"
              />
            </Link>
            <KpiCard
              Icon={Pill}
              label={t("dashboard.kpiTreatments")}
              value={s?.tratamientos.activos ?? "—"}
              sublabel={t("dashboard.treatmentsSublabel")}
              tone={s && s.tratamientos.activos > 15 ? "critical" : "info"}
            />
            <Link href="/tasks">
              <KpiCard
                Icon={CheckCircle2}
                label={t("dashboard.kpiCompliance")}
                value={`${taskDonePct}%`}
                sublabel={t("dashboard.complianceSublabel")}
                tone={taskDonePct > 65 ? "success" : "warning"}
              />
            </Link>
            <Link href="/quality">
              <KpiCard
                Icon={Milk}
                label={t("dashboard.kpiProduction")}
                value={`${formatNumber(q?.produccion_promedio, 1)} L`}
                sublabel={t("dashboard.productionSublabel", { count: q?.lactaciones_activas ?? 0 })}
                tone="default"
                featured
              />
            </Link>
            <KpiCard
              Icon={CloudSun}
              label={t("dashboard.kpiWeather")}
              value={w?.temperatura_actual != null ? `${formatNumber(w.temperatura_actual, 1)} °C` : "—"}
              sublabel={w?.descripcion ?? t("dashboard.weatherFallback")}
              tone={weather.isError ? "critical" : "info"}
            />
          </div>
        )}

        {/* Animals by zone */}
        {s?.animales.por_zona && s.animales.por_zona.some((z) => z.total > 0) && (
          <PanelCard>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Beef className="h-4 w-4 text-brand" />
                <h2 className="font-heading text-sm font-bold text-app-text">{t("dashboard.animalsByZone")}</h2>
              </div>
              <span className="text-xs text-app-dim">{t("dashboard.animalsByZoneTotal", { count: s.animales.activos })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.animales.por_zona.filter((z) => z.total > 0).map((z) => (
                <div key={z.zona_id} className="flex items-center gap-2 rounded-[10px] border border-app-border bg-app-bg px-3 py-2">
                  <span className="font-heading text-base font-bold text-app-text">{z.total}</span>
                  <span className="text-xs text-app-dim">{z.nombre}</span>
                </div>
              ))}
            </div>
          </PanelCard>
        )}

        {/* Evolución de alertas e incidencias por criticidad (sustituye al
            antiguo "Pulso operativo" y al bloque "Cumplimiento de tareas"). */}
        <PanelCard>
          <SeverityTrendPanel />
        </PanelCard>

        {/* Bottom row */}
        <BentoGrid className="xl:auto-rows-auto">
          {/* Recent alerts/incidents */}
          <BentoTile footprint="2x1">
            <PanelCard>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-state-atencion" />
                <h2 className="font-heading text-base font-bold text-app-text">{t("dashboard.recentIncidents")}</h2>
              </div>
              <Link href="/incidents" className="text-xs font-semibold text-brand-dark hover:underline">
                {t("dashboard.viewAll")}
              </Link>
            </div>

            {incidents.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-[10px] bg-app-surface2" />
                ))}
              </div>
            ) : recentIncidents.length === 0 ? (
              <div className="py-8 text-center text-sm text-app-dim">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-state-ok" strokeWidth={1.5} />
                {t("dashboard.noRecentIncidents")}
              </div>
            ) : (
              <div className="space-y-2">
                {recentIncidents.map((incident) => {
                  const hasSeparateDescription =
                    incident.descripcion.trim().length > 0 &&
                    incident.descripcion.trim().toLowerCase() !== incident.titulo.trim().toLowerCase();
                  return (
                    <div
                      key={incident.id}
                      className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={incident.prioridad} />
                        <span className="text-xs capitalize text-app-dim">{incident.tipo.replace(/_/g, " ")}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-app-text">{incident.titulo}</p>
                      {hasSeparateDescription && (
                        <p className="truncate text-xs text-app-dim">{incident.descripcion}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </PanelCard>
          </BentoTile>

          {/* Quick actions */}
          <BentoTile footprint="2x1">
            <PanelCard>
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand" />
              <h2 className="font-heading text-base font-bold text-app-text">{t("dashboard.quickActions")}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { href: "/incidents?new=1", label: t("dashboard.actionNewIncident"), Icon: AlertOctagon, tone: "text-state-critica" },
                  { href: "/orders?new=1", label: t("dashboard.actionNewOrder"), Icon: Package, tone: "text-brand", capability: "create_order" },
                  { href: "/tasks?new=1", label: t("dashboard.actionNewTask"), Icon: ClipboardList, tone: "text-state-info" },
                  { href: "/handover/tablet", label: t("dashboard.actionShiftChange"), Icon: ArrowLeftRight, tone: "text-state-atencion", capability: "create_handover" },
                  { href: "/report", label: t("dashboard.actionWeeklyReport"), Icon: BarChart3, tone: "text-state-ok", capability: "view_report" },
                ] as { href: string; label: string; Icon: typeof AlertOctagon; tone: string; capability?: Capability }[]
              )
                .filter((action) => !action.capability || can(action.capability))
                .map(({ href, label, Icon, tone }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 rounded-[10px] border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text transition hover:border-brand/30 hover:bg-white"
                >
                  <Icon className={`h-4 w-4 ${tone}`} />
                  {label}
                </Link>
              ))}
            </div>

            <div className="mt-3 border-t border-app-border pt-3">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-app-dim">{t("dashboard.navigation")}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { href: "/zones", label: t("nav.zones"), Icon: MapPin },
                  { href: "/incidents", label: t("nav.incidents"), Icon: AlertOctagon },
                  { href: "/leanfarming", label: t("nav.leanfarming"), Icon: ListTodo },
                  { href: "/animals", label: t("nav.animals"), Icon: Beef },
                ].map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-dim transition hover:border-brand/30 hover:text-brand"
                  >
                    <Icon className="h-3.5 w-3.5 text-brand" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            </PanelCard>
          </BentoTile>
        </BentoGrid>

        {summary.isError && (
          <div className="rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm font-semibold text-state-critica">
            {t("dashboard.loadError")}
          </div>
        )}
      </div>
    </div>
  );
}
