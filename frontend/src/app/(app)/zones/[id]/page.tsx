"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, Monitor, Tablet, Wrench, X } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { LastHandoverCard } from "@/components/zone/LastHandoverCard";
import { ZoneKanbanView } from "@/components/zone/ZoneKanbanView";
import { ZoneTabletView } from "@/components/zone/ZoneTabletView";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { VoiceToTextButton } from "@/components/ui/voice-to-text-button";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Animal, BoxRecria, CreateIncidentPayload, Incident, IncidentPriority, Task, VisualZoneKey, Zone } from "@/lib/types";

const VISUAL_ZONES: Record<VisualZoneKey, {
  titleKey: string;
  descriptionKey: string;
  codes: string[];
  subzones: { key: string; labelKey: string; codes: string[]; descriptionKey: string }[];
}> = {
  recria: {
    titleKey: "visualZones.recria.title",
    descriptionKey: "zone.descriptions.recria",
    codes: ["boxes_terneros", "zona_recria", "recria", "becerrero"],
    subzones: [
      { key: "boxes", labelKey: "visualZones.subzones.boxes.label", codes: ["boxes_terneros", "becerrero"], descriptionKey: "visualZones.subzones.boxes.description" },
      { key: "zona_recria", labelKey: "visualZones.subzones.zona_recria.label", codes: ["zona_recria", "recria"], descriptionKey: "visualZones.subzones.zona_recria.description" },
    ],
  },
  nave: {
    titleKey: "visualZones.nave.title",
    descriptionKey: "zone.descriptions.nave",
    codes: ["patio_alimentacion", "enfermeria", "maquinaria", "robots", "sala_ordeno", "silos", "almacen", "oficina", "general"],
    subzones: [
      { key: "patio", labelKey: "visualZones.subzones.patio.label", codes: ["patio_alimentacion", "silos", "almacen"], descriptionKey: "visualZones.subzones.patio.description" },
      { key: "enfermeria", labelKey: "visualZones.subzones.enfermeria.label", codes: ["enfermeria"], descriptionKey: "visualZones.subzones.enfermeria.description" },
      { key: "maquinaria", labelKey: "visualZones.subzones.maquinaria.label", codes: ["maquinaria", "robots", "sala_ordeno", "general", "oficina"], descriptionKey: "visualZones.subzones.maquinaria.description" },
    ],
  },
};

function idsForCodes(zones: Zone[], codes: string[]) {
  const wanted = new Set(codes);
  return new Set(zones.filter((z) => wanted.has(z.codigo)).map((z) => z.id));
}

function zoneOptionsForSubzones(zones: Zone[], subzones: { labelKey: string; codes: string[] }[], t: TFunction) {
  return subzones
    .map((subzone) => {
      const wanted = new Set(subzone.codes);
      const zone = zones.find((z) => wanted.has(z.codigo));
      return zone ? { ...zone, nombre: t(subzone.labelKey) } : null;
    })
    .filter((zone): zone is Zone => Boolean(zone));
}

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function openIncident(i: Incident) {
  return i.estado === "abierta" || i.estado === "en_gestion";
}

function pendingTask(t: Task) {
  return t.estado === "programada" || t.estado === "retrasada";
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="h-full rounded-[var(--bento-radius)] border border-app-border bg-white p-[var(--bento-padding)] shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold text-app-text">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-app-bg px-2.5 py-1 text-xs font-bold text-app-dim">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-[10px] border border-dashed border-app-border bg-app-bg px-4 py-8 text-center text-sm text-app-dim">{text}</p>;
}

