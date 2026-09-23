// Cliente de las tablas analiticas (Predicciones y Calidad). Separado de
// api.ts (fichero compartido); usa el mismo `request` con token y errores.
import { request } from "@/lib/api";
import type { PredictionTableRow, QualityTableRow } from "@/lib/types-analytics";

type AnalyticsParams = {
  estado?: string;
  skip?: number;
  limit?: number;
};

export const analyticsApi = {
  /** Una fila por animal con su prediccion resumida, ya ordenada por riesgo. */
  predictionsTable(params: AnalyticsParams = { estado: "produccion" }) {
    return request<PredictionTableRow[]>("/predictions", {}, params);
  },

  /** Una fila por animal con las medias de su lactacion activa y el score. */
  qualityTable(params: Omit<AnalyticsParams, "skip"> = { estado: "produccion" }) {
    return request<QualityTableRow[]>("/lactations/quality/animals", {}, params);
  },
};
