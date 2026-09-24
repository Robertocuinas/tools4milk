import { API_BASE_URL, API_V1_URL, TOKEN_STORAGE_KEY } from "@/lib/config";
import i18n from "@/lib/i18n";
import type {
  Alert,
  AlertState,
  AlertsResponse,
  Animal,
  AnimalMovement,
  AnimalPrediction,
  Attachment,
  AuditLogResponse,
  AuthResponse,
  BoxRecria,
  CreateIncidentPayload,
  CreateOrderPayload,
  CreateShiftAssignmentPayload,
  CreateShiftPayload,
  DashboardSummary,
  Employee,
  FarmSettings,
  HealthResponse,
  Incident,
  Lactation,
  LoginPayload,
  Machinery,
  Order,
  OrderStatus,
  OrdersResponse,
  QualitySummary,
  Shift,
  ShiftAssignment,
  ShiftAssignmentsResponse,
  ShiftHandover,
  ShiftHandoversResponse,
  UnifiedEstado,
  UnifiedIncident,
  UnifiedSeverity,
  ShiftsResponse,
  Task,
  TaskCatalogItem,
  TankQualityReading,
  Treatment,
  WeatherData,
  WeatherForecast,
  Zone,
} from "@/lib/types";

type QueryParams = Record<string, string | number | boolean | null | undefined>;

