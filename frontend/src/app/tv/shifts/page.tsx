"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  MapPin,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TvFitList } from "@/components/tv/TvFitList";
import { TvBadge, TvEmptyRow, TvItem, TvPanel } from "@/components/tv/TvPanel";
import { TvShell } from "@/components/tv/TvShell";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/i18n";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Employee, Incident, ShiftAssignment, ShiftType, Zone } from "@/lib/types";

const shiftTypeStyle: Record<ShiftType, string> = {
  manana: "text-state-info",
  tarde: "text-state-atencion",
  noche: "text-state-neutral",
};

function empName(emp: Employee | undefined, fallbackId: string): string {
  if (!emp) return fallbackId.slice(0, 8) + "…";
  return [emp.nombre, emp.apellidos].filter(Boolean).join(" ");
}

// `labelKey` bajo tv.zones.* (nombre visible traducido de la agrupacion).
const TV_VISUAL_ZONES = [
  { key: "recria", labelKey: "tv.zones.recria", codes: ["boxes_terneros", "zona_recria", "recria", "becerrero"] },
  { key: "nave", labelKey: "tv.zones.nave", codes: ["patio_alimentacion", "enfermeria", "maquinaria", "robots", "sala_ordeno", "silos", "almacen", "oficina", "general"] },
];

/** Clave i18n (tv.shifts.zone.*) del nombre visible de una zona, o null si
 * la zona no pertenece a ninguna agrupacion conocida. */
function zoneLabelKey(zone: Pick<Zone, "codigo">): string | null {
  if (["boxes_terneros", "becerrero"].includes(zone.codigo)) return "tv.shifts.zone.calfBoxes";
  if (["zona_recria", "recria"].includes(zone.codigo)) return "tv.shifts.zone.rearing";
  if (["patio_alimentacion", "silos", "almacen"].includes(zone.codigo)) return "tv.shifts.zone.feeding";
  if (zone.codigo === "enfermeria") return "tv.shifts.zone.infirmary";
  if (["maquinaria", "robots", "sala_ordeno", "oficina", "general"].includes(zone.codigo)) return "tv.shifts.zone.machinery";
  return null;
}

// Columnas de la rejilla de turnos en lg+ segun cuantos haya hoy (clases
// literales para que Tailwind las genere).
const shiftGridCols: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

