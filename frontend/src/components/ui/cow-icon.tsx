import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";

/** Icono de ganado local: evita añadir una dependencia para una única pieza. */
export const CowIcon = forwardRef<SVGSVGElement, LucideProps>(function CowIcon(props, ref) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 8 3.5 5.5 7 6.5M19 8l1.5-2.5-3.5 1" />
      <path d="M5 8c-1 1.2-1.5 2.8-1.5 4.5C3.5 17 6.5 20 12 20s8.5-3 8.5-7.5C20.5 10.8 20 9.2 19 8c-1.7-1.5-3.9-2-7-2s-5.3.5-7 2Z" />
      <path d="M8 12h.01M16 12h.01M9 16c1.8 1 4.2 1 6 0" />
    </svg>
  );
});
