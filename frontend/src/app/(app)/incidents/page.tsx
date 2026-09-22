"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IncidentAttachments } from "@/components/incidents/IncidentAttachments";
import { useToast } from "@/components/ui/toast";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { api, normalizeAlert, normalizeIncident } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import type {
  AlertState,
  CreateIncidentPayload,
  IncidentPriority,
  IncidentStatus,
  UnifiedEstado,
  UnifiedIncident,
} from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────

const INCIDENT_TYPES = [
  "averia_maquinaria",
  "infraestructura",
  "sanidad_animal",
  "calidad_leche",
  "alimentacion",
  "pedidos",
];

const STATUS_LABELS: Record<IncidentStatus, string> = {
  abierta: "Abierta",
  en_gestion: "En gestion",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};

const STATUS_STYLES: Record<IncidentStatus, string> = {
  abierta: "bg-state-critica/15 text-state-critica border-state-critica/30",
  en_gestion: "bg-state-atencion/15 text-state-atencion border-state-atencion/30",
  resuelta: "bg-state-ok/15 text-state-ok border-state-ok/30",
  cerrada: "bg-state-neutral/10 text-state-neutral border-state-neutral/20",
};

const SEVERITY_STYLES: Record<string, string> = {
  critica: "bg-state-critica/15 text-state-critica",
  alta: "bg-state-atencion/15 text-state-atencion",
  media: "bg-state-info/15 text-state-info",
  baja: "bg-state-neutral/10 text-state-neutral",
};

const INCIDENT_ZONE_OPTIONS = [
  { label: "Boxes de terneros", codes: ["boxes_terneros", "becerrero"] },
  { label: "Zona de recria", codes: ["zona_recria", "recria"] },
  { label: "Patio de alimentacion", codes: ["patio_alimentacion", "silos", "almacen"] },
  { label: "Enfermeria", codes: ["enfermeria"] },
  { label: "Maquinaria", codes: ["maquinaria", "robots", "sala_ordeno", "oficina", "general"] },
];

function displayZoneName(codigo?: string | null, fallback?: string | null) {
  if (!codigo) return fallback ?? null;
  const option = INCIDENT_ZONE_OPTIONS.find((item) => item.codes.includes(codigo));
  return option?.label ?? fallback ?? codigo;
}

