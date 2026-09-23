"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Utilidades del modo TV (T5): pantalla completa real mediante la
 * Fullscreen API, deteccion de inactividad para ocultar controles/cursor y
 * marca de "entrada desde la app" para decidir como salir del modo TV.
 *
 * Casos limite contemplados:
 * - Safari (macOS < 16.4 e iPadOS) solo expone la API con prefijo webkit y
 *   `webkitRequestFullscreen` no devuelve promesa.
 * - La peticion se rechaza si no procede de un gesto del usuario, si el
 *   documento esta en un iframe sin `allow="fullscreen"` o si el usuario la
 *   deniega: nunca se propaga la excepcion, se devuelve `false`.
 * - iPhone no soporta pantalla completa de documento: `isFullscreenSupported`
 *   devuelve `false` y la UI no insiste con el aviso.
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
};

const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

function getDocument(): WebkitDocument | null {
  return typeof document === "undefined" ? null : (document as WebkitDocument);
}

/** Elemento actualmente en pantalla completa (con fallback webkit). */
function getFullscreenElement(): Element | null {
  const doc = getDocument();
  if (!doc) return null;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** `true` si el navegador/contexto permite pantalla completa de documento.
 * Devuelve `false` en iframes sin permiso y en iPhone. */
export function isFullscreenSupported(): boolean {
  const doc = getDocument();
  if (!doc) return false;
  if (typeof doc.fullscreenEnabled === "boolean") return doc.fullscreenEnabled;
  return doc.webkitFullscreenEnabled === true;
}

export function isFullscreen(): boolean {
  return getFullscreenElement() != null;
}

/**
 * Solicita pantalla completa. DEBE llamarse de forma sincrona dentro de un
 * manejador de gesto (click/keydown): si se llama tras un `await` el
 * navegador puede considerar que el gesto ha caducado y rechazarla.
 * Resuelve `true` si queda en pantalla completa, `false` si no hay soporte
 * o se rechaza (con la variante webkit antigua puede resolver `false` y
 * entrar un instante despues: la fuente de verdad es `useFullscreen`).
 * Nunca lanza.
 */
export async function enterFullscreen(
  element?: HTMLElement,
): Promise<boolean> {
  const doc = getDocument();
  if (!doc) return false;
  if (isFullscreen()) return true;
  const target = (element ?? doc.documentElement) as WebkitElement;
  try {
    if (typeof target.requestFullscreen === "function") {
      // navigationUI "hide": en navegadores moviles oculta la barra del navegador.
      await target.requestFullscreen({ navigationUI: "hide" });
    } else if (typeof target.webkitRequestFullscreen === "function") {
      // La variante webkit antigua devuelve undefined: se espera al evento.
      await target.webkitRequestFullscreen();
    } else {
      return false;
    }
  } catch {
    // Gesto caducado, iframe sin permiso o denegado por el usuario.
    return false;
  }
  return isFullscreen();
}

/** Sale de pantalla completa si esta activa. Nunca lanza. */
export async function exitFullscreen(): Promise<void> {
  const doc = getDocument();
  // exitFullscreen() rechaza si no hay elemento en pantalla completa.
  if (!doc || !isFullscreen()) return;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ya habia salido (p. ej. Escape simultaneo): no es un error.
  }
}

function subscribeFullscreen(onChange: () => void): () => void {
  const doc = getDocument();
  if (!doc) return () => {};
  for (const name of FULLSCREEN_EVENTS) doc.addEventListener(name, onChange);
  return () => {
    for (const name of FULLSCREEN_EVENTS) doc.removeEventListener(name, onChange);
  };
}

const noopSubscribe = () => () => {};

/**
 * Estado reactivo de pantalla completa. Se actualiza tambien cuando el
 * usuario sale con Escape o con la UI nativa del navegador.
 */
export function useFullscreen() {
  const active = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
  // El soporte no cambia durante la sesion: snapshot estatico en cliente.
  const supported = useSyncExternalStore(noopSubscribe, isFullscreenSupported, () => false);

  const enter = useCallback(() => enterFullscreen(), []);
  const exit = useCallback(() => exitFullscreen(), []);
  const toggle = useCallback(
    () => (isFullscreen() ? exitFullscreen().then(() => false) : enterFullscreen()),
    [],
  );

  return { isFullscreen: active, isSupported: supported, enter, exit, toggle };
}

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "focusin"] as const;

/**
 * Devuelve `true` tras `timeoutMs` sin actividad de raton/teclado/tactil.
 * Se usa para ocultar controles y cursor en la pantalla de TV.
 */
export function useIdle(timeoutMs: number): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function arm() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), timeoutMs);
    }
    function onActivity() {
      setIdle(false);
      arm();
    }
    arm();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [timeoutMs]);

  return idle;
}

// ── Entrada al modo TV desde la app ─────────────────────────────────────────
// Se marca en sessionStorage cuando se entra con el boton "Modo TV" para que
// "Salir del modo TV" pueda hacer router.back() con seguridad; si se llega
// por marcador/recarga no hay historial propio y se navega al fallback.

const TV_ENTRY_KEY = "t4m-tv-entry";

export function markTvEntry(): void {
  try {
    window.sessionStorage.setItem(TV_ENTRY_KEY, "1");
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): se usara el fallback.
  }
}

/** Consume la marca: `true` si se entro desde la app y hay historial. */
export function consumeTvEntry(): boolean {
  try {
    const marked = window.sessionStorage.getItem(TV_ENTRY_KEY) === "1";
    window.sessionStorage.removeItem(TV_ENTRY_KEY);
    return marked && window.history.length > 1;
  } catch {
    return false;
  }
}
