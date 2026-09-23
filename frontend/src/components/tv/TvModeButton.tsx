"use client";

import { Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { enterFullscreen, markTvEntry } from "@/lib/tv-mode";

type TvModeButtonProps = {
  className?: string;
  /** Ruta del panel TV al que se navega (por defecto el panel global). */
  href?: string;
};

/**
 * Boton "Modo TV" (T5): convierte la pestaña en un panel a pantalla
 * completa. La pantalla completa se solicita de forma sincrona dentro del
 * click (los navegadores exigen gesto del usuario) y despues se navega en
 * cliente: al ser el mismo documento, la pantalla completa se conserva.
 * Si no hay soporte o se deniega, se navega igualmente; el panel TV ofrece
 * entonces su propio boton "Pantalla completa".
 */
export function TvModeButton({ className, href = "/tv" }: TvModeButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();

  function handleClick() {
    markTvEntry();
    // Sin await: la peticion ya se ha emitido dentro del gesto y la
    // navegacion no debe depender de que el navegador la acepte.
    void enterFullscreen();
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t("tv.enterTvModeHint")}
      className={[
        "inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className ?? "",
      ].join(" ")}
    >
      <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t("tv.enterTvMode")}
    </button>
  );
}
