"use client";

import { LogOut, Maximize2, Minimize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TvClock } from "@/components/tv/TvClock";
import { TvRefreshStatus, type QueryStatusInfo } from "@/components/tv/TvRefreshStatus";
import { BrandLogo } from "@/components/ui/brand-logo";
import { TV_IDLE_MS, TV_SCALE_VARS } from "@/lib/tv-constants";
import { consumeTvEntry, exitFullscreen, useFullscreen, useIdle } from "@/lib/tv-mode";
import { useAppStore } from "@/store/app-store";

/**
 * Mantiene la pantalla encendida mientras el modo TV esta activo (T12.4).
 * La Wake Lock API no esta disponible en todos los navegadores/SO — se
 * reintenta al recuperar visibilidad (algunos navegadores liberan el lock
 * automaticamente al minimizar la pestaña) y se ignora silenciosamente si
 * no hay soporte, sin romper el resto de la pantalla.
 */
function useWakeLock() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;

    async function requestLock() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Sin soporte, permiso denegado, o pestaña no visible: no es critico.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") requestLock();
    }

    requestLock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, []);
}

/** `true` si el evento de teclado viene de un campo editable (no robar la F). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const controlButton =
  "flex items-center gap-(--tvu-gap-sm) rounded-(--tvu-radius) px-(--tvu-pad) py-(--tvu-pad-sm) text-white transition focus-visible:outline-(length:--tvu-bar) focus-visible:outline-offset-2 focus-visible:outline-white";

type TvShellProps = {
  title: string;
  subtitle?: string;
  /** Estado de las consultas para el indicador de refresco de la cabecera */
  queryStatuses?: QueryStatusInfo[];
  /** Destino de "Salir del modo TV" cuando no se entro desde la app
   * (marcador, recarga): no hay historial propio al que volver. */
  exitHref?: string;
  children: React.ReactNode;
};

/**
 * Contenedor del modo TV (T5): ocupa exactamente el viewport (sin scroll de
 * pagina), escala tipografia y espaciado con la unidad TV (TV_SCALE_VARS) y
 * gestiona pantalla completa, controles auto-ocultables y cursor.
 *
 * - Pantalla completa: si se llega sin gesto (marcador/recarga) se ofrece
 *   un boton destacado y el atajo F; no se insiste una vez activa ni cuando
 *   el contexto no la soporta (iPhone, iframe sin permiso).
 * - Salida: Escape sale de la pantalla completa de forma nativa y la pagina
 *   sigue usable; "Salir del modo TV" sale de pantalla completa y vuelve
 *   atras (o a `exitHref`). Los controles se ocultan con la inactividad pero
 *   reaparecen al mover el raton y siempre son alcanzables con Tab.
 */