// ── Shift card ────────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  assignments,
  zoneNameById,
  employeeById,
  isCurrent,
}: {
  shift: {
    id: string;
    fecha?: string | null;
    tipo_turno: ShiftType;
    hora_inicio?: string | null;
    hora_fin?: string | null;
    notas?: string | null;
  };
  assignments: ShiftAssignment[];
  zoneNameById: Map<string, string>;
  employeeById: Map<string, Employee>;
  isCurrent: boolean;
}) {
  const { t } = useTranslation();
  const colorClass = shiftTypeStyle[shift.tipo_turno];

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--tvu-radius) px-(--tvu-pad) py-(--tvu-pad-sm) max-lg:h-[26rem] ${
        isCurrent ? "bg-tv-accent/10 ring-(length:--tvu-bar) ring-tv-accent/50 ring-inset" : "bg-tv-surface"
      }`}
    >
      <div className="flex shrink-0 items-start justify-between gap-(--tvu-gap) pb-(--tvu-gap)">
        <div className="min-w-0">
          {isCurrent && (
            <div className="mb-(--tvu-gap-sm) flex items-center gap-(--tvu-gap-sm)">
              <span className="size-(--tvu-dot) animate-pulse rounded-full bg-tv-accent" aria-hidden />
              <span className="text-(length:--tvu-fs-xs) font-extrabold uppercase tracking-[0.1em] text-brand-dark">
                {t("tv.shift.current")}
              </span>
            </div>
          )}
          <div className={`font-heading text-(length:--tvu-fs-xl) font-bold leading-none ${colorClass}`}>
            {t(`tv.shift.type.${shift.tipo_turno}`)}
          </div>
          <div className="mt-(--tvu-gap-sm) font-mono text-(length:--tvu-fs-md) font-semibold tabular-nums text-tv-text">
            {shift.hora_inicio?.slice(0, 5)} – {shift.hora_fin?.slice(0, 5)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-(--tvu-gap-sm)">
          <CalendarClock className={`size-(--tvu-icon-lg) opacity-30 ${colorClass}`} aria-hidden />
          <span className="flex items-center gap-(--tvu-gap-sm) text-(length:--tvu-fs-sm) font-bold tabular-nums text-tv-dim">
            <UserRound className="size-(--tvu-icon-sm)" aria-hidden />
            {assignments.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {assignments.length === 0 ? (
          <TvEmptyRow text={t("tv.shifts.noEmployees")} />
        ) : (
          <TvFitList
            items={assignments}
            getKey={(a) => a.id}
            renderItem={(a) => {
              const emp = employeeById.get(a.empleado_id);
              const zoneName = a.zona_id ? zoneNameById.get(a.zona_id) : null;
              return (
                <div className="flex items-center justify-between gap-(--tvu-gap) rounded-(--tvu-radius) bg-tv-surface2 px-(--tvu-pad-sm) py-(--tvu-gap-sm)">
                  <div className="flex min-w-0 flex-1 items-center gap-(--tvu-gap-sm)">
                    <UserRound className="size-(--tvu-icon) shrink-0 text-tv-dim" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-(length:--tvu-fs-md) font-bold leading-tight text-tv-text">
                        {empName(emp, a.empleado_id)}
                      </p>
                      {emp?.role && (
                        <p className="truncate text-(length:--tvu-fs-2xs) font-semibold capitalize text-tv-dim">{emp.role}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-0 shrink items-center gap-(--tvu-gap-sm) text-(length:--tvu-fs-xs) font-semibold text-tv-dim">
                    {zoneName && (
                      <span className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
                        <MapPin className="size-(--tvu-icon-sm) shrink-0" aria-hidden />
                        <span className="truncate">{zoneName}</span>
                      </span>
                    )}
                    {a.rol && a.rol !== emp?.role && (
                      <span className="shrink-0 rounded bg-tv-surface px-[0.4em] font-mono">{a.rol}</span>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {shift.notas && (
        <p className="mt-(--tvu-gap-sm) line-clamp-1 shrink-0 text-(length:--tvu-fs-xs) text-tv-dim">{shift.notas}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TvShiftsPage() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const today = new Date().toISOString().slice(0, 10);
  const currentHour = new Date().getHours();

  const shiftsQ = useQuery({
    queryKey: ["tv-shifts-board"],
    queryFn: () => api.shifts({ fecha: today, limit: 10 }),
    refetchInterval: TV_REFETCH.SLOW,
    staleTime: TV_STALE.SLOW,
  });
  const farmSettingsQ = useQuery({ queryKey: ["farm-settings"], queryFn: api.farmSettings, staleTime: TV_STALE.CATALOG, refetchInterval: TV_REFETCH.SLOW });
  const nightEnabled = farmSettingsQ.data?.turno_noche_habilitado ?? true;

  // Con cientos de asignaciones historicas en un dataset real, un limit=50
  // sin filtro ni orden puede no incluir las de los turnos de hoy (T4,
  // segunda pasada). Se piden por turno_id una vez se conocen los turnos
  // de hoy, en vez de traer una pagina arbitraria de todas las asignaciones.
  const todayShiftIds = useMemo(
    () => (shiftsQ.data?.turnos ?? []).map((s) => s.id),
    [shiftsQ.data],
  );

  const assignmentsQ = useQuery({
    queryKey: ["tv-shift-assignments-board", todayShiftIds],
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

  const zonesQ = useQuery({
    queryKey: ["zones"],
    queryFn: api.zones,
    staleTime: TV_STALE.CATALOG,
  });

  const tasksQ = useQuery({
    queryKey: ["tv-tasks-board"],
    queryFn: () => api.tasks({ limit: 50 }),
    refetchInterval: TV_REFETCH.NORMAL,
    staleTime: TV_STALE.NORMAL,
  });

  const incidentsQ = useQuery({
    queryKey: ["tv-incidents-board"],
    queryFn: () => api.incidents({ limit: 20 }),
    refetchInterval: TV_REFETCH.NORMAL,
    staleTime: TV_STALE.NORMAL,
  });

  const employeesQ = useQuery({
    queryKey: ["employees-lookup"],
    queryFn: () => api.employees(),
    staleTime: TV_STALE.CATALOG,
    refetchInterval: TV_REFETCH.CATALOG,
  });

  const allQueryStatuses = [shiftsQ, assignmentsQ, tasksQ, incidentsQ].map((q) => ({
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    dataUpdatedAt: q.dataUpdatedAt,
  }));

  // Employee lookup map
  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employeesQ.data ?? []) map.set(e.id, e);
    return map;
  }, [employeesQ.data]);

  const shifts = (shiftsQ.data?.turnos ?? []).filter((shift) => nightEnabled || shift.tipo_turno !== "noche");
  const assignments = useMemo(() => assignmentsQ.data?.asignaciones ?? [], [assignmentsQ.data]);
  const zones = useMemo(() => zonesQ.data ?? [], [zonesQ.data]);
  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const allIncidents = useMemo(() => (incidentsQ.data ?? []) as Incident[], [incidentsQ.data]);

  // Nombre visible por zona (traducido si pertenece a una agrupacion conocida)
  const zoneNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of zones) {
      const key = zoneLabelKey(z);
      map.set(z.id, key ? t(key) : z.nombre);
    }
    return map;
  }, [zones, t]);

  // Assignments per shift (referencias estables para TvFitList)
  const assignmentsByShift = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>();
    for (const a of assignments) {
      const list = map.get(a.turno_id) ?? [];
      list.push(a);
      map.set(a.turno_id, list);
    }
    return map;
  }, [assignments]);

  // Identify current shift
  const currentShift = shifts.find((s) => {
    const start = parseInt(s.hora_inicio?.slice(0, 2) ?? "0");
    const end = parseInt(s.hora_fin?.slice(0, 2) ?? "24");
    return currentHour >= start && currentHour < end;
  });

  const pendingTasks = useMemo(
    () => allTasks.filter((t) => t.estado === "programada" || t.estado === "retrasada"),
    [allTasks],
  );
  const delayedTasks = pendingTasks.filter((t) => t.estado === "retrasada");
  const openIncidents = useMemo(
    () => allIncidents.filter((i) => i.estado === "abierta" || i.estado === "en_gestion"),
    [allIncidents],
  );
  const criticalIncidents = useMemo(
    () => openIncidents.filter((i) => i.prioridad === "critica" || i.prioridad === "alta"),
    [openIncidents],
  );

  // Zone coverage check
  const coveredZoneIds = new Set(
    assignments
      .filter((a) => currentShift && a.turno_id === currentShift.id && a.zona_id)
      .map((a) => a.zona_id!),
  );
  const uncoveredZones = TV_VISUAL_ZONES.filter((visualZone) => {
    const codeSet = new Set(visualZone.codes);
    const ids = zones.filter((z) => codeSet.has(z.codigo)).map((z) => z.id);
    return ids.length > 0 && !ids.some((id) => coveredZoneIds.has(id));
  });

  const todayLabel = new Date().toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" });

  return (
    <TvShell
      title={t("tv.shifts.title")}
      subtitle={t("tv.shifts.subtitle", { date: todayLabel, n: shifts.length })}
      queryStatuses={allQueryStatuses}
      exitHref="/shifts"
    >
      {/* Rejilla a pantalla completa: turnos (3/5) · aviso cobertura (auto) ·
          paneles operativos (2/5). En lg+ nada provoca scroll de pagina. */}
      <div className="flex flex-col gap-(--tvu-gap) lg:h-full">
        {/* ── Turnos de hoy ── */}
        <section className="flex min-h-0 flex-col lg:flex-[3]">
          {shiftsQ.isError ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center rounded-(--tvu-radius) bg-state-critica/10">
              <p className="text-(length:--tvu-fs-lg) font-bold text-state-critica">{t("tv.shifts.loadError")}</p>
            </div>
          ) : shifts.length === 0 ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-(--tvu-gap-sm) rounded-(--tvu-radius) bg-tv-surface text-center">
              <CalendarClock className="size-(--tvu-icon-lg) text-tv-dim" strokeWidth={1.5} aria-hidden />
              <p className="font-heading text-(length:--tvu-fs-xl) font-bold text-tv-text">{t("tv.shifts.empty")}</p>
              <p className="text-(length:--tvu-fs-md) text-tv-dim">{t("tv.shifts.emptyHint")}</p>
            </div>
          ) : (
            <div
              className={`grid min-h-0 flex-1 gap-(--tvu-gap) sm:grid-cols-2 lg:auto-rows-fr ${
                shiftGridCols[Math.min(shifts.length, 4)]
              }`}
            >
              {shifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  assignments={assignmentsByShift.get(shift.id) ?? []}
                  zoneNameById={zoneNameById}
                  employeeById={employeeById}
                  isCurrent={shift.id === currentShift?.id}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Aviso de cobertura de zonas ── */}
        {uncoveredZones.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-(--tvu-gap) rounded-(--tvu-radius) bg-state-atencion/12 px-(--tvu-pad) py-(--tvu-pad-sm)">
            <span className="flex items-center gap-(--tvu-gap-sm) text-(length:--tvu-fs-sm) font-extrabold uppercase tracking-[0.08em] text-state-atencion">
              <AlertOctagon className="size-(--tvu-icon) shrink-0" aria-hidden />
              {t("tv.shifts.uncovered")}
            </span>
            {uncoveredZones.map((z) => (
              <span
                key={z.key}
                className="rounded-full bg-state-atencion/15 px-(--tvu-pad-sm) py-(--tvu-gap-sm) text-(length:--tvu-fs-md) font-bold leading-none text-state-atencion"
              >
                {t(z.labelKey)}
              </span>
            ))}
          </div>
        )}

        {/* ── Paneles operativos ── */}
        <div className="grid min-h-0 gap-(--tvu-gap) sm:grid-cols-2 lg:flex-[2] lg:grid-cols-3">
          <TvPanel
            Icon={ClipboardList}
            iconTone={delayedTasks.length > 0 ? "text-state-critica" : "text-tv-accent"}
            title={t("tv.shifts.pendingTasks")}
            count={pendingTasks.length}
            className="max-lg:h-[24rem]"
          >
            {tasksQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.tasksError")} />
            ) : pendingTasks.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.shifts.noPendingTasks")} />
            ) : (
              <TvFitList
                items={pendingTasks}
                getKey={(task) => task.id}
                renderItem={(task) => (
                  <TvItem accent={task.estado === "retrasada" ? "critical" : undefined}>
                    <div className="flex min-w-0 items-center justify-between gap-(--tvu-gap-sm)">
                      <p className="truncate text-(length:--tvu-fs-md) font-bold leading-snug text-tv-text">
                        {task.tarea_catalogo?.nombre ?? t("tv.task.fallback")}
                      </p>
                      <span className="shrink-0 font-mono text-(length:--tvu-fs-sm) font-semibold tabular-nums text-tv-dim">
                        {new Date(task.fecha_programada).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {task.estado === "retrasada" && (
                      <div className="mt-(--tvu-gap-sm)">
                        <TvBadge tone="critical">{t("tv.badge.delayed")}</TvBadge>
                      </div>
                    )}
                  </TvItem>
                )}
              />
            )}
          </TvPanel>

          <TvPanel
            Icon={AlertOctagon}
            iconTone="text-state-atencion"
            title={t("tv.shifts.handoverIncidents")}
            count={openIncidents.length}
            className="max-lg:h-[24rem]"
          >
            {incidentsQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.incidentsError")} />
            ) : openIncidents.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.shifts.noPendingIncidents")} />
            ) : (
              <TvFitList
                items={openIncidents}
                getKey={(inc) => inc.id}
                renderItem={(inc) => (
                  <TvItem>
                    <div className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
                      <TvBadge tone={inc.prioridad === "critica" ? "critical" : "warning"}>
                        {t(`tv.priority.${inc.prioridad}`, { defaultValue: inc.prioridad })}
                      </TvBadge>
                      <span className="truncate text-(length:--tvu-fs-xs) font-semibold capitalize text-tv-dim">
                        {t(`incidents.types.${inc.tipo}`, { defaultValue: inc.tipo.replace(/_/g, " ") })}
                      </span>
                    </div>
                    <p className="mt-(--tvu-gap-sm) line-clamp-2 text-(length:--tvu-fs-md) font-bold leading-snug text-tv-text">
                      {inc.descripcion || inc.titulo}
                    </p>
                  </TvItem>
                )}
              />
            )}
          </TvPanel>

          <TvPanel
            Icon={AlertTriangle}
            iconTone="text-state-critica"
            title={t("tv.global.panels.criticalIncidents")}
            count={criticalIncidents.length}
            className="max-lg:h-[24rem]"
          >
            {incidentsQ.isError ? (
              <TvEmptyRow tone="error" text={t("tv.empty.incidentsError")} />
            ) : criticalIncidents.length === 0 ? (
              <TvEmptyRow tone="ok" text={t("tv.empty.noCriticalIncidents")} />
            ) : (
              <TvFitList
                items={criticalIncidents}
                getKey={(inc) => inc.id}
                renderItem={(inc) => (
                  <TvItem accent="critical">
                    <p className="truncate text-(length:--tvu-fs-xs) font-semibold capitalize text-tv-dim">
                      {t(`incidents.types.${inc.tipo}`, { defaultValue: inc.tipo.replace(/_/g, " ") })}
                    </p>
                    <p className="mt-(--tvu-gap-sm) line-clamp-2 text-(length:--tvu-fs-md) font-bold leading-snug text-tv-text">
                      {inc.descripcion || inc.titulo}
                    </p>
                  </TvItem>
                )}
              />
            )}
          </TvPanel>
        </div>
      </div>
    </TvShell>
  );
}
