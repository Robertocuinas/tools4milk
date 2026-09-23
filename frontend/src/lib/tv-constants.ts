/**
 * Polling intervals for TV/tablet views.
 *
 * TODO: When the backend exposes WebSocket or SSE endpoints for real-time
 * alert/task events, replace these polling intervals with event-driven
 * subscriptions. Priority streams: critical alerts and task state changes.
 */
export const TV_REFETCH = {
  /** Critical data: alerts, incidents — fast polling */
  FAST: 15_000,
  /** Operational data: tasks, zone status — normal polling */
  NORMAL: 30_000,
  /** Planning data: shifts, assignments — slower polling */
  SLOW: 60_000,
  /** Background data: weather, quality summary — very slow */
  VERY_SLOW: 5 * 60_000,
  /** Employee/zone catalog — only needs occasional refresh */
  CATALOG: 10 * 60_000,
} as const;

export const TV_STALE = {
  FAST: 10_000,
  NORMAL: 15_000,
  SLOW: 30_000,
  VERY_SLOW: 3 * 60_000,
  CATALOG: 5 * 60_000,
} as const;

/**
 * Escala tipografica y de espaciado del modo TV (T5.3).
 *
 * `--tvu` es la "unidad TV": el 1 % del alto de un lienzo 16:9 inscrito en
 * la ventana (min(1vh, 0.5625vw)). Asi el panel escala igual en 1080p,
 * 1440p y 4K, y en monitores 16:10 o ultra-panoramicos no desborda por
 * ninguno de los dos ejes. Cada tamaño tiene un minimo en px para que en
 * ventanas pequeñas siga siendo legible. Se aplican como variables CSS en
 * la raiz de TvShell y se consumen con la sintaxis de Tailwind 4
 * `text-(length:--tvu-fs-md)`, `gap-(--tvu-gap)`, `size-(--tvu-icon)`...
 */
export const TV_SCALE_VARS = {
  "--tvu": "min(1vh, 0.5625vw)",
  // Tipografia: la etiqueta mas pequeña (fs-xs) supera 1.4vh en 16:9.
  "--tvu-fs-2xs": "max(12px, calc(var(--tvu) * 1.45))",
  "--tvu-fs-xs": "max(13px, calc(var(--tvu) * 1.6))",
  "--tvu-fs-sm": "max(14px, calc(var(--tvu) * 1.9))",
  "--tvu-fs-md": "max(15px, calc(var(--tvu) * 2.3))",
  "--tvu-fs-lg": "max(18px, calc(var(--tvu) * 3))",
  "--tvu-fs-xl": "max(22px, calc(var(--tvu) * 4))",
  "--tvu-fs-kpi": "max(32px, calc(var(--tvu) * 7))",
  // Espaciado, radios e iconos.
  "--tvu-gap": "max(8px, calc(var(--tvu) * 1.2))",
  "--tvu-gap-sm": "max(4px, calc(var(--tvu) * 0.7))",
  "--tvu-pad": "max(10px, calc(var(--tvu) * 1.8))",
  "--tvu-pad-sm": "max(6px, calc(var(--tvu) * 1.1))",
  "--tvu-radius": "max(10px, calc(var(--tvu) * 1.4))",
  "--tvu-bar": "max(4px, calc(var(--tvu) * 0.5))",
  "--tvu-dot": "max(8px, calc(var(--tvu) * 1.1))",
  "--tvu-icon-sm": "max(12px, calc(var(--tvu) * 1.7))",
  "--tvu-icon": "max(16px, calc(var(--tvu) * 2.4))",
  "--tvu-icon-lg": "max(24px, calc(var(--tvu) * 4.5))",
} as const;

/** Inactividad tras la que se ocultan controles y cursor en el modo TV. */
export const TV_IDLE_MS = {
  /** En pantalla completa: la TV queda limpia enseguida. */
  FULLSCREEN: 4_000,
  /** Fuera de pantalla completa: margen para ver el aviso "Pantalla completa". */
  WINDOWED: 12_000,
} as const;
