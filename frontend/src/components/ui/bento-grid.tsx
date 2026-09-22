import type { ReactNode } from "react";

type BentoGridProps = {
  children: ReactNode;
  className?: string;
};

type BentoFootprint = "1x1" | "2x1" | "1x2" | "2x2" | "3x1";

type BentoTileProps = {
  children: ReactNode;
  footprint?: BentoFootprint;
  className?: string;
};

const footprintStyles: Record<BentoFootprint, string> = {
  "1x1": "",
  "2x1": "sm:col-span-2",
  "1x2": "sm:row-span-2",
  "2x2": "sm:col-span-2 sm:row-span-2",
  "3x1": "sm:col-span-2 xl:col-span-3",
};

/** Shared responsive grid. Source order always remains visual order. */
export function BentoGrid({ children, className = "" }: BentoGridProps) {
  return (
    <div
      className={`grid grid-cols-1 auto-rows-[minmax(7.5rem,auto)] gap-[var(--bento-gap)] sm:grid-cols-2 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** Layout-only cell; the child owns its surface and interaction semantics. */
export function BentoTile({
  children,
  footprint = "1x1",
  className = "",
}: BentoTileProps) {
  return (
    <div className={`min-w-0 ${footprintStyles[footprint]} ${className}`}>
      {children}
    </div>
  );
}
