# Integración de un módulo externo de análisis de datos

Documento de referencia para incorporar un módulo de análisis de datos desarrollado por un tercero dentro de la arquitectura actual de Tools4Milk. No implica cambios de código; describe opciones y el punto de anclaje recomendado.

## 1. Arquitectura actual (resumen)

```
proyecto-tfm-mvp/
├── backend/app/
│   ├── main.py, config.py, database.py, security.py
│   ├── models/        (SQLAlchemy: tools4milk.py, usuario.py, ...)
│   ├── routers/       (endpoints /api/v1/*, JWT vía security.py)
│   ├── schemas/       (Pydantic: analytics.py, api.py, ...)
│   ├── services/      (lógica de negocio, ej. predictions_service.py)
│   └── repositories/  (acceso a datos)
├── frontend/src/lib/  (api.ts cliente compartido + api-analytics.ts, ...)
├── database/init.sql, backend/migrations/ (SQL versionado)
└── docker-compose.yml (db, backend, frontend, nginx)
```

- **Backend**: FastAPI + SQLAlchemy 2.0 + PostgreSQL (fallback SQLite en dev). Autenticación JWT Bearer (`security.py`), sin OAuth.
- **API**: prefijo `/api/v1`, routers por dominio registrados en `main.py`.
- **Analítica existente**: `services/predictions_service.py` implementa predicciones **heurísticas** (deliberadamente no ML, por transparencia — ver `docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md`, tarea T16), expuestas en `routers/predictions.py` (`GET /api/v1/predictions`). Es el precedente más cercano a lo que haría el módulo externo.
- **Frontend**: Next.js 16 + React 19, consume la API vía `frontend/src/lib/api.ts` (cliente compartido con token JWT) y clientes especializados como `api-analytics.ts`.
- **Despliegue**: Docker Compose local (db + backend + frontend + nginx); en producción, variable `DATABASE_URL` provista por Railway.

## 2. Opciones de integración

### Opción A — Servicio externo independiente (recomendada)
El módulo de la persona externa se despliega como su **propio servicio** (contenedor/API), separado del backend actual. El backend de Tools4Milk actúa de *gateway*:

1. Se añade un nuevo router, p. ej. `backend/app/routers/external_analytics.py`, con prefijo `/api/v1/analytics-externo`.
2. Ese router llama al servicio externo por HTTP (o gRPC) desde un `services/external_analytics_client.py`, pasando los datos ya autenticados/autorizados por el backend (el usuario nunca habla directo con el módulo externo).
3. La URL/credenciales del servicio externo se configuran como variables de entorno en `config.py` (patrón ya usado para `DATABASE_URL`, claves de terceros, etc.).
4. El frontend consume el nuevo endpoint igual que los demás, mediante un nuevo `api-analytics-externo.ts` que reutiliza `request()` de `lib/api.ts`.

**Ventajas**: aislamiento total (el código de la persona externa no entra al monorepo ni comparte dependencias), despliegue y ciclo de vida independientes, más fácil de auditar/limitar en seguridad.
**Coste**: latencia de red extra, hay que gestionar autenticación servicio-a-servicio (API key o JWT interno) y manejo de errores/timeouts.

### Opción B — Librería/paquete integrado en el backend
Si el análisis es un paquete Python (o un microservicio ligero que se puede empaquetar), se añade como dependencia en `backend/requirements.txt` y se invoca desde un nuevo `services/external_analytics_service.py`, siguiendo el mismo patrón que `predictions_service.py`.

**Ventajas**: sin latencia de red, reutiliza directamente los modelos ORM (`models/tools4milk.py`) sin serializar/deserializar por HTTP.
**Coste**: el código de un tercero pasa a ejecutarse dentro del proceso del backend (mismo entorno, mismas dependencias, mismo despliegue) — mayor superficie de riesgo si el módulo no está auditado, y acopla su ciclo de vida al del backend.

