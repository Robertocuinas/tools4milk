"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ClipboardList, MapPin, Monitor, Pill, Tablet, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KpiCard } from "@/components/ui/kpi-card";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { PageHeader } from "@/components/ui/page-header";
import { WeatherPanel } from "@/components/ui/WeatherPanel";
import { api } from "@/lib/api";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Incident, Machinery, Task, Treatment, Zone, VisualZoneKey } from "@/lib/types";

const VISUAL_ZONES: Record<VisualZoneKey, {
  titleKey: string;
  descriptionKey: string;
  codes: string[];
  subzones: { labelKey: string; codes: string[] }[];
}> = {
  recria: {
    titleKey: "visualZones.recria.title",
    descriptionKey: "zones.cards.recriaDescription",
    codes: ["boxes_terneros", "zona_recria", "recria", "becerrero"],
    subzones: [
      { labelKey: "visualZones.subzones.boxes.label", codes: ["boxes_terneros", "becerrero"] },
      { labelKey: "visualZones.subzones.zona_recria.label", codes: ["zona_recria", "recria"] },
    ],
  },
  nave: {
    titleKey: "visualZones.nave.title",
    descriptionKey: "zones.cards.naveDescription",
    codes: ["patio_alimentacion", "enfermeria", "maquinaria", "robots", "sala_ordeno", "silos", "almacen", "oficina", "general"],
    subzones: [
      { labelKey: "visualZones.subzones.patio.label", codes: ["patio_alimentacion", "silos", "almacen"] },
      { labelKey: "visualZones.subzones.enfermeria.label", codes: ["enfermeria"] },
      { labelKey: "visualZones.subzones.maquinaria.label", codes: ["maquinaria", "robots", "sala_ordeno", "general", "oficina"] },
    ],
  },
};

function idsForCodes(zones: Zone[], codes: string[]) {
  const wanted = new Set(codes);
  return new Set(zones.filter((z) => wanted.has(z.codigo)).map((z) => z.id));
}

function hasOpenIncident(i: Incident) {
  return i.estado === "abierta" || i.estado === "en_gestion";
}

function isPendingTask(t: Task) {
  return t.estado === "programada" || t.estado === "retrasada";
}

