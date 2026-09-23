"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PawPrint, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { VoiceToTextButton } from "@/components/ui/voice-to-text-button";
import { api } from "@/lib/api";
import { extractionApi } from "@/lib/api-extraction";
import type { CreateIncidentPayload, Incident, IncidentPriority } from "@/lib/types";
import type { Suggestion } from "@/lib/types-extraction";

// Formulario de alta de incidencia compartido por /incidents y la ficha de
// animal (antes vivía dentro de incidents/page.tsx). Con `animal` el animal
// va preseleccionado y en solo lectura, y la incidencia se crea con su
// animal_id.

export const INCIDENT_TYPES = [
  "averia_maquinaria",
  "infraestructura",
  "sanidad_animal",
  "calidad_leche",
  "alimentacion",
  "pedidos",
] as const;

const PRIORITIES: { value: IncidentPriority; cls: string }[] = [
  { value: "critica", cls: "border-state-critica text-state-critica bg-state-critica/10" },
  { value: "alta", cls: "border-state-atencion text-state-atencion bg-state-atencion/10" },
  { value: "media", cls: "border-state-info text-state-info bg-state-info/10" },
  { value: "baja", cls: "border-app-dim text-app-dim bg-app-bg" },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type CreateIncidentAnimal = {
  id: string;
  crotal_oficial: string;
  nombre?: string | null;
};

type CreateIncidentModalProps = {
  zones: { id: string; nombre: string }[];
  onClose: () => void;
  /** Animal preseleccionado (solo lectura). */
  animal?: CreateIncidentAnimal;
  defaultZonaId?: string | null;
  defaultTipo?: string;
  onCreated?: (incident: Incident) => void;
};

export function CreateIncidentModal({
  zones,
  onClose,
  animal,
  defaultZonaId,
  defaultTipo,
  onCreated,
}: CreateIncidentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const [tipo, setTipo] = useState<string>(defaultTipo ?? INCIDENT_TYPES[0]);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<IncidentPriority>("media");
  // La zona por defecto solo se usa si existe entre las opciones.
  const [zonaId, setZonaId] = useState(() =>
    defaultZonaId && zones.some((z) => z.id === defaultZonaId) ? defaultZonaId : "",
  );
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "extracting" | "review" | "error">("idle");

  const extractionMutation = useMutation({
    mutationFn: (text: string) => extractionApi.suggest("incidencia", text),
    onSuccess: (response) => {
      const incident = response.incidencia;
      setVoiceStatus("review");
      if (!incident) return;

      const highConfidenceValue = (suggestion: Suggestion<string>) =>
        suggestion.confidence === "alta" && suggestion.value?.trim()
          ? suggestion.value.trim()
          : null;
      const suggestedZoneId = highConfidenceValue(incident.zona_id);
      const suggestedType = highConfidenceValue(incident.tipo);
      const suggestedPriority = highConfidenceValue(incident.prioridad);
      const suggestedTitle = highConfidenceValue(incident.titulo);

      // Las sugerencias ambiguas o ajenas a las opciones del formulario no se
      // seleccionan: la persona responsable las revisa o completa a mano.
      // Una zona de contexto (por ejemplo, al abrir desde su ficha) prevalece
      // sobre el dictado para no perder la preselección de origen.
      if (
        !(defaultZonaId && zones.some((zone) => zone.id === defaultZonaId))
        && suggestedZoneId
        && zones.some((zone) => zone.id === suggestedZoneId)
      ) {
        setZonaId(suggestedZoneId);
      }
      if (suggestedType && INCIDENT_TYPES.includes(suggestedType as (typeof INCIDENT_TYPES)[number])) {
        setTipo(suggestedType);
      }
      if (suggestedPriority && PRIORITIES.some(({ value }) => value === suggestedPriority)) {
        setPrioridad(suggestedPriority as IncidentPriority);
      }
      if (suggestedTitle) setTitulo(suggestedTitle.slice(0, 200));
    },
    onError: () => setVoiceStatus("error"),
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateIncidentPayload) => api.createIncident(payload),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      if (animal) {
        queryClient.invalidateQueries({ queryKey: ["incidents-for-animal", animal.id] });
      }
      toast.success(t("incidents.createModal.toastCreated"));
      onCreated?.(incident);
      onClose();
    },
  });

  // Accesibilidad: foco inicial, Escape para cerrar, foco atrapado dentro
  // del diálogo y devolución del foco al elemento que lo abrió.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  const canSubmit = Boolean(tipo) && descripcion.trim().length > 0 && !mutation.isPending;
  const labelCls = "mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim";
  const fieldCls =
    "h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand";

  function submit() {
    if (!canSubmit) return;
    mutation.mutate({
      tipo,
      titulo: titulo.trim() || undefined,
      descripcion,
      prioridad,
      zona_id: zonaId || null,
      ...(animal ? { animal_id: animal.id } : {}),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[20px] border border-app-border bg-white shadow-panel sm:rounded-[14px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-app-border px-5 py-4 sm:px-6">
          <h2 id={`${uid}-title`} className="font-heading text-lg font-bold text-app-text">
            {t("incidents.createModal.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-[8px] p-1 text-app-dim hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form
          className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Animal preseleccionado (solo lectura) */}
          {animal && (
            <div
              className="flex items-center gap-2 rounded-[10px] border border-brand/20 bg-brand/5 px-3 py-2.5 text-sm"
              aria-label={t("incidents.createModal.animalReadonly")}
            >
              <PawPrint className="h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
              <span className="font-semibold text-app-dim">{t("incidents.createModal.animal")}:</span>
              <span className="min-w-0 truncate font-bold text-app-text">
                <span className="font-mono text-brand-dark">{animal.crotal_oficial}</span>
                {animal.nombre ? ` - ${animal.nombre}` : ""}
              </span>
            </div>
          )}

          {/* Prioridad */}
          <fieldset>
            <legend className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
              {t("incidents.createModal.priority")}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRIORITIES.map(({ value, cls }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={prioridad === value}
                  onClick={() => setPrioridad(value)}
                  className={`rounded-[10px] border-2 py-2 text-xs font-bold transition ${prioridad === value ? cls : "border-app-border text-app-dim hover:border-app-dim"}`}
                >
                  {t(`incidents.priorities.${value}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Tipo */}
          <div>
            <label htmlFor={`${uid}-tipo`} className={labelCls}>
              {t("incidents.createModal.type")}
            </label>
            <select
              id={`${uid}-tipo`}
              ref={firstFieldRef}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={fieldCls}
            >
              {INCIDENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`incidents.types.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Zona (opcional) */}
          <div>
            <label htmlFor={`${uid}-zona`} className={labelCls}>
              {t("incidents.createModal.zoneOptional")}
            </label>
            <select
              id={`${uid}-zona`}
              value={zonaId}
              onChange={(e) => setZonaId(e.target.value)}
              className={fieldCls}
            >
              <option value="">{t("incidents.createModal.noZone")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.nombre}</option>
              ))}
            </select>
          </div>

          {/* Título (opcional) */}
          <div>
            <label htmlFor={`${uid}-titulo`} className={labelCls}>
              {t("incidents.createModal.titleOptional")}
            </label>
            <input
              id={`${uid}-titulo`}
              type="text"
              maxLength={200}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t("incidents.createModal.titlePlaceholder")}
              className={`${fieldCls} placeholder:text-app-dim`}
            />
          </div>

          {/* Descripción */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={`${uid}-descripcion`} className="block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("incidents.createModal.description")} *
              </label>
              <VoiceToTextButton
                disabled={extractionMutation.isPending || mutation.isPending}
                onTranscribed={(text) => {
                  // Se conserva siempre la transcripción original, editable
                  // incluso cuando el servicio no devuelve una sugerencia.
                  setDescripcion((previous) => (previous ? `${previous} ${text}` : text));
                  setVoiceStatus("extracting");
                  extractionMutation.mutate(text);
                }}
              />
            </div>
            <textarea
              id={`${uid}-descripcion`}
              rows={3}
              required
              aria-required="true"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={t("incidents.createModal.descriptionPlaceholder")}
              className="w-full resize-none rounded-[10px] border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
            />
            {voiceStatus === "extracting" && (
              <p role="status" className="mt-2 text-xs font-semibold text-app-dim">
                {t("incidents.createModal.voice.extracting", { defaultValue: "Analizando el dictado…" })}
              </p>
            )}
            {voiceStatus === "review" && (
              <p role="status" className="mt-2 rounded-[8px] bg-state-info/10 px-3 py-2 text-xs font-semibold text-state-info">
                {t("incidents.createModal.voice.reviewRequired", { defaultValue: "Revisa los campos sugeridos antes de registrar la incidencia." })}
              </p>
            )}
            {voiceStatus === "error" && (
              <p role="alert" className="mt-2 text-xs font-semibold text-state-critica">
                {t("incidents.createModal.voice.extractionError", { defaultValue: "No se pudieron analizar las sugerencias de voz. Puedes completar el formulario manualmente." })}
              </p>
            )}
          </div>

          {mutation.isError && (
            <p role="alert" className="rounded-[10px] bg-state-critica/10 px-3 py-2 text-sm text-state-critica">
              {mutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-[10px] bg-brand-dark py-3.5 font-heading text-base font-bold text-white shadow-brand transition hover:bg-sidebar-bg disabled:opacity-50"
          >
            {mutation.isPending ? t("incidents.createModal.submitting") : t("incidents.createModal.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
