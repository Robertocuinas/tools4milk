"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Minus, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RiskLevel } from "@/lib/types";

export type BadgeTone = "ok" | "warning" | "critical" | "neutral";

// Texto en tono oscuro (red-700 / amber-800 / green-800) para contraste AA
// sobre el fondo claro; el color de estado va en borde, fondo e icono.
const toneStyle: Record<BadgeTone, string> = {
  ok: "border-state-ok/40 bg-state-ok/10 text-green-800",
  warning: "border-state-atencion/40 bg-state-atencion/10 text-amber-800",
  critical: "border-state-critica/40 bg-state-critica/10 text-red-700",
  neutral: "border-app-border bg-app-bg text-app-dim",
};

const toneIcon: Record<BadgeTone, LucideIcon> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
  neutral: Minus,
};

type StatusBadgeProps = {
  tone: BadgeTone;
  label: string;
  Icon?: LucideIcon;
  title?: string;
  /** Texto extra solo para lectores de pantalla (p. ej. el significado de un numero). */
  srLabel?: string;
};

/** Insignia de estado: color + texto + icono (nunca solo color). */
export function StatusBadge({ tone, label, Icon = toneIcon[tone], title, srLabel }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${toneStyle[tone]}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {label}
      {srLabel && <span className="sr-only">{`, ${srLabel}`}</span>}
    </span>
  );
}

const riskTone: Record<RiskLevel, BadgeTone> = {
  bajo: "ok",
  medio: "warning",
  alto: "critical",
  critico: "critical",
};

/** Nivel de riesgo sanitario: alto rojo, medio naranja, bajo verde. */
export function RiskBadge({ level, title }: { level: RiskLevel; title?: string }) {
  const { t } = useTranslation();
  return <StatusBadge tone={riskTone[level]} label={t(`dataTable.risk.${level}`)} title={title} />;
}
