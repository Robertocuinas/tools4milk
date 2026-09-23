"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Droplets,
  FlaskConical,
  GitFork,
  Pill,
  Plus,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateIncidentModal } from "@/components/incidents/CreateIncidentModal";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PanelCard, SectionTitle } from "@/components/ui/panel-card";
import { api } from "@/lib/api";
import i18n, { dateLocale, enumLabel } from "@/lib/i18n";
import { animalsApi } from "@/lib/api-animals";
import type { Alert, Animal, Incident, Lactation, Treatment } from "@/lib/types";
import type { AnimalWithGenealogy, GenealogyRelation, GenealogyRelative } from "@/lib/types-animals";
import { usePermissions } from "@/lib/use-permissions";

// ── Helpers ─────────────────────────────────────────────────────────────────

// Se llaman desde componentes que usan useTranslation, así que i18n.t y el
// idioma activo están sincronizados con el render.
function ageLabel(dateStr: string): string {
  const birth = new Date(dateStr);
  const months = Math.floor((Date.now() - birth.getTime()) / (30.44 * 24 * 3600 * 1000));
  if (months < 12) return i18n.t("animalDetail.age.months", { count: months });
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0
    ? i18n.t("animalDetail.age.yearsMonths", { years, months: rem })
    : i18n.t("animalDetail.age.years", { count: years });
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(dateLocale(i18n.language), { day: "2-digit", month: "short", year: "numeric" });
}

function formatNum(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return v.toLocaleString(dateLocale(i18n.language), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

// ── Status badges ────────────────────────────────────────────────────────────

const estadoStyles: Record<Animal["estado"], string> = {
  produccion: "bg-state-ok/10 text-state-ok border-state-ok/20",
  recria: "bg-state-info/10 text-state-info border-state-info/20",
  seca: "bg-state-atencion/10 text-state-atencion border-state-atencion/20",
  gestante: "bg-state-atencion/10 text-state-atencion border-state-atencion/20",
  baja: "bg-state-neutral/10 text-state-neutral border-state-neutral/20",
};

const sevBadge: Record<Alert["severidad"], string> = {
  critica: "bg-state-critica/10 text-state-critica",
  alta: "bg-state-atencion/10 text-state-atencion",
  media: "bg-state-info/10 text-state-info",
  baja: "bg-state-neutral/10 text-state-neutral",
};

// ── Section components ───────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 font-semibold text-app-dim">{label}</span>
      <span className="text-end text-app-text">{value ?? <span className="text-app-dim">—</span>}</span>
    </div>
  );
}