function VisualZoneCard({
  zoneKey,
  zones,
  tasks,
  incidents,
  machinery,
  treatments,
}: {
  zoneKey: VisualZoneKey;
  zones: Zone[];
  tasks: Task[];
  incidents: Incident[];
  machinery: Machinery[];
  treatments: Treatment[];
}) {
  const { t } = useTranslation();
  const config = VISUAL_ZONES[zoneKey];
  const zoneIds = idsForCodes(zones, config.codes);
  const zoneTasks = tasks.filter((t) => t.zona_id && zoneIds.has(t.zona_id));
  const openIncidents = incidents.filter((i) => i.zona_id && zoneIds.has(i.zona_id) && hasOpenIncident(i));
  const zoneMachinery = machinery.filter((m) => m.zona_id && zoneIds.has(m.zona_id));
  const pendingTasks = zoneTasks.filter(isPendingTask);
  const delayed = zoneTasks.filter((t) => t.estado === "retrasada");

  return (
    <Link href={`/zones/${zoneKey}`} className="block rounded-[14px] border border-app-border bg-white p-5 shadow-card transition hover:border-brand/30 hover:shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-app-dim">{t("zones.cards.mainView")}</p>
          <h2 className="mt-1 font-heading text-2xl font-bold text-app-text">{t(config.titleKey)}</h2>
          <p className="mt-1 text-sm text-app-dim">{t(config.descriptionKey)}</p>
        </div>
        <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
          delayed.length > 0 || openIncidents.some((i) => i.prioridad === "alta" || i.prioridad === "critica")
            ? "bg-state-atencion/10 text-state-atencion"
            : "bg-state-ok/10 text-state-ok"
        }`}>
          {delayed.length > 0 ? t("leanfarming.statusAttention") : t("leanfarming.statusOperational")}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("zones.pendingTasks")} value={pendingTasks.length} Icon={ClipboardList} tone={delayed.length > 0 ? "warning" : "info"} />
        <KpiCard label={t("zones.openIncidents")} value={openIncidents.length} Icon={AlertOctagon} tone={openIncidents.length > 0 ? "warning" : "success"} />
        <KpiCard label={t("zones.activeTreatments")} value={treatments.filter((t) => t.activo).length} Icon={Pill} tone="info" />
        <KpiCard label={t("zones.machinery")} value={zoneMachinery.length} Icon={Wrench} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {config.subzones.map((subzone) => {
          const ids = idsForCodes(zones, subzone.codes);
          const count = tasks.filter((t) => t.zona_id && ids.has(t.zona_id) && isPendingTask(t)).length;
          const incCount = incidents.filter((i) => i.zona_id && ids.has(i.zona_id) && hasOpenIncident(i)).length;
          return (
            <div key={subzone.labelKey} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
              <p className="text-sm font-bold text-app-text">{t(subzone.labelKey)}</p>
              <p className="mt-1 text-xs text-app-dim">{t("zones.cards.pendingTasksCount", { count })} · {t("zones.cards.incidentsCount", { count: incCount })}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-state-info/8 px-2 py-1 text-state-info"><Monitor className="h-3 w-3" /> {t("zone.modes.tv")}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-state-ok/8 px-2 py-1 text-state-ok"><Tablet className="h-3 w-3" /> {t("zone.modes.tablet")}</span>
      </div>
    </Link>
  );
}

export default function ZonesPage() {
  const { t } = useTranslation();
  const zonesQ = useQuery({ queryKey: ["zones"], queryFn: api.zones, staleTime: TV_STALE.CATALOG });
  const tasksQ = useQuery({ queryKey: ["tasks-all"], queryFn: () => api.tasks({ limit: 500 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const incidentsQ = useQuery({ queryKey: ["tv-incidents"], queryFn: () => api.incidents({ limit: 300 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const machineryQ = useQuery({ queryKey: ["machinery-all"], queryFn: () => api.machinery({ limit: 200 }), staleTime: TV_STALE.CATALOG });
  const treatmentsQ = useQuery({ queryKey: ["treatments-active"], queryFn: () => api.treatments({ activo: true, limit: 100 }), staleTime: TV_STALE.NORMAL });

  const zones = zonesQ.data ?? [];
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const incidents = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);
  const machinery = useMemo(() => machineryQ.data ?? [], [machineryQ.data]);
  const treatments = useMemo(() => treatmentsQ.data ?? [], [treatmentsQ.data]);

  const openIncidents = incidents.filter(hasOpenIncident).length;
  const pendingTasks = tasks.filter(isPendingTask).length;

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("zones.eyebrow")} title={t("zones.title")} EyebrowIcon={MapPin}>
        <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">
          {t("zones.headerBadge")}
        </span>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <BentoGrid>
          <BentoTile footprint={openIncidents > 0 ? "2x1" : "1x1"}><KpiCard label={t("zones.openIncidents")} value={openIncidents} Icon={AlertOctagon} tone={openIncidents > 0 ? "warning" : "success"} featured={openIncidents > 0} /></BentoTile>
          <BentoTile footprint={pendingTasks > 0 ? "2x1" : "1x1"}><KpiCard label={t("zones.pendingTasks")} value={pendingTasks} Icon={ClipboardList} tone={pendingTasks > 0 ? "info" : "success"} featured={pendingTasks > 0} /></BentoTile>
          <BentoTile><KpiCard label={t("zones.activeSubzones")} value={7} tone="success" /></BentoTile>
          <BentoTile><KpiCard label={t("zones.visualizations")} value={2} /></BentoTile>
        </BentoGrid>

        <WeatherPanel compact />

        {zonesQ.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-[14px] bg-app-surface2" />
            <div className="h-80 animate-pulse rounded-[14px] bg-app-surface2" />
          </div>
        ) : (
          <BentoGrid className="xl:auto-rows-auto">
            <BentoTile footprint="2x1"><VisualZoneCard zoneKey="recria" zones={zones} tasks={tasks} incidents={incidents} machinery={machinery} treatments={treatments} /></BentoTile>
            <BentoTile footprint="2x1"><VisualZoneCard zoneKey="nave" zones={zones} tasks={tasks} incidents={incidents} machinery={machinery} treatments={treatments} /></BentoTile>
          </BentoGrid>
        )}

        <div className="rounded-[var(--bento-radius)] border border-app-border bg-white px-5 py-4 text-sm text-app-dim shadow-card">
          {t("zones.legacyNote")}
        </div>
      </div>
    </div>
  );
}
