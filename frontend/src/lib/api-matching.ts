// Cliente de la recomendacion de trabajadores. Vive en un modulo propio para
// no tocar lib/api.ts; reutiliza su `request<T>` (token, errores, base URL).
import { request } from "@/lib/api";
import type { EmployeeRecommendationQuery, EmployeeRecommendationResponse } from "@/lib/types-matching";

export function recommendedEmployees(query: EmployeeRecommendationQuery) {
  const params: Record<string, string> = {};
  if (query.catalogoId) params.catalogo_id = query.catalogoId;
  if (query.zonaId) params.zona_id = query.zonaId;
  if (query.tsPlanificada) params.ts_planificada = query.tsPlanificada;
  if (query.taskId) params.task_id = query.taskId;
  return request<EmployeeRecommendationResponse>("/tasks/recommended-employees", {}, params);
}
