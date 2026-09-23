import type { LucideIcon } from "lucide-react";

type TvPanelProps = {
  title: string;
  count?: number;
  Icon?: LucideIcon;
  iconTone?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Panel del modo TV. Ocupa el alto que le asigne la rejilla padre y nunca
 * lo excede: el cuerpo es `min-h-0 overflow-hidden` y las listas largas se
 * resuelven con TvFitList ("+N más") en vez de hacer scroll de pagina.
 * Sin bordes: el contraste superficie/fondo basta y reduce ruido a distancia.
 */
export function TvPanel({ title, count, Icon, iconTone = "text-tv-dim", children, className = "" }: TvPanelProps) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-(--tvu-radius) bg-tv-surface ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-(--tvu-gap) px-(--tvu-pad) pt-(--tvu-pad) pb-(--tvu-pad-sm)">
        <div className="flex min-w-0 items-center gap-(--tvu-gap-sm)">
          {Icon && <Icon className={`size-(--tvu-icon) shrink-0 ${iconTone}`} strokeWidth={2.25} aria-hidden />}
          <h2 className="truncate text-(length:--tvu-fs-sm) font-extrabold uppercase leading-tight tracking-[0.08em] text-tv-text">
            {title}
          </h2>
        </div>
        {count !== undefined && (
          <span className="shrink-0 rounded-full bg-tv-surface2 px-(--tvu-pad-sm) py-(--tvu-gap-sm) font-heading text-(length:--tvu-fs-md) font-bold leading-none tabular-nums text-tv-text">
            {count}
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-(--tvu-pad) pb-(--tvu-pad)">{children}</div>
    </section>
  );
}

export function TvEmptyRow({ text, tone = "dim" }: { text: string; tone?: "dim" | "ok" | "error" }) {
  const color = tone === "error" ? "text-state-critica" : tone === "ok" ? "text-state-ok" : "text-tv-dim";
  return (
    <div className={`flex h-full min-h-[3em] items-center justify-center text-center text-(length:--tvu-fs-md) font-semibold ${color}`}>
      {text}
    </div>
  );
}

type TvBadgeTone = "critical" | "warning" | "info" | "neutral";

const badgeTone: Record<TvBadgeTone, string> = {
  critical: "bg-state-critica/15 text-state-critica",
  warning: "bg-state-atencion/15 text-state-atencion",
  info: "bg-state-info/15 text-state-info",
  neutral: "bg-tv-surface text-tv-dim",
};

export function TvBadge({ tone, children }: { tone: TvBadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-(--tvu-pad-sm) py-[0.15em] text-(length:--tvu-fs-2xs) font-extrabold uppercase leading-tight tracking-wide ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

/** Tarjeta de elemento de lista (incidencia, tarea...). `accent` pinta una
 * barra en el borde inicial (logico: izquierda en LTR, derecha en RTL). */
export function TvItem({
  accent,
  children,
  className = "",
}: {
  accent?: "critical" | "warning";
  children: React.ReactNode;
  className?: string;
}) {
  const bar =
    accent === "critical"
      ? "border-s-(length:--tvu-bar) border-s-state-critica"
      : accent === "warning"
        ? "border-s-(length:--tvu-bar) border-s-state-atencion"
        : "";
  return (
    <div className={`rounded-(--tvu-radius) bg-tv-surface2 px-(--tvu-pad) py-(--tvu-pad-sm) ${bar} ${className}`}>
      {children}
    </div>
  );
}
