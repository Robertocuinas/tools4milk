"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ClipboardList, MapPin, Monitor, Pill, Tablet, Wrench } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { WeatherPanel } from "@/components/ui/WeatherPanel";
import { api } from "@/lib/api";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Incident, Task } from "@/lib/types";

const openIncident = (incident: Incident) => incident.estado === "abierta" || incident.estado === "en_gestion";
const pendingTask = (task: Task) => task.estado === "programada" || task.estado === "retrasada";

function QueryNotice({ loading, error, label }: { loading: boolean; error: boolean; label: string }) {
  if (loading) return <p className="animate-pulse rounded-lg bg-app-surface2 px-3 py-2 text-xs text-app-dim">{label}…</p>;
  if (error) return <p role="status" className="rounded-lg bg-state-critica/5 px-3 py-2 text-xs text-state-critica">{label}</p>;
  return null;
}

export default function ZonesPage() {
  const { t } = useTranslation();
  const zonesQ = useQuery({ queryKey: ["zones"], queryFn: api.zones, staleTime: TV_STALE.CATALOG });
  const tasksQ = useQuery({ queryKey: ["tasks-all"], queryFn: () => api.tasks({ limit: 500 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const incidentsQ = useQuery({ queryKey: ["tv-incidents"], queryFn: () => api.incidents({ limit: 300 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const animalsQ = useQuery({ queryKey: ["animals-lookup"], queryFn: () => api.animals({ limit: 500 }), staleTime: TV_STALE.CATALOG });
  const machineryQ = useQuery({ queryKey: ["machinery-all"], queryFn: () => api.machinery({ limit: 200 }), staleTime: TV_STALE.CATALOG });
  const treatmentsQ = useQuery({ queryKey: ["treatments-active"], queryFn: () => api.treatments({ activo: true, limit: 500 }), staleTime: TV_STALE.NORMAL });
  const zones = (zonesQ.data ?? []).filter((zone) => zone.activa !== false).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
  const tasks = tasksQ.data ?? [];
  const incidents = incidentsQ.data ?? [];
  const overallPending = tasks.filter(pendingTask).length;
  const overallIncidents = incidents.filter(openIncident).length;
  const dataError = tasksQ.isError || incidentsQ.isError;

  return <div className="min-h-full">
    <PageHeader eyebrow={t("zones.eyebrow")} title={t("zones.title")} EyebrowIcon={MapPin}>
      <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">{t("zones.headerBadge")}</span>
    </PageHeader>
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <BentoGrid>
        <BentoTile><KpiCard label={t("zones.openIncidents")} value={incidentsQ.isError ? "—" : overallIncidents} Icon={AlertOctagon} tone={overallIncidents ? "warning" : "success"} /></BentoTile>
        <BentoTile><KpiCard label={t("zones.pendingTasks")} value={tasksQ.isError ? "—" : overallPending} Icon={ClipboardList} tone="info" /></BentoTile>
        <BentoTile><KpiCard label={t("zones.activeSubzones")} value={zonesQ.isError ? "—" : zones.length} tone="success" /></BentoTile>
        <BentoTile><KpiCard label={t("zones.visualizations")} value={zones.filter((z) => z.tiene_pantalla_tv || z.tiene_tablet).length} /></BentoTile>
      </BentoGrid>
      <WeatherPanel compact />
      {zonesQ.isLoading ? <div className="grid gap-4 xl:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-72 animate-pulse rounded-[14px] bg-app-surface2" />)}</div>
        : zonesQ.isError ? <div role="alert" className="rounded-[14px] border border-state-critica/20 bg-white p-6 text-sm text-state-critica">{t("zones.title")}: {zonesQ.error instanceof Error ? zonesQ.error.message : "Error"}</div>
        : zones.length === 0 ? <div className="rounded-[14px] border border-dashed border-app-border bg-white p-10 text-center text-sm text-app-dim">{t("zones.title")}: —</div>
        : <div className="grid gap-4 xl:grid-cols-2">{zones.map((zone) => {
          const zoneTasks = tasks.filter((task) => task.zona_id === zone.id);
          const zoneIncidents = incidents.filter((incident) => incident.zona_id === zone.id && openIncident(incident));
          const zoneAnimalIds = new Set((animalsQ.data ?? []).filter((animal) => animal.zona_id === zone.id).map((animal) => animal.id));
          const activeTreatments = (treatmentsQ.data ?? []).filter((treatment) => treatment.activo && zoneAnimalIds.has(treatment.animal_id)).length;
          const zoneMachinery = (machineryQ.data ?? []).filter((item) => item.zona_id === zone.id);
          const waiting = zoneTasks.filter(pendingTask).length;
          const delayed = zoneTasks.filter((task) => task.estado === "retrasada").length;
          return <Link key={zone.id} href={`/zones/${zone.id}`} className="block rounded-[14px] border border-app-border bg-white p-5 shadow-card transition hover:border-brand/30 hover:shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-bold uppercase tracking-widest text-app-dim">{zone.codigo}</p><h2 className="mt-1 font-heading text-2xl font-bold text-app-text">{zone.nombre}</h2>{zone.descripcion && <p className="mt-1 text-sm text-app-dim">{zone.descripcion}</p>}</div>
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${delayed || zoneIncidents.some((i) => i.prioridad === "alta" || i.prioridad === "critica") ? "bg-state-atencion/10 text-state-atencion" : "bg-state-ok/10 text-state-ok"}`}>{delayed ? t("leanfarming.statusAttention") : t("leanfarming.statusOperational")}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><KpiCard label={t("zones.pendingTasks")} value={tasksQ.isError ? "—" : waiting} Icon={ClipboardList} tone={delayed ? "warning" : "info"} /><KpiCard label={t("zones.openIncidents")} value={incidentsQ.isError ? "—" : zoneIncidents.length} Icon={AlertOctagon} tone={zoneIncidents.length ? "warning" : "success"} /><KpiCard label={t("zones.activeTreatments")} value={animalsQ.isLoading || treatmentsQ.isLoading || animalsQ.isError || treatmentsQ.isError ? "—" : activeTreatments} Icon={Pill} tone="info" /><KpiCard label={t("zones.machinery")} value={machineryQ.isLoading || machineryQ.isError ? "—" : zoneMachinery.length} Icon={Wrench} /></div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">{zone.tiene_pantalla_tv && <span className="inline-flex items-center gap-1 rounded-full bg-state-info/8 px-2 py-1 text-state-info"><Monitor className="h-3 w-3" /> {t("zone.modes.tv")}</span>}{zone.tiene_tablet && <span className="inline-flex items-center gap-1 rounded-full bg-state-ok/8 px-2 py-1 text-state-ok"><Tablet className="h-3 w-3" /> {t("zone.modes.tablet")}</span>}</div>
            <div className="mt-3 grid gap-1 sm:grid-cols-2"><QueryNotice loading={tasksQ.isLoading} error={tasksQ.isError} label={t("zones.pendingTasks")} /><QueryNotice loading={incidentsQ.isLoading} error={incidentsQ.isError} label={t("zones.openIncidents")} /><QueryNotice loading={animalsQ.isLoading || treatmentsQ.isLoading} error={animalsQ.isError || treatmentsQ.isError} label={t("zones.activeTreatments")} /><QueryNotice loading={machineryQ.isLoading} error={machineryQ.isError} label={t("zones.machinery")} /></div>
          </Link>;
        })}</div>}
      {dataError && <p role="status" className="text-xs text-app-dim">{t("zones.title")} · {t("zones.pendingTasks")} / {t("zones.openIncidents")}</p>}
    </div>
  </div>;
}
