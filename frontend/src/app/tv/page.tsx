"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  Beef,
  ClipboardList,
  CloudSun,
  Droplets,
  FlaskConical,
  Pill,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TvFitList } from "@/components/tv/TvFitList";
import { TvKpiCard } from "@/components/tv/TvKpiCard";
import { TvBadge, TvEmptyRow, TvItem, TvPanel } from "@/components/tv/TvPanel";
import { TvShell } from "@/components/tv/TvShell";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/i18n";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Employee, Incident, ShiftAssignment, Task, Zone } from "@/lib/types";

// ── Zone status helpers ─────────────────────────────────────────────────────

type ZoneStatus = "critica" | "atencion" | "operativa" | "sin_datos" | "inactiva";

// `labelKey` bajo tv.zones.* (nombre visible traducido de la agrupacion).
const TV_VISUAL_ZONES = [
  { key: "recria", labelKey: "tv.zones.recria", codes: ["boxes_terneros", "zona_recria", "recria", "becerrero"] },
  { key: "nave", labelKey: "tv.zones.nave", codes: ["patio_alimentacion", "enfermeria", "maquinaria", "robots", "sala_ordeno", "silos", "almacen", "oficina", "general"] },
];

function idsForCodes(zones: Zone[], codes: string[]) {
  const wanted = new Set(codes);
  return new Set(zones.filter((z) => wanted.has(z.codigo)).map((z) => z.id));
}

function getZoneStatus(
  zone: Zone,
  tasks: Task[],
  incidents: Incident[],
  currentShiftAssignments: ShiftAssignment[],
): ZoneStatus {
  // Explicitly inactive zones
  if (zone.activa === false) return "inactiva";

  const zoneTasks = tasks.filter((t) => t.zona_id === zone.id);
  const zoneIncidents = incidents.filter(
    (i) => i.zona_id === zone.id && (i.estado === "abierta" || i.estado === "en_gestion"),
  );
  const isAssigned = currentShiftAssignments.some((a) => a.zona_id === zone.id);

  // Critical: urgent delays OR critical/high incidents
  const hasUrgentDelay = zoneTasks.some((t) => t.estado === "retrasada" && t.es_urgente);
  const hasCriticalIncident = zoneIncidents.some((i) => i.prioridad === "critica");
  if (hasUrgentDelay || hasCriticalIncident) return "critica";

  // Warning: any delay OR high-priority incident OR open incidents
  const hasDelay = zoneTasks.some((t) => t.estado === "retrasada");
  const hasHighIncident = zoneIncidents.some((i) => i.prioridad === "alta");
  if (hasDelay || hasHighIncident || zoneIncidents.length > 1) return "atencion";

  // Operational: pending tasks OR worker assigned OR minor incidents
  const hasPending = zoneTasks.some((t) => t.estado === "programada");
  if (hasPending || isAssigned || zoneIncidents.length > 0) return "operativa";

  // No meaningful data for this zone
  return "sin_datos";
}

const zoneStatusStyles: Record<ZoneStatus, { ring: string; dot: string; text: string }> = {
  critica:   { ring: "bg-state-critica/12",  dot: "bg-state-critica",  text: "text-state-critica" },
  atencion:  { ring: "bg-state-atencion/12", dot: "bg-state-atencion", text: "text-state-atencion" },
  operativa: { ring: "bg-tv-accent/10",      dot: "bg-tv-accent",      text: "text-brand-dark" },
  sin_datos: { ring: "bg-tv-surface2",       dot: "bg-tv-dim",         text: "text-tv-dim" },
  inactiva:  { ring: "bg-tv-bg",             dot: "bg-tv-dim/40",      text: "text-tv-dim opacity-70" },
};

const priorityTone = {
  critica: "critical",
  alta: "warning",
  media: "info",
  baja: "neutral",
} as const;

const isCriticalOrHigh = (i: Incident) => i.prioridad === "critica" || i.prioridad === "alta";

// ── Employee helper ──────────────────────────────────────────────────────────

function employeeName(e: Employee | undefined, fallbackId: string): string {
  if (!e) return fallbackId.slice(0, 8) + "…";
  return [e.nombre, e.apellidos].filter(Boolean).join(" ");
}

// ── Incident card ────────────────────────────────────────────────────────────