### Opción C — Job asíncrono / batch
Si el análisis es pesado o no necesita respuesta inmediata (ej. informes periódicos, modelos que tardan minutos), se ejecuta como job separado (cron, worker) que escribe resultados en tablas nuevas de PostgreSQL, y el backend simplemente expone esos resultados ya calculados vía un router de solo lectura.

**Ventajas**: no bloquea la API principal, encaja bien con datos que no cambian en tiempo real (ej. analíticas de tanque, tendencias históricas).
**Coste**: los resultados no son en tiempo real; requiere migraciones para las tablas de salida y un mecanismo de scheduling (ej. Railway cron, GitHub Actions, `pg_cron`).

## 3. Puntos de anclaje concretos en el código actual

| Necesidad | Dónde encaja |
|---|---|
| Nuevo endpoint de API | `backend/app/routers/` + registrar en `main.py` (líneas 286-308) |
| Esquemas de entrada/salida | `backend/app/schemas/analytics.py` (ya existe convención de filas planas tipo `PredictionTableRow`) |
| Config (URL, API key del módulo externo) | `backend/app/config.py` (Pydantic Settings, variables de entorno) |
| Autenticación | Reutilizar `Depends(get_current_user)` de `security.py`; si el módulo externo necesita su propia clave, añadir un `X-API-Key` interno gestionado en el gateway, nunca expuesto al frontend |
| Persistencia de resultados (si aplica) | Nueva migración en `backend/migrations/`, siguiendo el patrón numerado existente (`0000_...sql` … `0016_...sql`) |
| Consumo desde frontend | Nuevo `frontend/src/lib/api-analytics-externo.ts`, reutilizando `request()` de `api.ts` |
| Despliegue | Si es servicio independiente (Opción A), añadir un nuevo servicio en `docker-compose.yml`; en Railway, un nuevo servicio con su propia variable `DATABASE_URL`/URL pública |

## 4. Preguntas a resolver con la persona externa antes de integrar

1. **Forma del módulo**: ¿es una API HTTP ya desplegada, un paquete Python, o un script que hay que containerizar?
2. **Contrato de datos**: ¿qué inputs necesita (qué tablas/campos de `models/tools4milk.py`) y en qué formato devuelve resultados?
3. **Latencia y frecuencia**: ¿respuesta síncrona por request, o batch/periódico?
4. **Requisitos de infraestructura**: ¿necesita GPU, librerías pesadas (numpy/pandas/sklearn), variables de entorno propias?
5. **Seguridad**: ¿el código es auditable? ¿maneja datos sensibles (identificación de animales, ubicación de explotación) que deban anonimizarse antes de enviarse?
6. **Ciclo de vida**: ¿quién mantiene el módulo a futuro? Esto determina si conviene la Opción A (aislado) frente a la B (integrado).

## 5. Recomendación

Dado que el proyecto ya separa claramente `services/` por dominio y tiene precedente de un módulo analítico (`predictions_service.py`) documentado como heurístico "por transparencia", lo más consistente con la arquitectura y con menor riesgo es la **Opción A** (servicio externo independiente detrás de un router-gateway). Permite evaluar el módulo de la persona externa sin comprometer la base de código ni el despliegue actual, y si en el futuro se decide "internalizarlo", migrar a la Opción B es un cambio localizado (mover la llamada HTTP a una llamada de función).

## 6. Arquitectura recomendada (Opción A) — Diagrama

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Next.js 16 + React 19)                            │
│  └─ api-analytics-externo.ts (request() vía lib/api.ts)     │
└────────────────────┬────────────────────────────────────────┘
                     │ GET /api/v1/analytics-externo/report?...
┌────────────────────▼────────────────────────────────────────┐
│ Backend Gateway (FastAPI + SQLAlchemy)                      │
│  ├─ router: routers/external_analytics.py                  │
│  │   └─ autenticación: Depends(get_current_user)           │
│  └─ client: services/external_analytics_client.py          │
│      └─ HTTP POST → http://external-analytics:5000/analyze │
└────────────────────┬────────────────────────────────────────┘
                     │ (datos limpiados + token interno)
