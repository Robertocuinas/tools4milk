import type { LucideIcon } from "lucide-react";

type TvTone = "critical" | "warning" | "ok" | "info" | "accent" | "neutral";

// Texto en tonos oscuros (brand-dark para "accent") para mantener contraste
// alto sobre fondos claros a distancia; el color de fondo refuerza el estado.
const toneMap: Record<TvTone, { value: string; icon: string; bg: string; bar: string }> = {
  critical: { value: "text-state-critica", icon: "text-state-critica", bg: "bg-state-critica/10", bar: "bg-state-critica" },
  warning:  { value: "text-state-atencion", icon: "text-state-atencion", bg: "bg-state-atencion/10", bar: "bg-state-atencion" },
  ok:       { value: "text-state-ok", icon: "text-state-ok", bg: "bg-state-ok/10", bar: "bg-state-ok" },
  info:     { value: "text-state-info", icon: "text-state-info", bg: "bg-state-info/10", bar: "bg-state-info" },
  accent:   { value: "text-brand-dark", icon: "text-tv-accent", bg: "bg-tv-accent/10", bar: "bg-tv-accent" },
  neutral:  { value: "text-tv-text", icon: "text-tv-dim", bg: "bg-tv-surface", bar: "bg-tv-border" },
};

type TvKpiCardProps = {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: TvTone;
  Icon?: LucideIcon;
};

/** KPI del modo TV: cifra muy grande escalada con la unidad TV (--tvu). */
export function TvKpiCard({ label, value, sublabel, tone = "neutral", Icon }: TvKpiCardProps) {
  const t = toneMap[tone];
  return (
    <div className={`relative flex min-w-0 flex-col justify-between overflow-hidden rounded-(--tvu-radius) ${t.bg} px-(--tvu-pad) py-(--tvu-pad-sm)`}>
      {/* Barra superior de estado: señal de color visible desde lejos */}
      <span className={`absolute inset-x-0 top-0 h-(--tvu-bar) ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-(--tvu-gap-sm) pt-(--tvu-gap-sm)">
        <p className="line-clamp-2 text-(length:--tvu-fs-xs) font-extrabold uppercase leading-tight tracking-[0.06em] text-tv-dim">
          {label}
        </p>
        {Icon && <Icon className={`size-(--tvu-icon) shrink-0 ${t.icon}`} strokeWidth={2.25} aria-hidden />}
      </div>
      <p className={`mt-(--tvu-gap-sm) truncate font-heading text-(length:--tvu-fs-kpi) font-bold leading-none tabular-nums ${t.value}`}>
        {value}
      </p>
      <p className="mt-(--tvu-gap-sm) truncate text-(length:--tvu-fs-xs) font-semibold leading-tight text-tv-dim">
        {sublabel ?? " "}
      </p>
    </div>
  );
}