function CreateIncidentModal({ zones, onClose }: { zones: Zone[]; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [zonaId, setZonaId] = useState(zones[0]?.id ?? "");
  const [tipo, setTipo] = useState("sanidad_animal");
  const [prioridad, setPrioridad] = useState<IncidentPriority>("media");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: CreateIncidentPayload) => api.createIncident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zone-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["tv-incidents"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-[14px] bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="font-heading text-lg font-bold text-app-text">{t("zone.incidentModal.title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="tablet-touch flex items-center justify-center text-app-dim hover:text-app-text"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm">
            <option value="sanidad_animal">{t("incidents.types.sanidad_animal")}</option>
            <option value="alimentacion">{t("incidents.types.alimentacion")}</option>
            <option value="averia_maquinaria">{t("incidents.types.averia_maquinaria")}</option>
            <option value="infraestructura">{t("incidents.types.infraestructura")}</option>
          </select>
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as IncidentPriority)} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm">
            <option value="baja">{t("incidents.priorities.baja")}</option>
            <option value="media">{t("incidents.priorities.media")}</option>
            <option value="alta">{t("incidents.priorities.alta")}</option>
            <option value="critica">{t("incidents.priorities.critica")}</option>
          </select>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t("zone.incidentModal.titlePlaceholder")} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm" />
          <div className="flex justify-end">
            <VoiceToTextButton onTranscribed={(text) => setDescripcion((prev) => (prev ? `${prev} ${text}` : text))} />
          </div>
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={t("zone.incidentModal.descriptionPlaceholder")} className="w-full resize-none rounded-[10px] border border-app-border px-3 py-2 text-sm" />
          {mutation.isError && <p className="text-sm font-semibold text-state-critica">{mutation.error.message}</p>}
          <button type="button" disabled={!zonaId || !descripcion.trim() || mutation.isPending} onClick={() => mutation.mutate({ zona_id: zonaId, tipo, prioridad, titulo: titulo.trim() || undefined, descripcion })} className="w-full rounded-[10px] bg-brand-dark py-3 font-bold text-white disabled:opacity-50">
            {mutation.isPending ? t("zone.incidentModal.submitting") : t("zone.incidentModal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TreatmentModal({ animals, onClose }: { animals: Animal[]; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [animalId, setAnimalId] = useState(animals[0]?.id ?? "");
  const [medicamento, setMedicamento] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fechaFin, setFechaFin] = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () => api.createTreatment({ animal_id: animalId, medicamento, motivo, fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: fechaFin, activo: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zone-treatments"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-[14px] bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="font-heading text-lg font-bold text-app-text">{t("zone.treatmentModal.title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="tablet-touch flex items-center justify-center text-app-dim hover:text-app-text"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <select value={animalId} onChange={(e) => setAnimalId(e.target.value)} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm">
            {animals.map((a) => <option key={a.id} value={a.id}>{a.crotal_oficial} {a.nombre ? `· ${a.nombre}` : ""}</option>)}
          </select>
          <input value={medicamento} onChange={(e) => setMedicamento(e.target.value)} placeholder={t("zone.treatmentModal.medicationPlaceholder")} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm" />
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("zone.treatmentModal.reasonPlaceholder")} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm" />
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="h-11 w-full rounded-[10px] border border-app-border px-3 text-sm" />
          {mutation.isError && <p className="text-sm font-semibold text-state-critica">{mutation.error.message}</p>}
          <button type="button" disabled={!animalId || !medicamento.trim() || mutation.isPending} onClick={() => mutation.mutate()} className="w-full rounded-[10px] bg-brand-dark py-3 font-bold text-white disabled:opacity-50">
            {mutation.isPending ? t("leanfarming.saving") : t("zone.treatmentModal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskList({ tasks, canComplete }: { tasks: Task[]; canComplete: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (taskId: string) => api.completeTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["zone-tasks"] }),
  });

  if (tasks.length === 0) return <Empty text={t("zone.noPendingTasks")} />;
  return (
    <div className="space-y-2">
      {tasks.slice(0, 10).map((task) => (
        <div key={task.id} className={`rounded-[10px] border px-4 py-3 ${task.estado === "retrasada" ? "border-state-critica/30 bg-state-critica/5" : "border-app-border bg-app-bg"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
              <p className="mt-0.5 text-xs text-app-dim">{enumLabel("taskStatus", task.estado)} · {formatDate(task.fecha_programada, dateLocale(i18n.language))}</p>
              {task.observaciones && <p className="mt-1 text-xs text-app-dim">{task.observaciones}</p>}
            </div>
            {canComplete && (
              <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(task.id)} className="rounded-[10px] bg-state-ok/10 px-3 py-2 text-xs font-bold text-state-ok">
                {t("zone.complete")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const zoneKey: VisualZoneKey = id === "nave" ? "nave" : "recria";
  const config = VISUAL_ZONES[zoneKey];
  const [mode, setMode] = useState<"management" | "tv" | "tablet">("management");
  const [showIncident, setShowIncident] = useState(false);
  const [showTreatment, setShowTreatment] = useState(false);

  const [, setLastHandoverRead] = useState(false);

  const zonesQ = useQuery({ queryKey: ["zones"], queryFn: api.zones, staleTime: TV_STALE.CATALOG });
  const tasksQ = useQuery({ queryKey: ["zone-tasks", zoneKey], queryFn: () => api.tasks({ limit: 500 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const incidentsQ = useQuery({ queryKey: ["zone-incidents", zoneKey], queryFn: () => api.incidents({ limit: 300 }), staleTime: TV_STALE.NORMAL, refetchInterval: TV_REFETCH.NORMAL });
  const treatmentsQ = useQuery({ queryKey: ["zone-treatments"], queryFn: () => api.treatments({ activo: true, limit: 100 }), staleTime: TV_STALE.NORMAL });
  const animalsQ = useQuery({ queryKey: ["animals-lookup"], queryFn: () => api.animals({ limit: 500 }), staleTime: TV_STALE.CATALOG });
  const machineryQ = useQuery({ queryKey: ["machinery-all"], queryFn: () => api.machinery({ limit: 200 }), staleTime: TV_STALE.CATALOG });
  const boxesQ = useQuery({ queryKey: ["boxes-recria"], queryFn: () => api.boxesRecria(), staleTime: TV_STALE.CATALOG });
  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: TV_STALE.CATALOG });
  const handoversQ = useQuery({ queryKey: ["zone-handovers"], queryFn: () => api.shiftHandovers({ limit: 10 }), staleTime: TV_STALE.NORMAL });

  const zones = zonesQ.data ?? [];
  const groupIds = idsForCodes(zones, config.codes);
  const incidentZones = zoneOptionsForSubzones(zones, config.subzones, t);
  const tasks = (tasksQ.data ?? []).filter((t) => t.zona_id && groupIds.has(t.zona_id));
  const pendingTasks = tasks.filter(pendingTask);
  const incidents = (incidentsQ.data ?? []).filter((i) => i.zona_id && groupIds.has(i.zona_id));
  const openIncidents = incidents.filter(openIncident);
  const machinery = (machineryQ.data ?? []).filter((m) => m.zona_id && groupIds.has(m.zona_id));
  const animals = useMemo(() => animalsQ.data ?? [], [animalsQ.data]);
  const animalsById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);
  const boxes: BoxRecria[] = boxesQ.data ?? [];
  const groupAnimalIds = new Set([
    ...animals.filter((a) => zoneKey === "recria" ? ["recria", "gestante"].includes(a.estado) : ["produccion", "seca"].includes(a.estado)).map((a) => a.id),
    ...boxes.map((b) => b.ternero_id).filter(Boolean) as string[],
  ]);
  const treatments = (treatmentsQ.data ?? []).filter((t) => groupAnimalIds.has(t.animal_id));

  const role = meQ.data?.role;
  const canManageTreatments = role === "admin" || role === "veterinario";
  const canCompleteTasks = role === "admin" || role === "operario" || role === "alimentacion";
  const canCreateIncidents = !!role;
  const isTvMode = mode === "tv";

  return (
    <div className={`min-h-full ${isTvMode ? "bg-tv-bg text-tv-text" : "bg-app-bg"}`}>
      {showIncident && <CreateIncidentModal zones={incidentZones} onClose={() => setShowIncident(false)} />}
      {showTreatment && <TreatmentModal animals={animals.filter((a) => groupAnimalIds.has(a.id))} onClose={() => setShowTreatment(false)} />}

      <div className={`border-b px-4 py-3 lg:px-8 lg:py-4 ${isTvMode ? "border-tv-border" : "border-app-border bg-white"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/zones" className={`flex shrink-0 items-center gap-1 text-sm ${isTvMode ? "text-tv-dim hover:text-tv-text" : "text-app-dim hover:text-app-text"}`}>
            <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" /> {t("nav.zones")}
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className={`truncate font-heading text-xl font-bold lg:text-2xl ${isTvMode ? "text-tv-text" : "text-app-text"}`}>{t(config.titleKey)}</h1>
            <p className={`hidden truncate text-sm sm:block ${isTvMode ? "text-tv-dim" : "text-app-dim"}`}>{t(config.descriptionKey)}</p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-[10px] border border-app-border bg-white">
            {[{ key: "management", label: t("zone.modes.management") }, { key: "tv", label: t("zone.modes.tv") }, { key: "tablet", label: t("zone.modes.tablet") }].map((item) => (
              <button key={item.key} type="button" onClick={() => setMode(item.key as typeof mode)} className={`tablet-touch flex items-center justify-center px-3 py-2 text-xs font-bold transition ${mode === item.key ? "bg-brand/10 text-brand-dark" : "text-app-dim hover:bg-app-bg"}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Handover: only Tablet can confirm; Management and TV are read-only */}
        {handoversQ.data?.resumenes?.[0] && (
          <LastHandoverCard
            handover={handoversQ.data.resumenes[0]}
            onMarkAsRead={() => setLastHandoverRead(true)}
            readOnly={mode !== "tablet"}
          />
        )}

        {mode === "management" && (
          <BentoGrid>
            <BentoTile footprint={openIncidents.length > 0 ? "2x1" : "1x1"}><KpiCard label={t("zones.openIncidents")} value={openIncidents.length} tone={openIncidents.length > 0 ? "warning" : "success"} featured={openIncidents.length > 0} /></BentoTile>
            <BentoTile footprint={pendingTasks.length > 0 ? "2x1" : "1x1"}><KpiCard label={t("zones.pendingTasks")} value={pendingTasks.length} tone={pendingTasks.length > 0 ? "info" : "success"} featured={pendingTasks.length > 0} /></BentoTile>
            <BentoTile><KpiCard label={t("zones.activeTreatments")} value={treatments.length} tone="info" /></BentoTile>
            <BentoTile><KpiCard label={t("zone.subzones")} value={config.subzones.length} /></BentoTile>
            <BentoTile><KpiCard label={t("zones.machinery")} value={machinery.length} /></BentoTile>
          </BentoGrid>
        )}

        {/* Mode: TV Kanban */}
        {mode === "tv" && (
          <ZoneKanbanView tasks={tasks} incidents={openIncidents} />
        )}

        {/* Mode: Tablet Operative */}
        {mode === "tablet" && (
          <ZoneTabletView
            tasks={tasks}
            zoneKey={zoneKey}
            canStartTasks={canCompleteTasks}
            canCreateIncidents={canCreateIncidents}
            canManageTreatments={canManageTreatments}
            onCreateIncident={() => setShowIncident(true)}
            onShowTreatment={() => setShowTreatment(true)}
          />
        )}

        {mode === "management" && (
          <BentoGrid className="xl:auto-rows-auto">
            {config.subzones.map((subzone) => {
            const ids = idsForCodes(zones, subzone.codes);
            const subTasks = tasks.filter((t) => t.zona_id && ids.has(t.zona_id) && pendingTask(t));
            const subInc = incidents.filter((i) => i.zona_id && ids.has(i.zona_id) && openIncident(i));
            return (
              <BentoTile key={subzone.key} footprint="2x1">
                <Panel title={t(subzone.labelKey)}>
                  <p className="mb-3 text-sm text-app-dim">{t(subzone.descriptionKey)}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="rounded-[10px] bg-app-bg px-3 py-2">{t("zone.tasksCount", { count: subTasks.length })}</span>
                    <span className="rounded-[10px] bg-app-bg px-3 py-2">{t("zones.cards.incidentsCount", { count: subInc.length })}</span>
                  </div>
                </Panel>
              </BentoTile>
            );
          })}
          </BentoGrid>
        )}

        {mode === "management" && zoneKey === "recria" && (
          <Panel title={t("visualZones.subzones.boxes.label")} count={boxes.length}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {boxes.slice(0, 12).map((box) => {
                const animal = box.ternero_id ? animalsById.get(box.ternero_id) : undefined;
                return (
                  <div key={box.id} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
                    <p className="font-bold text-app-text">{t("zone.boxNumber", { number: box.box_numero })}</p>
                    <p className="text-xs text-app-dim">{animal ? `${animal.crotal_oficial} · ${animal.nombre ?? t("zone.calf")}` : t("zone.calfWithoutTag")}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {mode === "management" && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title={t("zones.pendingTasks")} count={pendingTasks.length}>
            <TaskList tasks={pendingTasks} canComplete={false} />
          </Panel>

          <Panel title={t("zones.activeTreatments")} count={treatments.length}>
            {treatments.length === 0 ? <Empty text={t("zone.noActiveTreatments")} /> : (
              <div className="space-y-2">
                {treatments.slice(0, 10).map((tr) => {
                  const animal = animalsById.get(tr.animal_id);
                  const box = boxes.find((b) => b.ternero_id === tr.animal_id);
                  return (
                    <div key={tr.id} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
                      <p className="text-sm font-bold text-app-text">{box ? t("zone.boxNumber", { number: box.box_numero }) : animal?.crotal_oficial ?? t("zone.animal")} · {tr.medicamento}</p>
                      <p className="text-xs text-app-dim">{tr.motivo ?? tr.observaciones ?? t("zone.activeTreatment")} · {t("zone.since", { date: formatDate(tr.fecha_inicio, locale) })}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={zoneKey === "nave" ? t("zone.naveIncidents") : t("zone.recriaIncidents")} count={openIncidents.length}>
            {openIncidents.length === 0 ? <Empty text={t("zone.noOpenIncidents")} /> : (
              <div className="space-y-2">
                {openIncidents.slice(0, 10).map((i) => {
                  const hasSeparateDescription =
                    i.descripcion.trim().length > 0 &&
                    i.descripcion.trim().toLowerCase() !== i.titulo.trim().toLowerCase();
                  return (
                    <div key={i.id} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          i.prioridad === "critica" ? "bg-state-critica/10 text-state-critica"
                          : i.prioridad === "alta" ? "bg-state-atencion/10 text-state-atencion"
                          : i.prioridad === "media" ? "bg-state-info/10 text-state-info"
                          : "bg-state-neutral/10 text-state-neutral"
                        }`}>{t(`incidents.priorities.${i.prioridad}`, { defaultValue: i.prioridad })}</span>
                        <span className="text-xs text-app-dim">{t(`incidents.types.${i.tipo}`, { defaultValue: i.tipo.replace(/_/g, " ") })}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-app-text">{i.titulo}</p>
                      {hasSeparateDescription && (
                        <p className="mt-0.5 text-xs text-app-dim">{i.descripcion}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
            </div>
          )}

        {mode === "management" && zoneKey === "nave" && (
          <Panel title={t("zone.machineryStatusTitle")} count={machinery.length}>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {machinery.map((m) => (
                <div key={m.id} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-app-dim" />
                    <p className="font-bold text-app-text">{m.nombre}</p>
                  </div>
                  <p className="mt-1 text-xs capitalize text-app-dim">{t(`zone.machineryType.${m.tipo}`, { defaultValue: m.tipo.replace(/_/g, " ") })} · {t(`zone.machineryStatus.${m.estado}`, { defaultValue: m.estado.replace(/_/g, " ") })}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {mode === "tv" && (
          <div className="flex gap-2 text-xs font-semibold text-app-text">
            <span className="inline-flex items-center gap-1 rounded-full bg-state-info/10 px-2 py-1"><Monitor className="h-3 w-3" /> {t("zone.tvViewOf", { zone: t(config.titleKey) })}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-state-ok/10 px-2 py-1"><Tablet className="h-3 w-3" /> {t("zone.tabletAvailable")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-state-ok/10 px-2 py-1"><CheckCircle2 className="h-3 w-3" /> {t("zone.alertsAsIncidents")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