┌────────────────────▼────────────────────────────────────────┐
│ Módulo Externo (servicio independiente)                     │
│ ├─ Framework: Flask/FastAPI/Node.js/...                    │
│ ├─ Entrada: JSON con datos de ganado/tanques               │
│ └─ Salida: resultados de análisis (JSON)                   │
└─────────────────────────────────────────────────────────────┘
```

## 7. Flujo de implementación paso a paso

### Fase 1: Preparación (sin cambio de código)

1. **Resolver preguntas de la Sección 4** con la persona externa.
2. **Documentar el contrato de datos**:
   - Qué campos de `models/tools4milk.py` se necesitan (ej. `animal_id`, `tanque_id`, `fecha_medicion`).
   - Formato exacto de entrada (JSON, CSV, protobuf).
   - Formato exacto de salida (schema de respuesta esperada).
3. **Definir SLA**: latencia máxima, timeouts, política de reintento.

### Fase 2: Adaptación del backend (2–4 horas)

1. **Crear esquemas Pydantic** en `backend/app/schemas/analytics.py`:
   ```python
   # Entrada
   class ExternalAnalysisRequest(BaseModel):
       animal_ids: List[int]
       start_date: date
       end_date: date
   
   # Salida
   class ExternalAnalysisResult(BaseModel):
       animal_id: int
       score: float
       risk_level: str  # "low", "medium", "high"
       recommendations: List[str]
   ```

2. **Crear cliente HTTP** en `backend/app/services/external_analytics_client.py`:
   ```python
   from httpx import AsyncClient, HTTPError
   from app.config import settings
   
   class ExternalAnalyticsClient:
       def __init__(self):
           self.base_url = settings.EXTERNAL_ANALYTICS_URL
           self.api_key = settings.EXTERNAL_ANALYTICS_KEY
       
       async def analyze(self, request: ExternalAnalysisRequest) -> List[ExternalAnalysisResult]:
           async with AsyncClient() as client:
               response = await client.post(
                   f"{self.base_url}/analyze",
                   json=request.dict(),
                   headers={"X-API-Key": self.api_key},
                   timeout=30.0
               )
               response.raise_for_status()
               return [ExternalAnalysisResult(**item) for item in response.json()]
   ```

3. **Añadir variables de entorno** en `backend/app/config.py`:
   ```python
   EXTERNAL_ANALYTICS_URL: str = Field(default="http://localhost:5000")
   EXTERNAL_ANALYTICS_KEY: str = Field(default="dev-key")
   EXTERNAL_ANALYTICS_TIMEOUT: int = Field(default=30)
   ```

4. **Crear router** en `backend/app/routers/external_analytics.py`:
   ```python
   from fastapi import APIRouter, Depends
   from app.security import get_current_user
   from app.services.external_analytics_client import ExternalAnalyticsClient
   from app.schemas.analytics import ExternalAnalysisRequest, ExternalAnalysisResult
   
   router = APIRouter(prefix="/analytics-externo", tags=["external-analytics"])
   
   @router.post("/report", response_model=List[ExternalAnalysisResult])
   async def get_external_analysis(
       request: ExternalAnalysisRequest,
       current_user = Depends(get_current_user)
   ):
       """Análisis de ganado realizado por módulo externo."""
       client = ExternalAnalyticsClient()
       return await client.analyze(request)
   ```

5. **Registrar router** en `backend/app/main.py` (líneas ~305):
   ```python
   from app.routers import external_analytics
   app.include_router(external_analytics.router, prefix="/api/v1")
   ```

### Fase 3: Cliente frontend (1–2 horas)

1. **Crear cliente especializado** `frontend/src/lib/api-analytics-externo.ts`:
   ```typescript
   import { request } from "./api";
   
   export interface AnalysisRequest {
     animal_ids: number[];
     start_date: string;
     end_date: string;
   }
   
   export interface AnalysisResult {
     animal_id: number;
     score: number;
     risk_level: "low" | "medium" | "high";
     recommendations: string[];
   }
   
   export async function getExternalAnalysis(
     req: AnalysisRequest
   ): Promise<AnalysisResult[]> {
     return request<AnalysisResult[]>("/analytics-externo/report", {
       method: "POST",
       body: JSON.stringify(req),
     });
   }
   ```

2. **Usar en componentes React** (ej. `IncidentView.tsx`):
   ```typescript
   const results = await getExternalAnalysis({
     animal_ids: [123, 456],
     start_date: "2026-09-01",
     end_date: "2026-09-24"
   });
   ```

### Fase 4: Despliegue (1–2 horas)

1. **Local (Docker Compose)**: Añadir servicio en `docker-compose.yml`:
   ```yaml
   external-analytics:
     image: external-analytics:latest
     ports:
       - "5000:5000"
     environment:
       - API_KEY=dev-key
   ```

2. **Producción (Railway)**:
   - Crear nuevo servicio en Railway console.
   - Asignar variables de entorno (`EXTERNAL_ANALYTICS_URL`, `EXTERNAL_ANALYTICS_KEY`).
   - Backendología obtiene URL pública del nuevo servicio.

## 8. Consideraciones de seguridad

| Riesgo | Mitigación |
|--------|-----------|
| **Datos sensibles** (identidad animal, ubicación explotación) | Anonimizar antes de enviar; usar hashes de IDs si es posible, no coordenadas GPS sin cifrar |
| **Inyección HTTP** en la llamada al módulo externo | Validar todos los inputs en Pydantic; usar `httpx` con `timeout` y reintentos limitados |
| **API key expuesta** | Usar variable de entorno, nunca en código; en Railway, usar secreto (no env variable plana) |
| **Timeout infinito** | Hardcodear timeout en cliente (`timeout=30.0`); monitorear en logs |
| **Módulo externo caído** | Gestionar excepciones `HTTPError`; devolver respuesta parcial o error 503 al frontend; loguear incidente |
| **Autenticación entre backend ↔ módulo** | Si está en la misma VPN (Docker, Railway), usar `X-API-Key` interno; si es público, cifrar JWT firmado |

## 9. Pruebas y validación

1. **Unitarias (backend)**:
   - Mock de `ExternalAnalyticsClient` en tests de router.
   - Verificar que malformed requests devuelven 400.

2. **Integración (local con Docker Compose)**:
   - Levantar backend + módulo externo.
   - Llamar a `POST /api/v1/analytics-externo/report` con usuario autenticado.
   - Verificar que respuesta tiene schema esperado.

3. **E2E (frontend)**:
   - Simular análisis en vista de incidentes.
   - Mostrar resultados en tabla/gráfico.
   - Verificar manejo de errores (timeout, módulo no disponible).

4. **Carga**:
   - Si el módulo es pesado, definir límite de requests concurrentes en backend (p. ej. máximo 5 análisis paralelos).

## 10. Checklist de implementación

- [ ] Respuestas documentadas de persona externa (Sección 4).
- [ ] Esquemas Pydantic creados en `schemas/analytics.py`.
- [ ] `ExternalAnalyticsClient` implementado con reintentos y timeouts.
- [ ] Router registrado en `main.py` y probado localmente.
- [ ] Variables de entorno en `config.py` y documentadas.
- [ ] Cliente TypeScript `api-analytics-externo.ts` creado.
- [ ] Tests unitarios + integración pasando.
- [ ] `docker-compose.yml` actualizado.
- [ ] Documentación de API en Swagger accesible.
- [ ] Railway: nuevo servicio y variables configuradas.
- [ ] Monitoreo: logs en backend capturando latencia y errores.

## 11. Próximos pasos

1. **Contactar a persona externa**: formular preguntas de Sección 4.
2. **Crear rama**: `feature/external-analytics-integration`.
3. **Implementar Fases 1–2** (backend) en esta rama.
4. **Review con equipo** antes de Fase 3 (frontend).
5. **Deploy a staging** (Railway) para validar con datos reales.
6. **Merge a main** cuando validación sea exitosa.