function incidentZoneOptions(zones: { id: string; nombre: string; codigo: string }[]) {
  return INCIDENT_ZONE_OPTIONS.map((option) => {
    const zone = zones.find((z) => option.codes.includes(z.codigo));
    return zone ? { id: zone.id, nombre: option.label } : null;
  }).filter((zone): zone is { id: string; nombre: string } => Boolean(zone));
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso?: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Sub-components ───────────────────────────────────────────────────────

function StatusBadge({ estado }: { estado: IncidentStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${STATUS_STYLES[estado]}`}>
      {STATUS_LABELS[estado]}
    </span>
  );
}

// ── Create incident modal ───────────────────────────────────────────────

function CreateIncidentModal({
  zones,
  onClose,
}: {
  zones: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tipo, setTipo] = useState(INCIDENT_TYPES[0]);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<IncidentPriority>("media");
  const [zonaId, setZonaId] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: CreateIncidentPayload) => api.createIncident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      toast.success("Incidencia registrada");
      onClose();
    },
  });

  const priorities: { value: IncidentPriority; label: string; cls: string }[] = [
    { value: "critica", label: "Critica", cls: "border-state-critica text-state-critica bg-state-critica/10" },
    { value: "alta", label: "Alta", cls: "border-state-atencion text-state-atencion bg-state-atencion/10" },
    { value: "media", label: "Media", cls: "border-state-info text-state-info bg-state-info/10" },
    { value: "baja", label: "Baja", cls: "border-app-dim text-app-dim bg-app-bg" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-lg rounded-t-[20px] border border-app-border bg-white shadow-panel sm:rounded-[14px]">
        <div className="flex items-center justify-between border-b border-app-border px-6 py-4">
          <h2 className="font-heading text-lg font-bold text-app-text">Nueva incidencia</h2>
          <button type="button" onClick={onClose} className="text-app-dim hover:text-app-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Prioridad */}
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">Prioridad</p>
            <div className="grid grid-cols-4 gap-2">
              {priorities.map(({ value, label, cls }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPrioridad(value)}
                  className={`rounded-[10px] border-2 py-2 text-xs font-bold transition ${prioridad === value ? cls : "border-app-border text-app-dim hover:border-app-dim"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
              Tipo
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {/* Zona (opcional) */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
              Zona (opcional)
            </label>
            <select
              value={zonaId}
              onChange={(e) => setZonaId(e.target.value)}
              className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
            >
              <option value="">Sin zona asignada</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.nombre}</option>
              ))}
            </select>
          </div>

          {/* Título (opcional) */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
              Título (opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Averia robot de ordeño 2"
              className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
              Descripcion *
            </label>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe la incidencia con detalle"
              className="w-full resize-none rounded-[10px] border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
            />
          </div>

          {mutation.isError && (
            <p className="rounded-[10px] bg-state-critica/10 px-3 py-2 text-sm text-state-critica">
              {mutation.error.message}
            </p>
          )}

          <button
            type="button"
            disabled={!tipo || !descripcion.trim() || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                tipo,
                titulo: titulo.trim() || undefined,
                descripcion,
                prioridad,
                zona_id: zonaId || null,
              })
            }
            className="w-full rounded-[10px] bg-brand-dark py-3.5 font-heading text-base font-bold text-white shadow-brand transition hover:bg-sidebar-bg disabled:opacity-50"
          >
            {mutation.isPending ? "Registrando..." : "Registrar incidencia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Incident card ────────────────────────────────────────────────────────

function getNextStatuses(item: UnifiedIncident): UnifiedEstado[] {
  if (item.origen === "alerta") {
    if (item.estado === "abierta") return ["en_gestion", "resuelta"];
    if (item.estado === "en_gestion") return ["resuelta", "cerrada"];
    return [];
  }
  const machine: Partial<Record<UnifiedEstado, UnifiedEstado[]>> = {
    abierta: ["en_gestion", "resuelta"],
    en_gestion: ["resuelta"],
    resuelta: ["cerrada"],
  };
  return machine[item.estado] ?? [];
}

function UnifiedCard({
  item,
  onStatusChange,
  updatingId,
  animalLookup,
  zoneLookup,
}: {
  item: UnifiedIncident;
  onStatusChange: (item: UnifiedIncident, estado: UnifiedEstado, resolucion?: string) => void;
  updatingId: string | null;
  animalLookup: Map<string, string>;
  zoneLookup: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pendingResolutionFor, setPendingResolutionFor] = useState<UnifiedEstado | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const { can } = usePermissions();
  const isUpdating = updatingId === item.id;
  const available = getNextStatuses(item);
  const hasSeparateDescription =
    item.descripcion.trim().length > 0 &&
    item.descripcion.trim().toLowerCase() !== item.titulo.trim().toLowerCase();

  function handleStatusClick(next: UnifiedEstado) {
    // Para incidencias que se cierran/resuelven, ofrecemos capturar la resolución
    if (item.origen === "incidencia" && (next === "resuelta" || next === "cerrada")) {
      setPendingResolutionFor(next);
      return;
    }
    onStatusChange(item, next);
  }

  function confirmResolution() {
    if (!pendingResolutionFor) return;
    onStatusChange(item, pendingResolutionFor, resolutionText.trim() || undefined);
    setPendingResolutionFor(null);
    setResolutionText("");
  }

  const statusBtnStyle: Record<UnifiedEstado, string> = {
    en_gestion: "bg-state-atencion/15 text-state-atencion hover:bg-state-atencion/25",
    resuelta: "bg-state-ok/15 text-state-ok hover:bg-state-ok/25",
    cerrada: "bg-state-neutral/10 text-state-neutral hover:bg-state-neutral/20",
    abierta: "",
  };

  return (
    <div className="rounded-[10px] border border-app-border bg-white">
      <button
        type="button"
        className="w-full px-4 py-4 text-start"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge estado={item.estado} />
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${SEVERITY_STYLES[item.severidad]}`}>
                {item.severidad}
              </span>
              <span className="text-xs text-app-dim">{formatDate(item.fecha_creacion)}</span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug text-app-text">
              {item.titulo}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-app-dim" />
          ) : (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-app-dim" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-app-border px-4 py-4">
          {hasSeparateDescription && <p className="text-sm text-app-text">{item.descripcion}</p>}

          <div className="flex flex-wrap gap-4 text-xs text-app-dim">
            {item.zona_id && (
              <span>
                Zona:{" "}
                <span className="font-semibold text-app-text">
                  {zoneLookup.get(item.zona_id) ?? item.zona_id.slice(0, 8) + "\u2026"}
                </span>
              </span>
            )}
            {item.animal_id && (
              <span>
                Animal:{" "}
                <span className="font-mono font-bold text-brand">
                  {animalLookup.get(item.animal_id) ?? item.animal_id.slice(0, 8) + "\u2026"}
                </span>
              </span>
            )}
            {item.reportado_por && (
              <span>
                Reportado por:{" "}
                <span className="font-semibold text-app-text">{item.reportado_por.slice(0, 8)}\u2026</span>
              </span>
            )}
            {item.fecha_resolucion && (
              <span>
                Resuelto: <span className="text-app-text">{formatDate(item.fecha_resolucion)}</span>
              </span>
            )}
          </div>

          {item.recomendacion && (
            <div className="rounded-[10px] bg-brand/5 px-3 py-2 text-xs text-app-text">
              <span className="font-semibold">Recomendaci\u00f3n:</span> {item.recomendacion}
            </div>
          )}

          {item.resolucion && (
            <div className="rounded-[10px] bg-state-ok/5 px-3 py-2 text-xs text-app-text">
              <span className="font-semibold">Resoluci\u00f3n:</span> {item.resolucion}
            </div>
          )}

          {item.origen === "incidencia" && (
            <IncidentAttachments incidentId={item.rawId} canManage={can("manage_incidents")} />
          )}

          {pendingResolutionFor ? (
            <div className="space-y-2 rounded-[10px] border border-app-border bg-app-bg px-3 py-3">
              <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                Resoluci\u00f3n (opcional)
              </label>
              <textarea
                rows={2}
                autoFocus
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="\u00bfQu\u00e9 se hizo para resolverla?"
                className="w-full resize-none rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={confirmResolution}
                  className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${statusBtnStyle[pendingResolutionFor]}`}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirmar {STATUS_LABELS[pendingResolutionFor].toLowerCase()}
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    setPendingResolutionFor(null);
                    setResolutionText("");
                  }}
                  className="rounded-[10px] bg-state-neutral/10 px-3 py-2 text-xs font-bold text-state-neutral transition hover:bg-state-neutral/20 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            available.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {available.map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleStatusClick(next)}
                    className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${statusBtnStyle[next]}`}
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Marcar como {STATUS_LABELS[next].toLowerCase()}
                  </button>
                ))}
              </div>
            )
          )}

          {item.estado === "cerrada" && (
            <div className="rounded-[10px] bg-state-neutral/10 px-3 py-2 text-xs font-bold text-state-neutral">
              Registro cerrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

type FilterPrioridad = "baja" | "media" | "alta" | "critica" | "todas";

export default function IncidentsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [prioridadFilter, setPrioridadFilter] = useState<FilterPrioridad>("todas");
  const [showCreate, setShowCreate] = useState(() => searchParams.get("new") === "1");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: () => api.incidents({ limit: 200 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts-unified"],
    queryFn: () => api.alerts({ limit: 200 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const zonesQuery = useQuery({
    queryKey: ["zones"],
    queryFn: api.zones,
    staleTime: 5 * 60_000,
  });

  const animalsLookupQuery = useQuery({
    queryKey: ["animals-lookup"],
    queryFn: () => api.animals({ limit: 500 }),
    staleTime: 5 * 60_000,
  });

  const animalLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of animalsLookupQuery.data ?? []) {
      map.set(a.id, a.crotal_oficial + (a.nombre ? ` Â· ${a.nombre}` : ""));
    }
    return map;
  }, [animalsLookupQuery.data]);

  const zoneLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of zonesQuery.data ?? []) {
      map.set(z.id, displayZoneName(z.codigo, z.nombre) ?? z.nombre);
    }
    return map;
  }, [zonesQuery.data]);

  const createIncidentZones = useMemo(
    () => incidentZoneOptions(zonesQuery.data ?? []),
    [zonesQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: async ({
      item,
      estado,
      resolucion,
    }: {
      item: UnifiedIncident;
      estado: UnifiedEstado;
      resolucion?: string;
    }) => {
      if (item.origen === "alerta") {
        const alertEstado: AlertState =
          estado === "abierta" ? "pendiente"
          : estado === "en_gestion" ? "revisada"
          : estado === "resuelta" ? "resuelta"
          : "falsa_alarma";
        return api.reviewAlert(item.rawId, { estado: alertEstado });
      }
      return api.updateIncident(item.rawId, { estado, ...(resolucion ? { resolucion } : {}) });
    },
    onMutate: ({ item }) => setUpdatingId(item.id),
    onError: (err: Error) => {
      toast.error(err.message || "Error al actualizar");
    },
    onSettled: () => {
      setUpdatingId(null);
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["alerts-unified"] });
    },
  });

  const all = useMemo<UnifiedIncident[]>(() => {
    const items = [
      ...(incidentsQuery.data ?? []).map(normalizeIncident),
      ...(alertsQuery.data?.alertas ?? []).map(normalizeAlert),
    ];
    return items.sort((a, b) =>
      new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime()
    );
  }, [incidentsQuery.data, alertsQuery.data]);

  const isLoading = incidentsQuery.isLoading || alertsQuery.isLoading;
  const isError = incidentsQuery.isError || alertsQuery.isError;

  const stats = useMemo(() => ({
    total: all.length,
    abiertas: all.filter((i) => i.estado === "abierta").length,
    en_gestion: all.filter((i) => i.estado === "en_gestion").length,
    resueltas: all.filter((i) => i.estado === "resuelta" || i.estado === "cerrada").length,
    criticas: all.filter((i) => i.severidad === "critica").length,
    altas: all.filter((i) => i.severidad === "alta").length,
  }), [all]);

  return (
    <div className="min-h-full">
      {showCreate && (
        <CreateIncidentModal
          zones={createIncidentZones}
          onClose={() => setShowCreate(false)}
        />
      )}

      <PageHeader eyebrow="Seguimiento operativo" title="Incidencias" EyebrowIcon={AlertOctagon}>
        <div className="flex items-center gap-3">
          {incidentsQuery.isSuccess && alertsQuery.isSuccess && (
            <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">
              {all.length} registros
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-dark px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:bg-sidebar-bg"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </button>
        </div>
      </PageHeader>

      <div className="space-y-5 px-6 py-6 lg:px-8">
        {/* KPIs */}
        {incidentsQuery.isSuccess && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Total" value={stats.total} tone="default" />
            <KpiCard label="Abiertas" value={stats.abiertas} tone="critical" />
            <KpiCard label="En gestion" value={stats.en_gestion} tone="warning" />
            <KpiCard label="Resueltas" value={stats.resueltas} tone="success" />
            <KpiCard label="Criticas" value={stats.criticas} tone="critical" />
            <KpiCard label="Altas" value={stats.altas} tone="warning" />
          </div>
        )}

        {/* Filters — solo prioridad, el Kanban separa por estado */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">Prioridad:</span>
          <select
            value={prioridadFilter}
            onChange={(e) => setPrioridadFilter(e.target.value as FilterPrioridad)}
            className="rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm font-semibold text-app-text outline-none"
          >
            <option value="todas">Todas</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>

          {prioridadFilter !== "todas" && (
            <button
              type="button"
              onClick={() => setPrioridadFilter("todas")}
              className="rounded-[10px] border border-app-border bg-white px-3 py-2 text-sm font-semibold text-app-dim transition hover:text-app-text"
            >
              Quitar filtro
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-8 animate-pulse rounded-[10px] bg-app-bg" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-24 animate-pulse rounded-[10px] bg-app-bg" />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
            Error al cargar: {incidentsQuery.error?.message || alertsQuery.error?.message || "Error desconocido"}
          </div>
        )}

        {/* Kanban */}
        {!isLoading && !isError && (
          <div className="grid gap-4 xl:grid-cols-3">
            {(
              [
                {
                  key: "abiertas",
                  label: "Abiertas",
                  items: all.filter(
                    (i) =>
                      i.estado === "abierta" &&
                      (prioridadFilter === "todas" || i.severidad === prioridadFilter),
                  ),
                  headerCls: "border-state-critica/30 bg-state-critica/5",
                  dotCls: "bg-state-critica",
                  countCls: "bg-state-critica/15 text-state-critica",
                },
                {
                  key: "en_gestion",
                  label: "En gestión",
                  items: all.filter(
                    (i) =>
                      i.estado === "en_gestion" &&
                      (prioridadFilter === "todas" || i.severidad === prioridadFilter),
                  ),
                  headerCls: "border-state-atencion/30 bg-state-atencion/5",
                  dotCls: "bg-state-atencion",
                  countCls: "bg-state-atencion/15 text-state-atencion",
                },
                {
                  key: "resueltas",
                  label: "Resueltas",
                  items: all.filter(
                    (i) =>
                      (i.estado === "resuelta" || i.estado === "cerrada") &&
                      (prioridadFilter === "todas" || i.severidad === prioridadFilter),
                  ),
                  headerCls: "border-state-ok/30 bg-state-ok/5",
                  dotCls: "bg-state-ok",
                  countCls: "bg-state-ok/15 text-state-ok",
                },
              ] as const
            ).map((col) => (
              <div key={col.key} className="flex flex-col gap-3">
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-[10px] border px-4 py-3 ${col.headerCls}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dotCls}`} />
                    <span className="font-heading text-sm font-bold text-app-text">{col.label}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${col.countCls}`}>
                    {col.items.length}
                  </span>
                </div>

                {/* Cards */}
                {col.items.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-app-border bg-app-bg py-10 text-center text-sm text-app-dim">
                    Sin incidencias
                  </div>
                ) : (
                  col.items.map((item) => (
                    <UnifiedCard
                      key={item.id}
                      item={item}
                      onStatusChange={(item, estado, resolucion) =>
                        updateMutation.mutate({ item, estado, resolucion })
                      }
                      updatingId={updatingId}
                      animalLookup={animalLookup}
                      zoneLookup={zoneLookup}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
