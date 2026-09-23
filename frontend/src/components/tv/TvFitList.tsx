"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type TvFitListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** Tope de elementos renderizados (el resto solo cuenta para "+N más"). */
  maxRender?: number;
  /** Clases de la lista; por defecto columna. Admite rejillas (orden por
   * filas): la medicion por "prefijo que cabe" sigue siendo valida. */
  listClassName?: string;
};

/**
 * Lista que muestra solo los elementos que caben en el alto disponible y
 * resume el resto como "+N más" (T5.2). Evita tanto el scroll de pagina
 * como recortar informacion en silencio.
 *
 * Todos los elementos se renderizan y los que no caben se marcan
 * `invisible`: asi la medicion es estable (ocultarlos no mueve a los
 * demas) y no hay bucles de re-medicion. Se re-mide con ResizeObserver
 * (cambio de resolucion, entrada/salida de pantalla completa) y cuando
 * cambian los datos.
 */
export function TvFitList<T>({
  items,
  getKey,
  renderItem,
  maxRender = 30,
  listClassName = "flex flex-col gap-(--tvu-gap-sm)",
}: TvFitListProps<T>) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLParagraphElement>(null);
  const rendered = items.slice(0, maxRender);
  const [visible, setVisible] = useState(rendered.length);
  const total = items.length;

  useEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) return;

    function measure() {
      if (!container || !list) return;
      const limit = container.clientHeight;
      const bottoms = Array.from(list.children).map((child) => {
        const el = child as HTMLElement;
        return el.offsetTop + el.offsetHeight;
      });
      let fit = bottoms.filter((b) => b <= limit + 0.5).length;
      if (fit < total) {
        // Reservar hueco para la linea "+N más".
        const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
        const reserve = (moreRef.current?.offsetHeight ?? 0) + gap;
        fit = bottoms.filter((b) => b <= limit - reserve + 0.5).length;
      }
      setVisible(fit);
    }

    // ResizeObserver notifica tambien la medida inicial al empezar a observar.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(list);
    // Cambios de datos con el mismo tamaño de lista: re-medir en el siguiente frame.
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [items, total]);

  const hidden = Math.max(0, total - visible);

  return (
    <div ref={containerRef} className="relative h-full min-h-0 overflow-hidden">
      <ul ref={listRef} className={listClassName}>
        {rendered.map((item, index) => (
          <li
            key={getKey(item)}
            aria-hidden={index >= visible || undefined}
            className={index >= visible ? "invisible" : undefined}
          >
            {renderItem(item)}
          </li>
        ))}
      </ul>
      <p
        ref={moreRef}
        aria-hidden={hidden === 0 || undefined}
        className={`absolute inset-x-0 bottom-0 rounded-(--tvu-radius) bg-tv-surface py-(--tvu-gap-sm) text-center text-(length:--tvu-fs-sm) font-bold text-tv-dim ${hidden === 0 ? "invisible" : ""}`}
      >
        {t("tv.more", { n: hidden })}
      </p>
    </div>
  );
}