function LactationsPanel({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["animal-lactations", animalId],
    queryFn: () => api.lactations({ animal_id: animalId, limit: 20 }),
    staleTime: 60_000,
  });

  const items = q.data ?? [];

  return (
    <PanelCard>
      <div className="mb-4 flex items-center gap-2">
        <Droplets className="h-4 w-4 text-state-info" />
        <SectionTitle>{t("animalDetail.lactations.title", { count: items.length })}</SectionTitle>
      </div>

      {q.isError && (
        <p className="text-sm text-state-critica">{t("animalDetail.lactations.loadError")}</p>
      )}

      {q.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-[10px] bg-app-surface2" />
          ))}
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <p className="text-sm text-app-dim">{t("animalDetail.lactations.empty")}</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border text-start text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">
                <th className="pb-2 pe-4">{t("animalDetail.lactations.number")}</th>
                <th className="pb-2 pe-4">{t("animalDetail.lactations.calving")}</th>
                <th className="pb-2 pe-4">{t("animalDetail.lactations.dryOff")}</th>
                <th className="pb-2 pe-4">{t("animalDetail.lactations.avgProduction")}</th>
                <th className="pb-2 pe-4">{t("animalDetail.lactations.fat")}</th>
                <th className="pb-2 pe-4">{t("animalDetail.lactations.protein")}</th>
                <th className="pb-2">{t("animalDetail.lactations.scc")}</th>
                <th className="pb-2 ps-4">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {items.map((lac: Lactation) => (
                <tr key={lac.id} className="text-app-text">
                  <td className="py-2.5 pe-4 font-bold">{lac.numero_lactacion ?? "—"}</td>
                  <td className="py-2.5 pe-4 text-app-dim">{formatDate(lac.fecha_inicio)}</td>
                  <td className="py-2.5 pe-4 text-app-dim">{formatDate(lac.fecha_fin)}</td>
                  <td className="py-2.5 pe-4">{formatNum(lac.produccion_promedio)} L</td>
                  <td className="py-2.5 pe-4">{lac.grasa_promedio != null ? `${formatNum(lac.grasa_promedio, 2)}%` : "—"}</td>
                  <td className="py-2.5 pe-4">{lac.proteina_promedio != null ? `${formatNum(lac.proteina_promedio, 2)}%` : "—"}</td>
                  <td className="py-2.5">
                    {lac.rcs_promedio != null ? (
                      <span className={`text-xs font-semibold ${lac.rcs_promedio >= 400000 ? "text-state-critica" : lac.rcs_promedio >= 250000 ? "text-state-atencion" : "text-state-ok"}`}>
                        {(lac.rcs_promedio / 1000).toFixed(0)}k
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2.5 ps-4">
                    {lac.activa ? (
                      <span className="rounded-full bg-state-ok/10 px-2 py-0.5 text-[11px] font-bold text-state-ok">{t("animalDetail.lactations.active")}</span>
                    ) : (
                      <span className="rounded-full bg-state-neutral/10 px-2 py-0.5 text-[11px] font-bold text-state-neutral">{t("animalDetail.lactations.closed")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

function TreatmentsPanel({ animalId }: { animalId: string }) {
  const { t: tr } = useTranslation();
  const q = useQuery({
    queryKey: ["animal-treatments", animalId],
    queryFn: () => api.treatments({ animal_id: animalId, limit: 20 }),
    staleTime: 60_000,
  });

  const items = q.data ?? [];
  const active = items.filter((t: Treatment) => t.activo !== false);

  return (
    <PanelCard>
      <div className="mb-4 flex items-center gap-2">
        <Pill className="h-4 w-4 text-state-atencion" />
        <SectionTitle>{tr("animalDetail.treatments.title", { active: active.length, total: items.length })}</SectionTitle>
      </div>

      {q.isError && (
        <p className="text-sm text-state-critica">{tr("animalDetail.treatments.loadError")}</p>
      )}

      {q.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
          ))}
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <p className="text-sm text-app-dim">{tr("animalDetail.treatments.empty")}</p>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((t: Treatment) => (
            <div
              key={t.id}
              className={`rounded-[10px] border px-4 py-3 ${t.activo !== false ? "border-state-atencion/20 bg-state-atencion/5" : "border-app-border bg-app-bg"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-app-text">{t.medicamento ?? tr("animalDetail.treatments.fallbackName")}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-app-dim">
                    {t.dosis && <span>{tr("animalDetail.treatments.dose", { value: t.dosis })}</span>}
                    {t.via_administracion && <span>{tr("animalDetail.treatments.route", { value: t.via_administracion })}</span>}
                    {t.fecha_inicio && <span>{tr("animalDetail.treatments.from", { date: formatDate(t.fecha_inicio) })}</span>}
                    {t.fecha_fin && <span>{tr("animalDetail.treatments.to", { date: formatDate(t.fecha_fin) })}</span>}
                    {t.periodo_retirada_dias != null && (
                      <span className="font-semibold text-state-atencion">{tr("animalDetail.treatments.withdrawal", { days: t.periodo_retirada_dias })}</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.activo !== false ? "bg-state-atencion/10 text-state-atencion" : "bg-state-neutral/10 text-state-neutral"}`}>
                  {t.activo !== false ? tr("animalDetail.treatments.active") : tr("animalDetail.treatments.closed")}
                </span>
              </div>
              {t.observaciones && (
                <p className="mt-2 text-xs text-app-dim">{t.observaciones}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function AlertsPanel({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["animal-alerts", animalId],
    queryFn: () => api.animalAlerts(animalId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const alerts = q.data?.alertas ?? [];

  return (
    <PanelCard>
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-state-critica" />
        <SectionTitle>{t("animalDetail.alerts.title", { count: alerts.length })}</SectionTitle>
      </div>

      {q.isError && (
        <p className="text-sm text-state-critica">{t("animalDetail.alerts.loadError")}</p>
      )}

      {q.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-[10px] bg-app-surface2" />
          ))}
        </div>
      )}

      {!q.isLoading && alerts.length === 0 && (
        <p className="text-sm text-app-dim">{t("animalDetail.alerts.empty")}</p>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 10).map((alert: Alert) => (
            <div
              key={alert.id}
              className={`rounded-[10px] border-s-4 bg-white px-4 py-3 shadow-card ${
                alert.severidad === "critica" ? "border-s-state-critica"
                : alert.severidad === "alta" ? "border-s-state-atencion"
                : alert.severidad === "media" ? "border-s-state-info"
                : "border-s-app-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${sevBadge[alert.severidad]}`}>
                  {enumLabel("severity", alert.severidad)}
                </span>
                <span className="text-xs capitalize text-app-dim">{alert.tipo_alerta}</span>
                <span className="ms-auto text-xs text-app-dim">{formatDate(alert.fecha_creacion)}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-app-text">{alert.descripcion}</p>
              {alert.recomendacion && (
                <p className="mt-1 text-xs text-app-dim">{alert.recomendacion}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function IncidentsPanel({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["incidents-for-animal", animalId],
    queryFn: () => api.incidents({ animal_id: animalId, limit: 100 }),
    staleTime: 60_000,
  });

  const incidents = (q.data ?? []) as Incident[];

  if (!q.isLoading && incidents.length === 0 && !q.isError) return null;

  return (
    <PanelCard>
      <div className="mb-4 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-app-dim" />
        <SectionTitle>{t("animalDetail.incidents.title", { count: incidents.length })}</SectionTitle>
      </div>

      {q.isError && (
        <p className="text-sm text-state-critica">{t("animalDetail.incidents.loadError")}</p>
      )}

      {q.isLoading && (
        <div className="h-14 animate-pulse rounded-[10px] bg-app-surface2" />
      )}

      {incidents.length > 0 && (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <div key={inc.id} className="rounded-[10px] border border-app-border bg-app-bg px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs capitalize text-app-dim">{t(`incidents.types.${inc.tipo}`, { defaultValue: inc.tipo.replace(/_/g, " ") })}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  inc.prioridad === "critica" ? "bg-state-critica/10 text-state-critica"
                  : inc.prioridad === "alta" ? "bg-state-atencion/10 text-state-atencion"
                  : "bg-state-info/10 text-state-info"
                }`}>
                  {t(`incidents.priorities.${inc.prioridad}`, { defaultValue: inc.prioridad })}
                </span>
                <span className="ms-auto text-xs text-app-dim capitalize">{enumLabel("incidentStatus", inc.estado)}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-app-text">{inc.descripcion}</p>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// Orden de presentación: padres y después abuelos por línea materna/paterna.
const GENEALOGY_ORDER: GenealogyRelation[] = [
  "madre",
  "padre",
  "abuela_materna",
  "abuelo_materno",
  "abuela_paterna",
  "abuelo_paterno",
];

function GenealogyPanel({ animal, canEdit }: { animal: AnimalWithGenealogy; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [motherId, setMotherId] = useState(animal.madre_id ?? "");
  const [fatherId, setFatherId] = useState(animal.padre_id ?? "");
  const [fatherMode, setFatherMode] = useState<"registered" | "external">(
    animal.padre_id ? "registered" : "external",
  );
  const [externalFatherTag, setExternalFatherTag] = useState(animal.padre_crotal ?? "");
  const [externalFatherName, setExternalFatherName] = useState(animal.padre_nombre ?? "");

  const candidatesQ = useQuery({
    queryKey: ["animals", "genealogy-candidates"],
    queryFn: () => api.animals({ limit: 500 }),
    enabled: canEdit,
    staleTime: 5 * 60_000,
  });
  const q = useQuery({
    queryKey: ["animal-genealogy", animal.id],
    queryFn: () => animalsApi.genealogy(animal.id),
    staleTime: 5 * 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => animalsApi.updateGenealogy(animal.id, {
      madre_id: motherId || null,
      padre_id: fatherMode === "registered" ? fatherId || null : null,
      padre_crotal: fatherMode === "external" ? externalFatherTag.trim() || null : null,
      padre_nombre: fatherMode === "external" ? externalFatherName.trim() || null : null,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["animal", animal.id] });
      void queryClient.invalidateQueries({ queryKey: ["animal-genealogy", animal.id] });
      void queryClient.invalidateQueries({ queryKey: ["animals"] });
    },
  });

  const candidates = (candidatesQ.data ?? []).filter((candidate) => candidate.id !== animal.id);
  const mothers = candidates.filter((candidate) => candidate.sexo === "hembra");
  const fathers = candidates.filter((candidate) => candidate.sexo === "macho");

  const relatives = GENEALOGY_ORDER
    .map((rel) => q.data?.[rel] ?? null)
    .filter((r): r is GenealogyRelative => r !== null);

  return (
    <PanelCard>
      <div className="mb-4 flex items-center gap-2">
        <GitFork className="h-4 w-4 text-brand-dark" aria-hidden="true" />
        <SectionTitle>{t("animalDetail.genealogy.title")}</SectionTitle>
      </div>

      {canEdit && <form
        className="mb-5 rounded-[10px] border border-app-border bg-app-bg p-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <p className="text-sm font-semibold text-app-text">
          {t("animalDetail.genealogy.edit.title", { defaultValue: "Asignar progenitores" })}
        </p>
        <p className="mt-1 text-xs text-app-dim">
          {t("animalDetail.genealogy.edit.description", { defaultValue: "Seleccione animales registrados o indique un toro externo." })}
        </p>

        {candidatesQ.isError && (
          <p className="mt-3 text-sm text-state-critica" role="alert">
            {t("animalDetail.genealogy.edit.candidatesError", { defaultValue: "No se pudieron cargar los animales disponibles." })}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-app-text">
            {t("animalDetail.genealogy.edit.mother", { defaultValue: "Madre" })}
            <select
              value={motherId}
              onChange={(event) => setMotherId(event.target.value)}
              disabled={candidatesQ.isLoading || saveMutation.isPending}
              className="min-h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm font-normal text-app-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{t("animalDetail.genealogy.edit.none", { defaultValue: "Sin asignar" })}</option>
              {mothers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.crotal_oficial}{candidate.nombre ? ` · ${candidate.nombre}` : ""}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-app-text">
              {t("animalDetail.genealogy.edit.father", { defaultValue: "Padre" })}
            </legend>
            <div className="flex gap-3 text-xs text-app-dim">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={fatherMode === "registered"} onChange={() => setFatherMode("registered")} disabled={saveMutation.isPending} />
                {t("animalDetail.genealogy.edit.registered", { defaultValue: "Registrado" })}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={fatherMode === "external"} onChange={() => setFatherMode("external")} disabled={saveMutation.isPending} />
                {t("animalDetail.genealogy.edit.external", { defaultValue: "Externo" })}
              </label>
            </div>
            {fatherMode === "registered" ? (
              <select
                value={fatherId}
                onChange={(event) => setFatherId(event.target.value)}
                disabled={candidatesQ.isLoading || saveMutation.isPending}
                className="min-h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm font-normal text-app-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{t("animalDetail.genealogy.edit.none", { defaultValue: "Sin asignar" })}</option>
                {fathers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.crotal_oficial}{candidate.nombre ? ` · ${candidate.nombre}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-2">
                <input
                  value={externalFatherTag}
                  onChange={(event) => setExternalFatherTag(event.target.value)}
                  maxLength={40}
                  disabled={saveMutation.isPending}
                  placeholder={t("animalDetail.genealogy.edit.externalTag", { defaultValue: "Crotal del toro" })}
                  aria-label={t("animalDetail.genealogy.edit.externalTag", { defaultValue: "Crotal del toro" })}
                  className="min-h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text disabled:cursor-not-allowed disabled:opacity-60"
                />
                <input
                  value={externalFatherName}
                  onChange={(event) => setExternalFatherName(event.target.value)}
                  maxLength={120}
                  disabled={saveMutation.isPending}
                  placeholder={t("animalDetail.genealogy.edit.externalName", { defaultValue: "Nombre del toro" })}
                  aria-label={t("animalDetail.genealogy.edit.externalName", { defaultValue: "Nombre del toro" })}
                  className="min-h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            )}
          </fieldset>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-[10px] bg-brand-dark px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {saveMutation.isPending
              ? t("animalDetail.genealogy.edit.saving", { defaultValue: "Guardando…" })
              : t("animalDetail.genealogy.edit.save", { defaultValue: "Guardar progenitores" })}
          </button>
          <p aria-live="polite" className="text-sm">
            {saveMutation.isSuccess && <span className="text-state-ok">{t("animalDetail.genealogy.edit.success", { defaultValue: "Progenitores actualizados." })}</span>}
            {saveMutation.isError && <span className="text-state-critica" role="alert">{t("animalDetail.genealogy.edit.saveError", { defaultValue: "No se pudieron guardar los cambios." })}</span>}
          </p>
        </div>
      </form>}

      {q.isError && (
        <p className="text-sm text-state-critica">{t("animalDetail.genealogy.loadError")}</p>
      )}

      {q.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[10px] bg-app-surface2" />
          ))}
        </div>
      )}

      {q.isSuccess && relatives.length === 0 && (
        <p className="text-sm text-app-dim">{t("animalDetail.genealogy.empty")}</p>
      )}

      {relatives.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {relatives.map((r) => {
            const relationLabel = t(`animalDetail.genealogy.relations.${r.relacion}`);
            return (
              <li
                key={r.relacion}
                className="flex items-start justify-between gap-3 rounded-[10px] border border-app-border bg-app-bg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">
                    {relationLabel}
                  </p>
                  <p className="mt-0.5 truncate font-semibold text-app-text">
                    {r.nombre ?? <span className="text-app-dim">{t("animalDetail.genealogy.noName")}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-app-dim">
                    <span className="font-semibold">{t("animalDetail.genealogy.code")}:</span>{" "}
                    {r.crotal ? <span className="font-mono text-brand-dark">{r.crotal}</span> : "—"}
                  </p>
                </div>
                {r.registrado && r.id ? (
                  <Link
                    href={`/animals/${r.id}`}
                    aria-label={t("animalDetail.genealogy.viewAnimalOf", { relation: relationLabel })}
                    className="shrink-0 rounded-[10px] border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-dim transition hover:border-brand/30 hover:text-brand"
                  >
                    {t("animalDetail.genealogy.viewAnimal")}
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full bg-state-neutral/10 px-2 py-0.5 text-[11px] font-bold text-state-neutral">
                    {t("animalDetail.genealogy.external")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [showCreateIncident, setShowCreateIncident] = useState(false);

  const animalQ = useQuery({
    queryKey: ["animal", id],
    queryFn: () => api.animal(id),
    staleTime: 60_000,
  });

  const alertsCountQ = useQuery({
    queryKey: ["animal-alerts", id],
    queryFn: () => api.animalAlerts(id),
    staleTime: 30_000,
  });

  const treatmentsCountQ = useQuery({
    queryKey: ["animal-treatments", id],
    queryFn: () => api.treatments({ animal_id: id, limit: 50 }),
    staleTime: 60_000,
  });

  const lactationsCountQ = useQuery({
    queryKey: ["animal-lactations", id],
    queryFn: () => api.lactations({ animal_id: id, limit: 20 }),
    staleTime: 60_000,
  });

  const canCreateIncident = can("create_incident");
  // Mismo queryKey que /incidents para compartir caché; solo se pide si el
  // usuario puede crear incidencias (lo necesita el selector de zona).
  const zonesQ = useQuery({
    queryKey: ["zones"],
    queryFn: api.zones,
    staleTime: 5 * 60_000,
    enabled: canCreateIncident,
  });

  const animal = animalQ.data;

  if (animalQ.isLoading) {
    return (
      <div className="min-h-full">
        <div className="border-b border-app-border bg-white px-6 py-5 lg:px-8">
          <div className="h-8 w-48 animate-pulse rounded-[10px] bg-app-surface2" />
        </div>
        <div className="space-y-5 px-6 py-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] bg-app-surface2" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (animalQ.isError || !animal) {
    return (
      <div className="min-h-full px-6 py-12 lg:px-8">
        <EmptyState
          Icon={FlaskConical}
          title={t("animalDetail.notFound.title")}
          description={t("animalDetail.notFound.description")}
          action={
            <Link href="/animals" className="rounded-[10px] border border-app-border bg-white px-4 py-2 text-sm font-semibold text-brand-dark">
              <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("animalDetail.notFound.back")}
            </Link>
          }
        />
      </div>
    );
  }

  const pendingAlerts = (alertsCountQ.data?.alertas ?? []).filter(a => a.estado === "pendiente").length;
  const activeTreatments = (treatmentsCountQ.data ?? []).filter(t => t.activo !== false).length;
  const lactations = lactationsCountQ.data ?? [];
  const activeLactation = lactations.find(l => l.activa);
  const reproductiveLabel = animal.estado_reproductivo
    ? t(`animals.reproductiveStatus.${animal.estado_reproductivo}`, {
        defaultValue: animal.estado_reproductivo.replace(/_/g, " "),
      })
    : null;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-app-border bg-white px-6 py-5 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-app-dim">
              <Link href="/animals" className="flex items-center gap-1 hover:text-brand">
                <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                {t("nav.animals")}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-bold text-app-text">
                <span className="font-mono text-brand-dark">{animal.crotal_oficial}</span>
                {animal.nombre && <span className="ms-2 text-app-dim">· {animal.nombre}</span>}
              </h1>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${estadoStyles[animal.estado]}`}>
                {enumLabel("animalStatus", animal.estado)}
              </span>
              {animal.estado_reproductivo && (
                <span className="rounded-full bg-app-surface2 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-app-dim">
                  {reproductiveLabel}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/predictions?animal=${id}`}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-dim transition hover:border-brand/30 hover:text-brand"
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              {t("animalDetail.prediction")}
            </Link>
            {canCreateIncident && (
              <button
                type="button"
                onClick={() => setShowCreateIncident(true)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-dark px-3 py-2 text-xs font-bold text-white shadow-brand transition hover:bg-sidebar-bg"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t("animalDetail.createIncident")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6 lg:px-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            label={t("animalDetail.kpi.age")}
            value={ageLabel(animal.fecha_nacimiento)}
            sublabel={animal.raza ?? t("animalDetail.kpi.unknownBreed")}
          />
          <KpiCard
            label={t("animalDetail.kpi.lactations")}
            value={lactations.length}
            sublabel={activeLactation ? t("animalDetail.kpi.activeLactation", { number: activeLactation.numero_lactacion ?? "?" }) : t("animalDetail.kpi.noActiveLactation")}
            tone={activeLactation ? "success" : "muted"}
          />
          <KpiCard
            label={t("animalDetail.kpi.treatments")}
            value={activeTreatments}
            sublabel={t("animalDetail.kpi.activeNow")}
            tone={activeTreatments > 0 ? "warning" : "success"}
          />
          <KpiCard
            label={t("animalDetail.kpi.alerts")}
            value={pendingAlerts}
            sublabel={t("animalDetail.kpi.pending")}
            tone={pendingAlerts > 0 ? "critical" : "success"}
          />
        </div>

        {/* Basic info + Reproductive state */}
        <div className="grid gap-5 lg:grid-cols-2">
          <PanelCard>
            <SectionTitle className="mb-3">{t("animalDetail.info.title")}</SectionTitle>
            <div className="divide-y divide-app-border">
              <InfoRow label={t("animalDetail.info.officialTag")} value={<span className="font-mono font-bold text-brand-dark">{animal.crotal_oficial}</span>} />
              <InfoRow label={t("animalDetail.info.name")} value={animal.nombre} />
              <InfoRow label={t("animalDetail.info.sex")} value={<span className="capitalize">{t(`animals.sex.${animal.sexo}`, { defaultValue: animal.sexo })}</span>} />
              <InfoRow label={t("animalDetail.info.breed")} value={animal.raza} />
              <InfoRow label={t("animalDetail.info.birth")} value={formatDate(animal.fecha_nacimiento)} />
              <InfoRow label={t("animalDetail.info.entryDate")} value={formatDate(animal.fecha_entrada)} />
              {animal.fecha_baja && (
                <InfoRow label={t("animalDetail.info.exitDate")} value={
                  <span className="font-semibold text-state-neutral">{formatDate(animal.fecha_baja)}</span>
                } />
              )}
              {animal.motivo_baja && (
                <InfoRow label={t("animalDetail.info.exitReason")} value={animal.motivo_baja} />
              )}
              {animal.notas && (
                <InfoRow label={t("animalDetail.info.notes")} value={animal.notas} />
              )}
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle className="mb-3">{t("animalDetail.production.title")}</SectionTitle>
            <div className="divide-y divide-app-border">
              <InfoRow
                label={t("common.status")}
                value={
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${estadoStyles[animal.estado]}`}>
                    {enumLabel("animalStatus", animal.estado)}
                  </span>
                }
              />
              <InfoRow
                label={t("animalDetail.production.reproductiveStatus")}
                value={animal.estado_reproductivo
                  ? <span className="capitalize">{reproductiveLabel}</span>
                  : null}
              />
              {activeLactation && (
                <>
                  <InfoRow label={t("animalDetail.production.activeLactation")} value={t("animalDetail.production.activeLactationValue", { number: activeLactation.numero_lactacion ?? "?" })} />
                  <InfoRow label={t("animalDetail.production.avgProduction")} value={activeLactation.produccion_promedio != null ? t("animalDetail.production.litersPerDay", { value: formatNum(activeLactation.produccion_promedio) }) : null} />
                  <InfoRow label={t("animalDetail.production.fat")} value={activeLactation.grasa_promedio != null ? `${formatNum(activeLactation.grasa_promedio, 2)}%` : null} />
                  <InfoRow label={t("animalDetail.production.protein")} value={activeLactation.proteina_promedio != null ? `${formatNum(activeLactation.proteina_promedio, 2)}%` : null} />
                  <InfoRow
                    label={t("animalDetail.production.scc")}
                    value={activeLactation.rcs_promedio != null ? (
                      <span className={activeLactation.rcs_promedio >= 400000 ? "font-bold text-state-critica" : activeLactation.rcs_promedio >= 250000 ? "font-semibold text-state-atencion" : "text-state-ok"}>
                        {t("animalDetail.production.sccValue", { value: (activeLactation.rcs_promedio / 1000).toFixed(0) })}
                      </span>
                    ) : null}
                  />
                </>
              )}

              <div className="pt-4">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/quality"
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-dim hover:border-brand/30 hover:text-brand"
                  >
                    <Droplets className="h-3.5 w-3.5" />
                    {t("animalDetail.production.viewQuality")}
                  </Link>
                  <Link
                    href="/predictions"
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-dim hover:border-brand/30 hover:text-brand"
                  >
                    <BrainCircuit className="h-3.5 w-3.5" />
                    {t("animalDetail.production.viewPrediction")}
                  </Link>
                </div>
              </div>
            </div>
          </PanelCard>
        </div>

        {/* Genealogía */}
        <GenealogyPanel key={animal.id} animal={animal as AnimalWithGenealogy} canEdit={can("manage_animals")} />

        {/* Lactations */}
        <LactationsPanel animalId={id} />

        {/* Treatments */}
        <TreatmentsPanel animalId={id} />

        {/* Alerts */}
        <AlertsPanel animalId={id} />

        {/* Incidents (only shows if there are any for this animal) */}
        <IncidentsPanel animalId={id} />
      </div>

      {showCreateIncident && (
        <CreateIncidentModal
          zones={(zonesQ.data ?? []).map((z) => ({ id: z.id, nombre: z.nombre }))}
          animal={{ id: animal.id, crotal_oficial: animal.crotal_oficial, nombre: animal.nombre }}
          defaultZonaId={animal.zona_id}
          defaultTipo="sanidad_animal"
          onClose={() => setShowCreateIncident(false)}
        />
      )}
    </div>
  );
}
