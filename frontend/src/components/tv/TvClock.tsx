"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateLocale } from "@/lib/i18n";

/**
 * Reloj y fecha del modo TV. La hora se calcula solo en cliente (null en
 * SSR) para evitar desajustes de hidratacion, y ambos se formatean con el
 * idioma activo (T6: "ar" sin region para mantener digitos latinos).
 */
function useNow(intervalMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function TvClock() {
  const { i18n } = useTranslation();
  const now = useNow(1000);
  const locale = dateLocale(i18n.language);

  return (
    <div className="text-end leading-none">
      <span className="block font-mono text-(length:--tvu-fs-lg) font-bold tabular-nums tracking-tight text-brand-dark">
        {now
          ? now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "--:--:--"}
      </span>
      <span className="mt-(--tvu-gap-sm) block text-(length:--tvu-fs-xs) font-semibold capitalize text-tv-dim">
        {now
          ? now.toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
          : " "}
      </span>
    </div>
  );
}
