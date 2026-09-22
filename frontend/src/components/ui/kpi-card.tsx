import { AlertTriangle, CheckCircle2, Info, OctagonAlert, type LucideIcon } from "lucide-react";

type KpiTone = "default" | "critical" | "warning" | "success" | "info" | "muted";

const toneStyles: Record<KpiTone, { value: string; icon: string; border: string }> = {
  default: { value: "text-app-text", icon: "text-brand", border: "border-app-border" },
  critical: { value: "text-state-critica", icon: "text-state-critica", border: "border-state-critica/20" },
  warning: { value: "text-state-atencion", icon: "text-state-atencion", border: "border-state-atencion/20" },
  success: { value: "text-state-ok", icon: "text-state-ok", border: "border-state-ok/20" },
  info: { value: "text-state-info", icon: "text-state-info", border: "border-state-info/20" },
  muted: { value: "text-app-dim", icon: "text-app-dim", border: "border-app-border" },
};

// Auditoria post-implementacion (hallazgo 4.9): varias tarjetas KPI
// señalaban su estado solo con color (sin icono), incumpliendo la propia
// regla UX11 del proyecto ("sin depender del color"). Icono por defecto por
// tono para los casos donde el llamador no pasa uno explicito; "default" y
// "muted" no tienen carga semantica de estado, asi que se quedan sin icono.
const defaultToneIcon: Partial<Record<KpiTone, LucideIcon>> = {
  critical: OctagonAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

type KpiCardProps = {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: KpiTone;
  Icon?: LucideIcon;
  href?: string;
  className?: string;
  featured?: boolean;
};

export function KpiCard({ label, value, sublabel, tone = "default", Icon, className = "", featured = false }: KpiCardProps) {
  const styles = toneStyles[tone];
  const ResolvedIcon = Icon ?? defaultToneIcon[tone];
  return (
    <div className={`h-full rounded-[var(--bento-radius)] border bg-white p-[var(--bento-padding)] shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-panel ${styles.border} ${featured ? "flex flex-col justify-between bg-[linear-gradient(145deg,#ffffff_0%,#eef9ff_100%)]" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-app-dim">{label}</p>
        {ResolvedIcon && <ResolvedIcon className={`h-4 w-4 shrink-0 ${styles.icon}`} strokeWidth={2} />}
      </div>
      <p className={`${featured ? "mt-5 text-5xl sm:text-6xl" : "mt-3 text-4xl"} font-heading font-bold leading-none tracking-[-0.045em] ${styles.value}`}>
        {value}
      </p>
      {sublabel && (
        <p className="mt-1.5 text-xs font-semibold text-app-dim">{sublabel}</p>
      )}
    </div>
  );
}