function IncidentItem({ inc, accentCritical }: { inc: Incident; accentCritical?: boolean }) {
  const { t } = useTranslation();
  const hasSeparateDescription =
    inc.descripcion.trim().length > 0 &&
    inc.descripcion.trim().toLowerCase() !== inc.titulo.trim().toLowerCase();
  return (
    <TvItem accent={accentCritical ? "critical" : undefined}>
      <div className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
        <TvBadge tone={priorityTone[inc.prioridad] ?? "neutral"}>
          {t(`tv.priority.${inc.prioridad}`, { defaultValue: inc.prioridad })}
        </TvBadge>
        <span className="truncate text-(length:--tvu-fs-xs) font-semibold capitalize text-tv-dim">
          {inc.tipo.replace(/_/g, " ")}
        </span>
      </div>
      <p className="mt-(--tvu-gap-sm) line-clamp-2 text-(length:--tvu-fs-md) font-bold leading-snug text-tv-text">
        {inc.titulo}
      </p>
      {hasSeparateDescription && (
        <p className="line-clamp-1 text-(length:--tvu-fs-xs) leading-snug text-tv-dim">{inc.descripcion}</p>
      )}
    </TvItem>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TvGlobalPage() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const today = new Date().toISOString().slice(0, 10);

  const [
    summaryQ,
    incidentsQ,
    tasksQ,
    zonesQ,
    weatherQ,
    qualityQ,
    employeesQ,
    tankQualityQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ["tv-dashboard-summary"],
        queryFn: api.dashboardSummary,
        refetchInterval: TV_REFETCH.NORMAL,
        staleTime: TV_STALE.NORMAL,
      },
      {
        queryKey: ["tv-incidents"],
        queryFn: () => api.incidents({ limit: 100 }),
        refetchInterval: TV_REFETCH.NORMAL,
        staleTime: TV_STALE.NORMAL,
      },
      {
        queryKey: ["tv-tasks"],
        queryFn: () => api.tasks({ limit: 100 }),
        refetchInterval: TV_REFETCH.NORMAL,
        staleTime: TV_STALE.NORMAL,
      },
      {
        queryKey: ["zones"],
        queryFn: api.zones,
        staleTime: TV_STALE.CATALOG,
      },
      {
        queryKey: ["weather-current"],
        queryFn: api.weather,
        refetchInterval: TV_REFETCH.VERY_SLOW,
        staleTime: TV_STALE.VERY_SLOW,
      },
      {
        queryKey: ["quality-summary"],
        queryFn: api.qualitySummary,
        refetchInterval: TV_REFETCH.VERY_SLOW,
        staleTime: TV_STALE.VERY_SLOW,
      },
      {
        queryKey: ["employees-lookup"],
        queryFn: () => api.employees(),
        staleTime: TV_STALE.CATALOG,
        refetchInterval: TV_REFETCH.CATALOG,
      },
      {
        // T12.5: panel de calidad en el modo TV, alimentado por
        // analiticas_tanque (T10.1) — antes el modo TV no mostraba nada de
        // calidad de leche.
        queryKey: ["tv-tank-quality"],
        queryFn: () => api.tankQuality({ limit: 7 }),
        refetchInterval: TV_REFETCH.VERY_SLOW,
        staleTime: TV_STALE.VERY_SLOW,
      },
    ],
  });

  const shiftsQ = useQuery({
    queryKey: ["tv-shifts", today],
    queryFn: () => api.shifts({ fecha: today, limit: 10 }),
    refetchInterval: TV_REFETCH.SLOW,
    staleTime: TV_STALE.SLOW,
  });

  // Con cientos de asignaciones historicas en un dataset real, un limit=50
  // sin filtro ni orden puede no incluir las de los turnos de hoy (T4,
  // segunda pasada). Se piden por turno_id una vez se conocen los turnos
  // de hoy, en vez de traer una pagina arbitraria de todas las asignaciones.
  const todayShiftIds = useMemo(
    () => (shiftsQ.data?.turnos ?? []).map((s) => s.id),
    [shiftsQ.data],
  );

  const assignmentsQ = useQuery({
    queryKey: ["tv-shift-assignments", todayShiftIds],
    queryFn: async () => {
      const perShift = await Promise.all(
        todayShiftIds.map((turno_id) => api.shiftAssignments({ turno_id, limit: 50 })),
      );
      return { asignaciones: perShift.flatMap((r) => r.asignaciones) };
    },
    enabled: todayShiftIds.length > 0,
    refetchInterval: TV_REFETCH.SLOW,
    staleTime: TV_STALE.SLOW,
  });

  // All queries for the refresh status indicator
  const allQueryStatuses = [
    summaryQ, incidentsQ, tasksQ, zonesQ, weatherQ, shiftsQ, assignmentsQ, qualityQ, tankQualityQ,
  ].map((q) => ({
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    dataUpdatedAt: q.dataUpdatedAt,
  }));

  const summary = summaryQ.data;
  const allIncidents = useMemo(() => (incidentsQ.data ?? []) as Incident[], [incidentsQ.data]);
  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const zones = zonesQ.data ?? [];
  const weather = weatherQ.data;
  const shifts = shiftsQ.data?.turnos ?? [];
  const assignments = assignmentsQ.data?.asignaciones ?? [];
  const quality = qualityQ.data;
  const tankReadings = useMemo(() => tankQualityQ.data ?? [], [tankQualityQ.data]);
  const latestTank = tankReadings[0];
  const tankTrend = useMemo(() => {
    if (tankReadings.length < 2) return null;
    const rcsValues = tankReadings.map((r) => r.rcs_x1000).filter((v): v is number => v != null);
    const avgRcs = rcsValues.length ? rcsValues.reduce((a, b) => a + b, 0) / rcsValues.length : null;
    return { avgRcs };
  }, [tankReadings]);

  // Employee lookup
  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employeesQ.data ?? []) map.set(e.id, e);
    return map;
  }, [employeesQ.data]);

  // Derived data (memoizado: TvFitList re-mide cuando cambia la referencia)
  const delayedTasks = useMemo(() => allTasks.filter((t) => t.estado === "retrasada"), [allTasks]);
  const openIncidents = useMemo(
    () => allIncidents.filter((i) => i.estado === "abierta" || i.estado === "en_gestion"),
    [allIncidents],
  );
  const criticalIncidents = useMemo(() => openIncidents.filter(isCriticalOrHigh), [openIncidents]);
  const taskTotal = (summary?.tareas.programadas ?? 0) + (summary?.tareas.retrasadas ?? 0);

  // Lista prioritaria: primero retrasadas, despues urgentes programadas. Sin
  // tope fijo: TvFitList muestra las que caben y resume el resto en "+N más".
  const priorityTasks = useMemo(
    () => [
      ...delayedTasks,
      ...allTasks.filter((t) => t.es_urgente && t.estado === "programada"),
    ],
    [allTasks, delayedTasks],
  );

  // Current shift
  const currentHour = new Date().getHours();
  const todayShifts = shifts.filter((s) => s.fecha === today);
  const currentShift = todayShifts.find((s) => {
    const start = parseInt(s.hora_inicio?.slice(0, 2) ?? "0");
    const end = parseInt(s.hora_fin?.slice(0, 2) ?? "24");
    return currentHour >= start && currentHour < end;
  }) ?? todayShifts[0];
  const currentAssignments = currentShift
    ? assignments.filter((a) => a.turno_id === currentShift.id)
    : [];

  return (
    <TvShell
      title={t("tv.global.title")}
      subtitle={t("tv.global.subtitle")}
      queryStatuses={allQueryStatuses}
      exitHref="/dashboard"
    >
      {/* Rejilla a pantalla completa: KPIs (auto) · zonas + turno (22 %) ·
          paneles (resto). En lg+ nada provoca scroll de pagina. */}
      <div className="flex flex-col gap-(--tvu-gap) lg:h-full">
        {/* ── KPI row ── */}
        <div className="grid shrink-0 grid-cols-2 gap-(--tvu-gap) sm:grid-cols-3 lg:grid-cols-6">
          <TvKpiCard
            Icon={AlertTriangle}
            label={t("tv.global.kpi.criticalIncidents")}
            value={criticalIncidents.length}
            sublabel={t("tv.global.kpi.criticalIncidentsSub")}
            tone={criticalIncidents.length > 0 ? "critical" : "ok"}
          />
          <TvKpiCard
            Icon={AlertOctagon}
            label={t("tv.global.kpi.incidents")}
            value={openIncidents.length}
            sublabel={t("tv.global.kpi.incidentsSub")}
            tone={openIncidents.length > 2 ? "warning" : openIncidents.length > 0 ? "info" : "ok"}
          />
          <TvKpiCard
            Icon={ClipboardList}
            label={t("tv.global.kpi.pendingTasks")}
            value={taskTotal}
            sublabel={t("tv.global.kpi.delayed", { n: delayedTasks.length })}
            tone={delayedTasks.length > 3 ? "critical" : delayedTasks.length > 0 ? "warning" : "ok"}
          />
          <TvKpiCard
            Icon={Beef}
            label={t("tv.global.kpi.activeAnimals")}
            value={summary?.animales.activos ?? "—"}
            tone="neutral"
          />
          <TvKpiCard
            Icon={Pill}
            label={t("tv.global.kpi.treatments")}
            value={summary?.tratamientos.activos ?? "—"}
            sublabel={t("tv.global.kpi.treatmentsSub")}
            tone={(summary?.tratamientos.activos ?? 0) > 15 ? "critical" : "info"}
          />
          <TvKpiCard
            Icon={Droplets}
            label={t("tv.global.kpi.production")}
            value={quality?.produccion_promedio != null ? `${quality.produccion_promedio.toFixed(1)} L` : "—"}
            sublabel={
              weather?.temperatura_actual != null
                ? `${weather.temperatura_actual.toFixed(0)}°C · ${weather.descripcion ?? ""}`
                : t("tv.global.kpi.noWeather")
            }
            tone={weatherQ.isError ? "warning" : "accent"}
          />
        </div>

        {/* ── Zonas + turno actual ── */}
        <div className="grid shrink-0 gap-(--tvu-gap) lg:h-[22%] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <TvPanel Icon={CloudSun} title={t("tv.global.zonesTitle")}>
            {zones.length === 0 && !zonesQ.isLoading ? (
              <TvEmptyRow text={t("tv.global.noZones")} />
            ) : (
              <div className="grid h-full grid-cols-2 gap-(--tvu-gap)">
                {TV_VISUAL_ZONES.map((visualZone) => {
                  const zoneIds = idsForCodes(zones, visualZone.codes);
                  const representative = zones.find((z) => zoneIds.has(z.id)) ?? {
                    id: visualZone.key,
                    nombre: visualZone.key,
                    codigo: visualZone.key,
                    tiene_pantalla_tv: true,
                    tiene_tablet: true,
                    activa: true,
                  };
                  const groupedTasks = allTasks.filter((t) => t.zona_id && zoneIds.has(t.zona_id));
                  const groupedIncidents = allIncidents.filter((i) => i.zona_id && zoneIds.has(i.zona_id));
                  const groupedAssignments = currentAssignments.filter((a) => a.zona_id && zoneIds.has(a.zona_id));
                  const status = getZoneStatus(representative, groupedTasks, groupedIncidents, groupedAssignments);
                  const s = zoneStatusStyles[status];
                  const zoneTasks = groupedTasks.filter((t) => t.estado !== "ejecutada");
                  const zoneInc = groupedIncidents.filter((i) => i.estado === "abierta" || i.estado === "en_gestion");

                  return (
                    <div
                      key={visualZone.key}
                      className={`flex min-w-0 flex-col justify-center gap-(--tvu-gap-sm) overflow-hidden rounded-(--tvu-radius) px-(--tvu-pad) py-(--tvu-pad-sm) ${s.ring}`}
                    >
                      <div className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
                        <span className={`size-(--tvu-dot) shrink-0 rounded-full ${s.dot}`} aria-hidden />
                        <span className="truncate font-heading text-(length:--tvu-fs-lg) font-bold leading-tight text-tv-text">
                          {t(visualZone.labelKey)}
                        </span>
                      </div>
                      <span className={`text-(length:--tvu-fs-sm) font-extrabold uppercase leading-tight ${s.text}`}>
                        {t(`tv.zoneStatus.${status}`)}
                      </span>
                      <div className="flex flex-wrap gap-x-(--tvu-gap) gap-y-(--tvu-gap-sm) text-(length:--tvu-fs-xs) font-semibold text-tv-dim">
                        {zoneTasks.length > 0 && (
                          <span className="flex items-center gap-(--tvu-gap-sm)">
                            <ClipboardList className="size-(--tvu-icon-sm)" aria-hidden />
                            {t("tv.global.zoneTasks", { n: zoneTasks.length })}
                          </span>
                        )}
                        {zoneInc.length > 0 && (
                          <span className="flex items-center gap-(--tvu-gap-sm) text-state-atencion">
                            <AlertOctagon className="size-(--tvu-icon-sm)" aria-hidden />
                            {t("tv.global.zoneIncidents", { n: zoneInc.length })}
                          </span>
                        )}
                        {groupedAssignments.length > 0 && (
                          <span className="flex items-center gap-(--tvu-gap-sm)">
                            <UserRound className="size-(--tvu-icon-sm)" aria-hidden />
                            {t("tv.global.zoneWorkers", { n: groupedAssignments.length })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TvPanel>

          {/* ── Turno actual con nombres reales ── */}
          <TvPanel
            Icon={UserRound}
            iconTone="text-tv-accent"
            title={
              currentShift
                ? `${t("tv.shift.current")} · ${t(`tv.shift.type.${currentShift.tipo_turno}`)} · ${currentShift.hora_inicio?.slice(0, 5) ?? ""}–${currentShift.hora_fin?.slice(0, 5) ?? ""}`
                : t("tv.shift.current")
            }
            count={currentShift ? currentAssignments.length : undefined}
          >
            {shiftsQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.shift.loadError")} />
            ) : !currentShift ? (
              <TvEmptyRow text={t("tv.shift.noCurrent")} />
            ) : currentAssignments.length === 0 ? (
              <TvEmptyRow text={t("tv.shift.noAssignments")} />
            ) : (
              <TvFitList
                items={currentAssignments}
                getKey={(a) => a.id}
                listClassName="grid grid-cols-2 gap-(--tvu-gap-sm) xl:grid-cols-3"
                renderItem={(a) => {
                  const emp = employeeById.get(a.empleado_id);
                  return (
                    <div className="flex min-w-0 items-baseline gap-(--tvu-gap-sm) rounded-(--tvu-radius) bg-tv-surface2 px-(--tvu-pad-sm) py-(--tvu-gap-sm)">
                      <span className="truncate text-(length:--tvu-fs-sm) font-bold text-tv-text">
                        {employeeName(emp, a.empleado_id)}
                      </span>
                      {(a.rol || emp?.role) && (
                        <span className="shrink-0 truncate text-(length:--tvu-fs-2xs) font-semibold capitalize text-tv-dim">
                          {a.rol && a.rol !== emp?.role ? a.rol : emp?.role}
                        </span>
                      )}
                    </div>
                  );
                }}
              />
            )}
          </TvPanel>
        </div>

        {/* ── Paneles principales: reparten el alto restante ── */}
        <div className="grid min-h-0 flex-1 gap-(--tvu-gap) sm:grid-cols-2 lg:grid-cols-4">
          {/* Incidencias criticas: las alertas se integran como incidencias */}
          <TvPanel
            Icon={AlertTriangle}
            iconTone="text-state-critica"
            title={t("tv.global.panels.criticalIncidents")}
            count={criticalIncidents.length}
            className="max-lg:h-[26rem]"
          >
            {incidentsQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.incidentsError")} />
            ) : criticalIncidents.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.empty.noCriticalIncidents")} />
            ) : (
              <TvFitList
                items={criticalIncidents}
                getKey={(inc) => inc.id}
                renderItem={(inc) => <IncidentItem inc={inc} accentCritical />}
              />
            )}
          </TvPanel>

          {/* Incidencias abiertas */}
          <TvPanel
            Icon={AlertOctagon}
            iconTone="text-state-atencion"
            title={t("tv.global.panels.openIncidents")}
            count={openIncidents.length}
            className="max-lg:h-[26rem]"
          >
            {incidentsQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.incidentsError")} />
            ) : openIncidents.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.empty.noOpenIncidents")} />
            ) : (
              <TvFitList
                items={openIncidents}
                getKey={(inc) => inc.id}
                renderItem={(inc) => <IncidentItem inc={inc} />}
              />
            )}
          </TvPanel>

          {/* Tareas urgentes / retrasadas */}
          <TvPanel
            Icon={ClipboardList}
            iconTone={delayedTasks.length > 0 ? "text-state-critica" : "text-tv-accent"}
            title={t("tv.global.panels.urgentTasks")}
            count={priorityTasks.length}
            className="max-lg:h-[26rem]"
          >
            {tasksQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.tasksError")} />
            ) : priorityTasks.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.empty.noUrgentTasks")} />
            ) : (
              <TvFitList
                items={priorityTasks}
                getKey={(task) => task.id}
                renderItem={(task) => (
                  <TvItem accent={task.estado === "retrasada" ? "critical" : "warning"}>
                    <div className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
                      <TvBadge tone={task.estado === "retrasada" ? "critical" : "warning"}>
                        {task.estado === "retrasada" ? t("tv.badge.delayed") : t("tv.badge.urgent")}
                      </TvBadge>
                      <span className="truncate text-(length:--tvu-fs-xs) font-semibold tabular-nums text-tv-dim">
                        {new Date(task.fecha_programada).toLocaleString(locale, {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-(--tvu-gap-sm) line-clamp-2 text-(length:--tvu-fs-md) font-bold leading-snug text-tv-text">
                      {task.tarea_catalogo?.nombre ?? t("tv.task.fallback")}
                    </p>
                  </TvItem>
                )}
              />
            )}
          </TvPanel>

          {/* Calidad de tanque (T12.5) */}
          <TvPanel
            Icon={FlaskConical}
            iconTone={(latestTank?.rcs_x1000 ?? 0) >= 300 ? "text-state-critica" : "text-tv-accent"}
            title={t("tv.global.panels.tankQuality")}
            className="max-lg:h-[26rem]"
          >
            {tankQualityQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.qualityError")} />
            ) : !latestTank ? (
              <TvEmptyRow text={t("tv.empty.noTankReadings")} />
            ) : (
              <div className="flex h-full flex-col gap-(--tvu-gap)">
                <div className="flex items-center justify-between gap-(--tvu-gap-sm)">
                  <span className="truncate text-(length:--tvu-fs-xs) font-extrabold uppercase text-tv-dim">
                    {new Date(latestTank.fecha).toLocaleDateString(locale, { day: "2-digit", month: "short" })}
                    {latestTank.lote ? ` · ${latestTank.lote}` : ""}
                  </span>
                  {(latestTank.rcs_x1000 ?? 0) >= 300 && <TvBadge tone="critical">{t("tv.badge.highRcs")}</TvBadge>}
                </div>
                {/* Cifras grandes 2×2: se leen desde lejos sin grafico */}
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-(--tvu-gap-sm)">
                  {[
                    { label: t("tv.tank.fat"), value: `${latestTank.grasa_pct?.toFixed(2) ?? "—"}%`, alert: false },
                    { label: t("tv.tank.protein"), value: `${latestTank.proteina_pct?.toFixed(2) ?? "—"}%`, alert: false },
                    { label: t("tv.tank.rcs"), value: `${latestTank.rcs_x1000 ?? "—"}k`, alert: (latestTank.rcs_x1000 ?? 0) >= 300 },
                    { label: t("tv.tank.volume"), value: `${Math.round(latestTank.volumen_l)} L`, alert: false },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="flex min-w-0 flex-col justify-center rounded-(--tvu-radius) bg-tv-surface2 px-(--tvu-pad-sm) py-(--tvu-gap-sm)"
                    >
                      <span className="truncate text-(length:--tvu-fs-xs) font-semibold text-tv-dim">{m.label}</span>
                      <span
                        className={`truncate font-heading text-(length:--tvu-fs-xl) font-bold leading-tight tabular-nums ${
                          m.alert ? "text-state-critica" : "text-tv-text"
                        }`}
                      >
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
                {tankTrend?.avgRcs != null && (
                  <p className="shrink-0 text-(length:--tvu-fs-xs) font-semibold text-tv-dim">
                    {t("tv.tank.avgRcs", { days: tankReadings.length, value: Math.round(tankTrend.avgRcs) })}
                  </p>
                )}
              </div>
            )}
          </TvPanel>
        </div>
      </div>
    </TvShell>
  );
}
