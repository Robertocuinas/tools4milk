"use client";

// Recomendacion de trabajadores al asignar una tarea (T-A04).
// La recomendacion es SOLO una ayuda: ordena la lista y marca el mejor
// candidato, pero nunca impide elegir a otra persona. Si el endpoint falla,
// se vuelve a la lista de empleados de siempre sin romper la pantalla.

import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { recommendedEmployees } from "@/lib/api-matching";
import type { Employee } from "@/lib/types";
import type {
  EmployeeCandidate,
  EmployeeRecommendationQuery,
  RecommendationReason,
} from "@/lib/types-matching";

export type RankedEmployee = {
  employee: Employee;
  candidate?: EmployeeCandidate;
};

export type RecommendationStatus = "loading" | "ready" | "fallback";

/**
 * Pide al backend la lista ordenada para la tarea seleccionada y la cruza
 * con la lista de empleados que ya tiene la pantalla. La clave de la query
 * incluye la tarea, zona y fecha: al cambiar la tarea cambia la recomendacion.
 */
export function useWorkerRecommendations(
  query: EmployeeRecommendationQuery,
  employees: Employee[],
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const recommendation = useQuery({
    queryKey: [
      "employee-recommendations",
      query.catalogoId ?? null,
      query.zonaId ?? null,
      query.tsPlanificada ?? null,
      query.taskId ?? null,
    ],
    queryFn: () => recommendedEmployees(query),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });

  return useMemo(() => {
    const candidates = recommendation.data?.candidates;
    if (!enabled || !candidates) {
      const status: RecommendationStatus = enabled && recommendation.isPending ? "loading" : "fallback";
      return {
        ranked: employees.map((employee) => ({ employee })) as RankedEmployee[],
        recommended: null as RankedEmployee | null,
        status,
      };
    }
    const byId = new Map(employees.map((e) => [e.id, e]));
    const seen = new Set<string>();
    const ranked: RankedEmployee[] = [];
    for (const candidate of candidates) {
      const employee = byId.get(candidate.empleado_id);
      if (!employee) continue;
      seen.add(employee.id);
      ranked.push({ employee, candidate });
    }
    // Empleados que la pantalla conoce pero el backend no puntua (p.ej.
    // inactivos): se conservan al final, en su orden original.
    for (const employee of employees) {
      if (!seen.has(employee.id)) ranked.push({ employee });
    }
    const first = ranked[0];
    const recommended = first?.candidate?.is_recommended ? first : null;
    return { ranked, recommended, status: "ready" as RecommendationStatus };
  }, [recommendation.data, recommendation.isPending, employees, enabled]);
}

// ── Explicacion de motivos ─────────────────────────────────────────────────

function roleLabel(t: TFunction, role?: string | null) {
  if (!role) return "—";
  return t(`leanfarming.recommendation.roles.${role}`, { defaultValue: role });
}

function shiftLabel(t: TFunction, shift?: string | null) {
  if (shift === "manana") return t("shifts.typeMorning");
  if (shift === "tarde") return t("shifts.typeAfternoon");
  if (shift === "noche") return t("shifts.typeNight");
  return shift ?? "";
}

function reasonText(t: TFunction, reason: RecommendationReason): string {
  switch (reason.code) {
    case "qualification":
      return t("leanfarming.recommendation.reasons.qualification", { value: reason.value ?? "" });
    case "role":
      return t("leanfarming.recommendation.reasons.role", { role: roleLabel(t, reason.value) });
    case "experience":
      return t("leanfarming.recommendation.reasons.experience", { count: reason.count ?? 0 });
    case "zone":
      return t("leanfarming.recommendation.reasons.zone");
    case "on_shift":
      return t("leanfarming.recommendation.reasons.onShift", { shift: shiftLabel(t, reason.value) });
    case "workload":
      return t("leanfarming.recommendation.reasons.workload", { count: reason.count ?? 0 });
    case "missing_qualification":
      return t("leanfarming.recommendation.reasons.missingQualification", { value: reason.value ?? "" });
    default:
      return "";
  }
}

function joinList(items: string[], language: string) {
  try {
    return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** Resumen breve: "Recomendado por capacitacion en VMS y experiencia (23 veces)". */
export function useReasonSummary(candidate?: EmployeeCandidate, maxPositive = 2) {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    if (!candidate) return { positive: "", notes: "" };
    const positives = candidate.reasons
      .filter((r) => r.points > 0)
      .slice(0, maxPositive)
      .map((r) => reasonText(t, r));
    const notes = candidate.reasons
      .filter((r) => r.code === "workload" || r.code === "missing_qualification")
      .map((r) => reasonText(t, r));
    const language = i18n.resolvedLanguage ?? i18n.language ?? "es";
    return {
      positive: positives.length ? joinList(positives, language) : "",
      notes: notes.join(" · "),
    };
  }, [candidate, maxPositive, t, i18n.resolvedLanguage, i18n.language]);
}

