// Tipos de la recomendacion de trabajadores para una tarea
// (GET /api/v1/tasks/recommended-employees). Reflejan
// backend/app/schemas/matching.py.

export type RecommendationReasonCode =
  | "qualification"
  | "role"
  | "missing_qualification"
  | "experience"
  | "zone"
  | "on_shift"
  | "workload";

export type RecommendationReason = {
  code: RecommendationReasonCode;
  value?: string | null;
  count?: number | null;
  points: number;
};

export type EmployeeCandidate = {
  empleado_id: string;
  nombre: string;
  apellidos?: string | null;
  role?: string | null;
  zona_principal_id?: string | null;
  score: number;
  rank: number;
  is_recommended: boolean;
  reasons: RecommendationReason[];
};

export type EmployeeRecommendationResponse = {
  catalogo_id?: string | null;
  zona_id?: string | null;
  ts_planificada?: string | null;
  cualificacion_requerida?: string | null;
  candidates: EmployeeCandidate[];
};

export type EmployeeRecommendationQuery = {
  catalogoId?: string | null;
  zonaId?: string | null;
  tsPlanificada?: string | null;
  taskId?: string | null;
};
