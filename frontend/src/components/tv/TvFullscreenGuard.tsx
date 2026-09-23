"use client";

import { useEffect } from "react";
import { exitFullscreen } from "@/lib/tv-mode";

/**
 * Sale de pantalla completa al abandonar la zona /tv por cualquier via
 * (boton atras del navegador, enlace...), para no dejar la app de gestion
 * atrapada a pantalla completa. Se monta en el layout de /tv, que persiste
 * entre /tv y /tv/shifts. La comprobacion se difiere un tick: en desarrollo
 * (Strict Mode) React desmonta y remonta al instante y la ruta sigue en /tv.
 */
export function TvFullscreenGuard() {
  useEffect(() => {
    return () => {
      setTimeout(() => {
        if (!window.location.pathname.startsWith("/tv")) void exitFullscreen();
      }, 0);
    };
  }, []);
  return null;
}