// Exportado para los pocos consumidores que necesitan el token fuera de
// request()/uploadFile() (p. ej. un fetch() a pelo para leer un blob en vez
// de JSON), en vez de que cada uno relea localStorage por su cuenta.
export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function buildUrl(path: string, params?: QueryParams): string {
  const base = path.startsWith("/api") || path === "/health" ? API_BASE_URL : API_V1_URL;
  const fullPath = `${base}${path}`;
  const entries = Object.entries(params ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return fullPath;
  return `${fullPath}?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

export async function request<T>(path: string, init: RequestInit = {}, params?: QueryParams): Promise<T> {
  const token = getToken();
  const url = buildUrl(path, params);
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  }).catch(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(`[api] sin conexión: ${init.method ?? "GET"} ${url}`);
    }
    throw new Error(i18n.t("apiErrors.network"));
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      // Keep the HTTP fallback message.
    }
    // Se adjunta el codigo HTTP para que la UI pueda traducir errores
    // conocidos (p. ej. 401/429 en login) sin depender del texto del backend.
    throw Object.assign(new Error(detail), { status: response.status });
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Subida de fichero (T7): a diferencia de request(), NO fija Content-Type —
// el navegador debe generar el boundary de multipart/form-data el mismo.
// `filename` es obligatorio para un Blob "en crudo" (p.ej. la grabación de
// MediaRecorder de T14), que a diferencia de un File no trae nombre propio.
export async function uploadFile<T>(
  path: string,
  file: File | Blob,
  filename?: string,
  extraFields?: Record<string, string>,
): Promise<T> {
  const token = getToken();
  const body = new FormData();
  body.append("file", file, filename ?? (file instanceof File ? file.name : "file"));
  for (const [key, value] of Object.entries(extraFields ?? {})) body.append(key, value);
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  }).catch(() => {
    throw new Error(i18n.t("apiErrors.network"));
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      // Keep the HTTP fallback message.
    }
    // Se adjunta el codigo HTTP para que la UI pueda traducir errores
    // conocidos (p. ej. 401/429 en login) sin depender del texto del backend.
    throw Object.assign(new Error(detail), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export const api = {
  health() {
    return request<HealthResponse>("/health");
  },

  login(payload: LoginPayload) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  me() {
    return request<AuthResponse["user"]>("/auth/me");
  },

  dashboardSummary() {
    return request<DashboardSummary>("/dashboard/summary");
  },

  zones() {
    return request<Zone[]>("/zones");
  },

  boxesRecria(params?: QueryParams) {
    return request<BoxRecria[]>("/boxes-recria", {}, params);
  },

  zone(zoneId: string) {
    return request<Zone>(`/zones/${zoneId}`);
  },

  createZone(body: Partial<Zone>) {
    return request<Zone>("/zones", { method: "POST", body: JSON.stringify(body) });
  },

  updateZone(zoneId: string, body: Partial<Zone>) {
    return request<Zone>(`/zones/${zoneId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  alerts(params?: QueryParams) {
    return request<AlertsResponse>("/alerts", {}, params);
  },

  animalAlerts(animalId: string, params?: QueryParams) {
    return request<AlertsResponse>(`/alerts/${animalId}`, {}, params);
  },

  alertDetail(alertId: string) {
    return request<Alert>(`/alerts/detail/${alertId}`);
  },

  createAlert(body: Partial<Alert>) {
    return request<Alert>("/alerts", { method: "POST", body: JSON.stringify(body) });
  },

  reviewAlert(alertId: string, body: Partial<Alert>) {
    return request<Alert>(`/alerts/${alertId}`, { method: "PATCH", body: JSON.stringify(body) });
  },

  generateAlerts(animalId: string) {
    return request<{ generated: number; alertas: Alert[] }>(`/alerts/generate/${animalId}`, { method: "POST" });
  },

  tasks(params?: QueryParams) {
    return request<Task[]>("/tasks", {}, params);
  },

  task(taskId: string) {
    return request<Task>(`/tasks/${taskId}`);
  },

  createTask(body: Partial<Task>) {
    return request<Task>("/tasks", { method: "POST", body: JSON.stringify(body) });
  },

  completeTask(taskId: string, body?: Partial<Task>) {
    return request<Task>(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({
        estado: "ejecutada",
        fecha_ejecucion: new Date().toISOString(),
        resultado: "completada",
        ...body,
      }),
    });
  },

  updateTask(taskId: string, body: Partial<Task>) {
    return request<Task>(`/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  deleteTask(taskId: string) {
    return request<void>(`/tasks/${taskId}`, { method: "DELETE" });
  },

  animals(params?: QueryParams) {
    return request<Animal[]>("/animals", {}, params);
  },

  animal(animalId: string) {
    return request<Animal>(`/animals/${animalId}`);
  },

  createAnimal(body: Partial<Animal>) {
    return request<Animal>("/animals", { method: "POST", body: JSON.stringify(body) });
  },

  updateAnimal(animalId: string, body: Partial<Animal>) {
    return request<Animal>(`/animals/${animalId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  animalByCretal(crotal: string) {
    return request<Animal>(`/animals/search/by-crotal/${crotal}`);
  },

  incidents(params?: QueryParams) {
    return request<Incident[]>("/incidents", {}, params);
  },

  incident(incidentId: string) {
    return request<Incident>(`/incidents/${incidentId}`);
  },

  createIncident(body: CreateIncidentPayload) {
    return request<Incident>("/incidents", { method: "POST", body: JSON.stringify(body) });
  },

  updateIncident(incidentId: string, body: Partial<Incident>) {
    return request<Incident>(`/incidents/${incidentId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  incidentAttachments(incidentId: string) {
    return request<Attachment[]>(`/incidents/${incidentId}/adjuntos`);
  },

  uploadIncidentAttachment(incidentId: string, file: File) {
    return uploadFile<Attachment>(`/incidents/${incidentId}/adjuntos`, file);
  },

  deleteAttachment(attachmentId: string) {
    return request<void>(`/adjuntos/${attachmentId}`, { method: "DELETE" });
  },

  // T14 (ampliado): dictado por voz para campos de notas/observaciones.
  // `language` decide si el backend intenta primero Vosk (local) para ese
  // idioma antes de caer a OpenAI Whisper. El audio es efimero.
  transcribeAudio(blob: Blob, filename: string, language: string) {
    return uploadFile<{ texto: string }>("/transcripciones", blob, filename, { language });
  },

  treatments(params?: QueryParams) {
    return request<Treatment[]>("/treatments", {}, params);
  },

  treatment(treatmentId: string) {
    return request<Treatment>(`/treatments/${treatmentId}`);
  },

  createTreatment(body: Partial<Treatment>) {
    return request<Treatment>("/treatments", { method: "POST", body: JSON.stringify(body) });
  },

  updateTreatment(treatmentId: string, body: Partial<Treatment>) {
    return request<Treatment>(`/treatments/${treatmentId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  employees(params?: QueryParams) {
    return request<Employee[]>("/employees", {}, params);
  },

  createEmployee(body: Partial<Employee>) {
    return request<Employee>("/employees", { method: "POST", body: JSON.stringify(body) });
  },

  updateEmployee(employeeId: string, body: Partial<Employee>) {
    return request<Employee>(`/employees/${employeeId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  lactations(params?: QueryParams) {
    return request<Lactation[]>("/lactations", {}, params);
  },

  createLactation(body: Partial<Lactation>) {
    return request<Lactation>("/lactations", { method: "POST", body: JSON.stringify(body) });
  },

  updateLactation(lactationId: string, body: Partial<Lactation>) {
    return request<Lactation>(`/lactations/${lactationId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  qualitySummary() {
    return request<QualitySummary>("/lactations/quality/summary");
  },

  // T10.4: historial de cambios de zona de un animal.
  animalMovements(animalId: string, params?: QueryParams) {
    return request<AnimalMovement[]>(`/animals/${animalId}/movimientos`, {}, params);
  },

  // T10.1: calidad de leche de tanque/entrega a industria.
  tankQuality(params?: QueryParams) {
    return request<TankQualityReading[]>("/calidad/tanque", {}, params);
  },

  createTankQuality(body: Partial<TankQualityReading>) {
    return request<TankQualityReading>("/calidad/tanque", { method: "POST", body: JSON.stringify(body) });
  },

  predictions(animalId: string, params?: QueryParams) {
    return request<AnimalPrediction>(`/predictions/${animalId}`, {}, params);
  },

  productionPrediction(animalId: string, params?: QueryParams) {
    return request<AnimalPrediction["produccion"]>(`/predictions/production/${animalId}`, {}, params);
  },

  compositionPrediction(animalId: string) {
    return request<AnimalPrediction["composicion"]>(`/predictions/composition/${animalId}`);
  },

  healthRiskPrediction(animalId: string, params?: QueryParams) {
    return request<AnimalPrediction["riesgo_sanitario"]>(`/predictions/health-risk/${animalId}`, {}, params);
  },

  weather() {
    return request<WeatherData>("/weather/current");
  },

  farmSettings() {
    return request<FarmSettings>("/farm-settings");
  },

  updateFarmSettings(body: FarmSettings) {
    return request<FarmSettings>("/farm-settings", { method: "PUT", body: JSON.stringify(body) });
  },

  machinery(params?: QueryParams) {
    return request<Machinery[]>("/machinery", {}, params);
  },

  createMachinery(body: Partial<Machinery>) {
    return request<Machinery>("/machinery", { method: "POST", body: JSON.stringify(body) });
  },

  updateMachinery(machineryId: string, body: Partial<Machinery>) {
    return request<Machinery>(`/machinery/${machineryId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  // ── Orders (Pedidos) ──────────────────────────────────────────────────────

  orders(params?: QueryParams) {
    return request<OrdersResponse>("/pedidos", {}, params);
  },

  order(orderId: string) {
    return request<Order>(`/pedidos/${orderId}`);
  },

  createOrder(body: CreateOrderPayload) {
    return request<Order>("/pedidos", { method: "POST", body: JSON.stringify(body) });
  },

  updateOrder(orderId: string, body: Partial<Order>) {
    return request<Order>(`/pedidos/${orderId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  updateOrderStatus(orderId: string, estado: OrderStatus) {
    return request<Order>(`/pedidos/${orderId}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    });
  },

  // ── Shifts (Turnos) ───────────────────────────────────────────────────────

  shifts(params?: QueryParams) {
    return request<ShiftsResponse>("/turnos", {}, params);
  },

  createShift(body: CreateShiftPayload) {
    return request<Shift>("/turnos", { method: "POST", body: JSON.stringify(body) });
  },

  shiftAssignments(params?: QueryParams) {
    return request<ShiftAssignmentsResponse>("/asignaciones-turno", {}, params);
  },

  createShiftAssignment(body: CreateShiftAssignmentPayload) {
    return request<ShiftAssignment>("/asignaciones-turno", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // ── Handovers (Resúmenes de relevo) ───────────────────────────────────────

  shiftHandovers(params?: QueryParams) {
    return request<ShiftHandoversResponse>("/resumenes-relevo", {}, params);
  },

  createShiftHandover(body: { turno_saliente_id: string; turno_entrante_id: string; notas_saliente?: string }) {
    return request<ShiftHandover>("/resumenes-relevo", { method: "POST", body: JSON.stringify(body) });
  },

  // ── Weather (extended) ────────────────────────────────────────────────────

  weatherForecast() {
    return request<WeatherForecast>("/weather/forecast");
  },

  // ── Audit Log ─────────────────────────────────────────────────────────────

  auditLog(params?: QueryParams) {
    return request<AuditLogResponse>("/audit-log", {}, params);
  },

  // ── Task catalog ──────────────────────────────────────────────────────────

  taskCatalog(params?: QueryParams) {
    return request<TaskCatalogItem[]>("/tareas-catalogo", {}, params);
  },

  createTaskCatalog(body: Record<string, unknown>) {
    return request<TaskCatalogItem>("/tareas-catalogo", { method: "POST", body: JSON.stringify(body) });
  },

  updateTaskCatalog(catalogId: string, body: Record<string, unknown>) {
    return request<TaskCatalogItem>(`/tareas-catalogo/${catalogId}`, { method: "PUT", body: JSON.stringify(body) });
  },

  deleteTaskCatalog(catalogId: string) {
    return request<void>(`/tareas-catalogo/${catalogId}`, { method: "DELETE" });
  },

  // ── Weather readings (labelled version of sensor data) ────────────────────

  weatherReadings(params?: QueryParams) {
    return request<{ ubicacion: string; total: number; order: string; lecturas: unknown[] }>("/weather/readings", {}, params);
  },
};

// ── Unified Incident Normalizers ────────────────────────────────────────────

function alertEstadoToUnified(estado: AlertState): UnifiedEstado {
  switch (estado) {
    case "pendiente": return "abierta";
    case "revisada": return "en_gestion";
    case "resuelta": return "resuelta";
    case "falsa_alarma": return "cerrada";
    default: return "abierta";
  }
}

export function normalizeAlert(a: Alert): UnifiedIncident {
  return {
    id: `a:${a.id}`,
    rawId: a.id,
    origen: "alerta",
    titulo: a.tipo_alerta,
    descripcion: a.descripcion,
    severidad: (a.severidad === "critica" ? "alta" : a.severidad) as UnifiedSeverity,
    estado: alertEstadoToUnified(a.estado),
    fecha_creacion: a.fecha_creacion ?? new Date(0).toISOString(),
    fecha_resolucion: a.fecha_revision ?? null,
    zona_id: null,
    animal_id: a.animal_id ?? null,
    reportado_por: null,
    recomendacion: a.recomendacion ?? null,
    alertaEstado: a.estado,
  };
}

export function normalizeIncident(i: Incident): UnifiedIncident {
  return {
    id: `i:${i.id}`,
    rawId: i.id,
    origen: "incidencia",
    titulo: i.titulo || i.tipo.replace(/_/g, " "),
    descripcion: i.descripcion,
    severidad: i.prioridad,
    estado: i.estado,
    fecha_creacion: i.fecha_creacion ?? new Date(0).toISOString(),
    fecha_resolucion: i.fecha_resolucion ?? null,
    resolucion: i.resolucion ?? null,
    zona_id: i.zona_id ?? null,
    animal_id: i.animal_id ?? null,
    reportado_por: i.reportado_por ?? null,
    recomendacion: undefined,
    alertaEstado: undefined,
  };
}
