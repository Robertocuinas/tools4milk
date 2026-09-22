type PanelCardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
};

export function PanelCard({ children, className = "", padding = true }: PanelCardProps) {
  return (
    <div
      className={`h-full rounded-[var(--bento-radius)] border border-app-border bg-white shadow-card ${padding ? "p-[var(--bento-padding)]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

type SectionTitleProps = {
  children: React.ReactNode;
  className?: string;
};

export function SectionTitle({ children, className = "" }: SectionTitleProps) {
  return (
    <h2 className={`font-heading text-base font-bold text-app-text ${className}`}>
      {children}
    </h2>
  );
}

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-app-dim">
      {children}
    </p>
  );
}