export function TvShell({
  title,
  subtitle,
  queryStatuses,
  exitHref = "/dashboard",
  children,
}: TvShellProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const hydrate = useAppStore((s) => s.hydrate);
  const isHydrated = useAppStore((s) => s.isHydrated);
  const token = useAppStore((s) => s.token);
  const { isFullscreen, isSupported, enter, exit, toggle } = useFullscreen();
  const idle = useIdle(isFullscreen ? TV_IDLE_MS.FULLSCREEN : TV_IDLE_MS.WINDOWED);
  // Se retrasa el aviso de pantalla completa para no mostrarlo un instante
  // al llegar desde el boton "Modo TV" mientras el navegador la activa.
  const [promptReady, setPromptReady] = useState(false);
  useWakeLock();

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (isHydrated && !token) router.replace("/");
  }, [isHydrated, token, router]);

  useEffect(() => {
    const timer = setTimeout(() => setPromptReady(true), 900);
    return () => clearTimeout(timer);
  }, []);

  // Atajo F: keydown cuenta como gesto del usuario para la Fullscreen API.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "f" && event.key !== "F") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      void toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const handleExitTv = useCallback(async () => {
    await exitFullscreen();
    if (consumeTvEntry()) router.back();
    else router.push(exitHref);
  }, [router, exitHref]);

  if (!isHydrated || !token) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-tv-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-tv-accent border-t-transparent" />
      </div>
    );
  }

  const showFullscreenPrompt = isSupported && !isFullscreen && promptReady;

  return (
    <div
      style={TV_SCALE_VARS as React.CSSProperties}
      className={`tv-theme fixed inset-0 flex flex-col overflow-hidden bg-tv-bg font-body text-tv-text ${
        isFullscreen && idle ? "cursor-none" : ""
      }`}
    >
      {/* ── Cabecera TV: sin bordes ni controles de gestion ── */}
      <header className="flex shrink-0 items-center justify-between gap-(--tvu-pad) px-(--tvu-pad) py-(--tvu-pad-sm)">
        <div className="flex min-w-0 items-center gap-(--tvu-gap)">
          <BrandLogo
            variant="mark"
            theme="light"
            size={96}
            className="size-(--tvu-icon-lg) shrink-0 object-contain"
          />
          <div className="min-w-0">
            <h1 className="truncate font-heading text-(length:--tvu-fs-lg) font-bold leading-tight text-tv-text">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-(length:--tvu-fs-xs) font-semibold text-tv-dim">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-(--tvu-pad)">
          {queryStatuses && queryStatuses.length > 0 && (
            <TvRefreshStatus queries={queryStatuses} className="hidden sm:flex" />
          )}
          <TvClock />
        </div>
      </header>

      {/* ── Contenido ──
          En pantallas grandes (lg+) el contenido se reparte exactamente en el
          alto restante y cada panel recorta/resume internamente. Solo por
          debajo de lg (ventana estrecha, no es el caso de una TV) se permite
          scroll interno del main para no ocultar informacion. */}
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-(--tvu-pad) pb-(--tvu-pad) lg:overflow-hidden">
        {children}
      </main>

      {/* ── Controles flotantes del modo TV ──
          Siempre en el DOM (alcanzables con Tab); se desvanecen con la
          inactividad y reaparecen al mover el raton o al recibir el foco. */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-(--tvu-pad) z-50 flex justify-center px-(--tvu-pad) transition-opacity duration-300 focus-within:opacity-100 ${
          idle ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          role="toolbar"
          aria-label={t("tv.controls")}
          className={`flex flex-wrap items-center justify-center gap-(--tvu-gap) rounded-(--tvu-radius) bg-tv-text/90 p-(--tvu-pad-sm) text-white shadow-deck backdrop-blur focus-within:pointer-events-auto ${
            idle ? "" : "pointer-events-auto"
          }`}
        >
          {showFullscreenPrompt && (
            <button
              type="button"
              onClick={() => void enter()}
              className={`${controlButton} bg-brand text-(length:--tvu-fs-md) font-bold hover:bg-brand-dark`}
            >
              <Maximize2 className="size-(--tvu-icon) shrink-0" aria-hidden />
              {t("tv.fullscreen.enter")}
              <kbd className="rounded bg-white/20 px-[0.4em] font-mono text-(length:--tvu-fs-xs)">F</kbd>
            </button>
          )}
          {isFullscreen && (
            <button
              type="button"
              onClick={() => void exit()}
              className={`${controlButton} bg-white/10 text-(length:--tvu-fs-sm) font-semibold hover:bg-white/20`}
            >
              <Minimize2 className="size-(--tvu-icon) shrink-0" aria-hidden />
              {t("tv.fullscreen.exit")}
              <kbd className="rounded bg-white/20 px-[0.4em] font-mono text-(length:--tvu-fs-xs)">Esc</kbd>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleExitTv()}
            className={`${controlButton} bg-white/10 text-(length:--tvu-fs-sm) font-semibold hover:bg-white/20`}
          >
            <LogOut className="size-(--tvu-icon) shrink-0 rtl:-scale-x-100" aria-hidden />
            {t("tv.exit")}
          </button>
          {showFullscreenPrompt && (
            <p className="basis-full text-center text-(length:--tvu-fs-xs) text-white/80">
              {t("tv.fullscreen.hint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