export function RecommendedBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-brand-dark">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {t("leanfarming.recommendation.badge")}
    </span>
  );
}

function ReasonLine({ candidate, recommended }: { candidate?: EmployeeCandidate; recommended: boolean }) {
  const { t } = useTranslation();
  const { positive, notes } = useReasonSummary(candidate);
  if (!positive && !notes) return null;
  return (
    <span className="mt-1 block text-xs leading-snug text-app-dim">
      {positive && (
        <span className={recommended ? "font-semibold text-app-text" : undefined}>
          {recommended ? t("leanfarming.recommendation.recommendedBecause", { reasons: positive }) : positive}
        </span>
      )}
      {positive && notes && " · "}
      {notes && <span>{notes}</span>}
    </span>
  );
}

// ── Lista seleccionable (radio group nativo: teclado y lector de pantalla) ──

type WorkerRecommendationListProps = {
  name: string;
  labelledBy: string;
  ranked: RankedEmployee[];
  status: RecommendationStatus;
  selectedId: string | null;
  onSelect: (employeeId: string) => void;
  /** Nota informativa por empleado (no bloquea la seleccion). */
  note?: (employee: Employee) => string | undefined;
};

export function WorkerRecommendationList({
  name,
  labelledBy,
  ranked,
  status,
  selectedId,
  onSelect,
  note,
}: WorkerRecommendationListProps) {
  const { t } = useTranslation();
  return (
    <div>
      {status === "loading" && (
        <p className="mb-2 text-xs text-app-dim" role="status">
          {t("leanfarming.recommendation.loading")}
        </p>
      )}
      {status === "fallback" && (
        <p className="mb-2 text-xs text-app-dim" role="status">
          {t("leanfarming.recommendation.unavailable")}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={labelledBy} className="max-h-64 space-y-2 overflow-y-auto">
        {ranked.map(({ employee, candidate }) => {
          const recommended = !!candidate?.is_recommended;
          const checked = selectedId === employee.id;
          const extra = note?.(employee);
          return (
            <label
              key={employee.id}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-[10px] border p-3 text-start transition focus-within:ring-2 focus-within:ring-brand/40 ${
                checked
                  ? "border-brand bg-brand/10"
                  : recommended
                    ? "border-brand/50 bg-white hover:border-brand"
                    : "border-app-border bg-white hover:border-app-border/70"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={employee.id}
                checked={checked}
                onChange={() => onSelect(employee.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-app-text">
                    {employee.nombre} {employee.apellidos ?? ""}
                  </span>
                  {recommended && <RecommendedBadge />}
                </span>
                <span className="block text-xs text-app-dim">{roleLabel(t, employee.role)}</span>
                <ReasonLine candidate={candidate} recommended={recommended} />
                {extra && <span className="mt-1 block text-[11px] font-bold text-state-atencion">{extra}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pista compacta para formularios con <select> nativo (que no admite
 * insignias): muestra el recomendado, su motivo y un boton para aplicarlo.
 */
export function RecommendationHint({
  recommended,
  selectedId,
  onApply,
}: {
  recommended: RankedEmployee | null;
  selectedId: string;
  onApply: (employeeId: string) => void;
}) {
  const { t } = useTranslation();
  const { positive } = useReasonSummary(recommended?.candidate);
  if (!recommended) return null;
  const { employee } = recommended;
  const isSelected = selectedId === employee.id;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-brand/30 bg-brand/5 px-3 py-2 text-xs" role="status">
      <RecommendedBadge />
      <span className="min-w-0 flex-1 text-app-text">
        <span className="font-semibold">{employee.nombre} {employee.apellidos ?? ""}</span>
        {positive && (
          <span className="block text-app-dim">
            {t("leanfarming.recommendation.recommendedBecause", { reasons: positive })}
          </span>
        )}
      </span>
      {!isSelected && (
        <button
          type="button"
          onClick={() => onApply(employee.id)}
          className="rounded-[8px] border border-brand px-2 py-1 font-bold text-brand-dark transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {t("leanfarming.recommendation.apply")}
        </button>
      )}
    </div>
  );
}
