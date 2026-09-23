// Tipos del Centro de control (dashboard) añadidos fuera de types.ts.
// Contrato: GET /api/v1/dashboard/severity-trend (backend/app/schemas/dashboard.py).

export type SeverityDayCount = {
  /** Día natural en la zona horaria de la explotación (YYYY-MM-DD). */
  fecha: string;
  /** Incluye los registros de nivel "critica". */
  alta: number;
  media: number;
  baja: number;
  total: number;
};

export type SeverityTotals = {
  alta: number;
  media: number;
  baja: number;
  total: number;
  /** Subconjunto de `alta` que en origen era "critica". */
  criticas: number;
};

export type SeveritySeries = {
  serie: SeverityDayCount[];
  totales: SeverityTotals;
  total_periodo_anterior: number;
};

export type SeverityTrendTendency = "mejorando" | "empeorando" | "estable" | "sin_datos";

export type SeverityTrendResponse = {
  days: number;
  desde: string;
  hasta: string;
  zona_horaria: string;
  incidencias: SeveritySeries;
  alertas: SeveritySeries;
  tendencia: SeverityTrendTendency;
  total_actual: number;
  total_anterior: number;
};
