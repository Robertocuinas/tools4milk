// Tipos de las tablas analiticas (Predicciones y Calidad).
// Reflejan backend/app/schemas/analytics.py. Se mantienen aparte de
// types.ts (fichero compartido) hasta su consolidacion.
import type { PredictionTrend, RiskLevel } from "@/lib/types";

/** Fila de GET /predictions: resumen de la prediccion heuristica por animal. */
export type PredictionTableRow = {
  animal_id: string;
  crotal_oficial: string;
  nombre?: string | null;
  raza?: string | null;
  estado: string;
  riesgo: RiskLevel;
  factores_riesgo: string[];
  /** L/dia previstos; null si el animal no tiene lecturas ni lactacion. */
  produccion_prevista: number | null;
  tendencia_produccion: PredictionTrend;
  origen_produccion: string;
  /** % previsto; null si no procede de la lactacion del propio animal. */
  grasa: number | null;
  proteina: number | null;
  origen_composicion: string;
  _mock: boolean;
};

/** Fila de GET /lactations/quality/animals: animal + lactacion activa. */
export type QualityTableRow = {
  animal_id: string;
  crotal_oficial: string;
  nombre?: string | null;
  raza?: string | null;
  estado: string;
  lactacion_id: string | null;
  numero_lactacion: number | null;
  dias_en_leche: number | null;
  grasa: number | null;
  proteina: number | null;
  /** L/dia (produccion_total_kg / 305, mismo criterio que /lactations). */
  produccion: number | null;
  produccion_total: number | null;
  /** Celulas somaticas (cel/mL). */
  rcs: number | null;
  /** Score de calidad 0-100 calculado en backend (lactations_service.quality_score). */
  score: number | null;
};
