"use client";

import { Maximize2, Minimize2, Milk } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TvClock, TvDate } from "@/components/tv/TvClock";
import { TvRefreshStatus, type QueryStatusInfo } from "@/components/tv/TvRefreshStatus";
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

/** Pantalla completa real (T12.1): requiere gesto del usuario, los
 * navegadores no permiten activarla automaticamente al cargar la pagina. */
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement != null);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Algunos navegadores/contextos (iframe sin allow="fullscreen", Safari
      // en ciertas versiones) rechazan la solicitud — se ignora sin romper
      // el resto del modo TV.
    }
  }

  return { isFullscreen, toggle };
}

type TvShellProps = {
  title: string;
  subtitle?: string;
  /** Pass query results for the refresh-status indicator in the header */
  queryStatuses?: QueryStatusInfo[];
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export function TvShell({
  title,
  subtitle,
  queryStatuses,
  backHref,
  backLabel = "Gestión",
  children,
}: TvShellProps) {
  const router = useRouter();
  const hydrate = useAppStore((s) => s.hydrate);
  const isHydrated = useAppStore((s) => s.isHydrated);
  const token = useAppStore((s) => s.token);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  useWakeLock();

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (isHydrated && !token) router.replace("/");
  }, [isHydrated, token, router]);

  if (!isHydrated || !token) {
    return (
      <div className="flex h-screen items-center justify-center bg-tv-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-tv-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="tv-theme flex h-screen flex-col overflow-hidden bg-tv-bg font-body text-tv-text">
      {/* ── TV Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-tv-border bg-tv-surface px-8 py-4 tv-scale:py-6">
        <div className="flex items-center gap-4">
          <div className="t4m-logo grid h-9 w-9 shrink-0 place-items-center rounded-[10px] tv-scale:h-12 tv-scale:w-12">
            <Milk className="h-4.5 w-4.5 text-tv-text tv-scale:h-6 tv-scale:w-6" strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-heading text-lg font-bold leading-tight text-tv-text">{title}</div>
            {subtitle && <div className="text-xs text-tv-dim">{subtitle}</div>}
          </div>
        </div>

        <div className="flex items-center gap-5">
          {queryStatuses && queryStatuses.length > 0 && (
            <TvRefreshStatus queries={queryStatuses} />
          )}
          <div className="hidden text-end lg:block">
            <TvClock />
            <div className="mt-0.5">
              <TvDate />
            </div>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            className="tablet-touch flex items-center justify-center rounded-[10px] border border-tv-border bg-tv-surface2 p-2 text-tv-text transition hover:bg-tv-border tv-scale:p-3"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 tv-scale:h-6 tv-scale:w-6" />
            ) : (
              <Maximize2 className="h-4 w-4 tv-scale:h-6 tv-scale:w-6" />
            )}
          </button>
          {backHref && (
            <Link
              href={backHref}
              className="rounded-[10px] border border-tv-border bg-tv-surface2 px-3 py-2 text-xs font-semibold text-tv-text transition hover:bg-tv-border"
            >
              ← {backLabel}
            </Link>
          )}
        </div>
      </header>

      {/* ── Main content ──
          overflow-y-auto (no overflow-hidden): a diferencia del header, el
          contenido operativo puede exceder el alto disponible en
          resoluciones pequeñas o con muchas zonas/paneles; se prefiere un
          scroll interno contenido a recortar informacion en silencio. Lo
          que se elimina es el scroll de la PAGINA completa (antes
          min-h-screen dejaba crecer todo el documento). */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-8">{children}</main>
    </div>
  );
}
