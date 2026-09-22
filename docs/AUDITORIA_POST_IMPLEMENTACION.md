# Auditoría post-implementación — TOOLS4Milk

**Fecha:** 2026-09-22
**Alcance:** con T1-T12 y T14-T17 completadas y T13 (Hermes) cancelada por decisión del cliente, esta auditoría busca **mejoras adicionales** no cubiertas por el trabajo ya hecho — huecos de seguridad, inconsistencias de contrato, deuda de frontend y riesgos de despliegue en Azure.
**Metodología:** cuatro auditorías de código independientes (seguridad backend, modelo de datos/contratos, frontend, infraestructura/Azure), cada una con instrucción explícita de citar archivo+línea y no especular. Este documento consolida y deduplica sus hallazgos.

> **Cómo leer este documento.** Igual que en `ESPECIFICACION_MEJORAS_TOOLS4MILK.md`: severidades **CRÍTICA/ALTA/MEDIA/BAJA** en vez de prioridades de tarea, porque esto es un informe de hallazgos, no un plan de ejecución. Cada hallazgo cita archivo y línea.

---

## 1. Resumen ejecutivo — lo más urgente

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | Las contraseñas demo (incluida `admin`) se **resetean solas en cada arranque** del backend a `testpass123` | **CRÍTICA** |
| 2 | Credenciales demo **hardcodeadas en el bundle del frontend** (botones de login rápido) | **CRÍTICA** |
| 3 | Volcados de BD con **hashes bcrypt reales trackeados en git** pese a estar listados en `.gitignore` | **CRÍTICA** |
| 4 | `SECRET_KEY` de desarrollo, público en el repo, sigue siendo válido si se olvida `ENVIRONMENT=production` | **ALTA** |
| 5 | Migraciones **no son seguras en despliegue multi-réplica** (Azure Container Apps con >1 instancia) | **ALTA** |
| 6 | `STORAGE_BACKEND` por defecto (`local`) **pierde fotos de incidencias silenciosamente** en un redespliegue en Azure | **ALTA** |
| 7 | En la vista tablet de zona, los modales de **tratamiento veterinario e incidencia se abren sin comprobar permisos** — cualquier rol los usa | **ALTA** |
| 8 | El turno de **noche añadido hoy (T10) es invisible en la rejilla semanal** de Turnos aunque se puede crear | **ALTA** |
| 9 | `POST /api/v1/weather/sync` **no requiere autenticación** | **ALTA** |
| 10 | **Sin rate limiting** en login ni en ningún endpoint (fuerza bruta, DoS de coste en transcripción) | **ALTA** |

El resto de hallazgos (~45) están detallados por área en las secciones siguientes.

---

## 2. Seguridad del backend

### CRÍTICA

**2.1 — Las contraseñas demo se resetean en cada arranque.**
`app/main.py:72-73` llama a `seed_demo_user()` sin ninguna guarda de entorno dentro de `lifespan`. `seed_demo_user()` (`app/main.py:111-182`) hace `UPDATE usuarios SET hashed_password = hash(settings.initial_demo_password) ... WHERE username = :username` para `admin`, `roberto.castro`, `operario.zona`, `laura.fernandez`, `dr.mendez` — **en cada arranque, sin condición**. `initial_demo_password` por defecto es `"testpass123"` (`app/config.py:22`; `docker-compose.yml:29`). Riesgo real: en Azure, cada reinicio de contenedor/réplica **resetea silenciosamente la contraseña de `admin`** a la del demo, incluso si el cliente ya la cambió en producción.

### ALTA

**2.2 — `validate_production_config()` solo actúa si `ENVIRONMENT` es literalmente `"production"`.**
`app/main.py:79-88`; el valor por defecto es `"development"` (`config.py:9`). Si se olvida la variable en el despliegue, **no se valida nada**: `SECRET_KEY` puede seguir siendo `"tools4milk-dev-secret-change-me"` (public, en el repo) y con esa clave cualquiera puede **forjar un JWT como `admin`** (`security.py:31-39`). Tampoco valida `initial_demo_password`, `admin_secret`, `debug` (por defecto `True`), ni que `database_url` no sea el sqlite por defecto.

**2.3 — `POST /api/v1/weather/sync` no tiene autenticación.**
`app/routers/weather.py:132-144` — a diferencia de todos los demás routers de dominio, no tiene `dependencies=[Depends(get_current_user)]`. Un llamador anónimo puede disparar llamadas ilimitadas a la API de AEMET y escrituras en BD.

**2.4 — Sin rate limiting ni bloqueo de cuenta en ningún endpoint.**
Confirmado: no hay `slowapi` ni librería equivalente en `requirements.txt`, y el único middleware registrado es CORS (`main.py:215`). `POST /api/v1/auth/login` (`routers/auth.py:28-35`) acepta intentos de bcrypt ilimitados — combinado con 2.1/2.6, un ataque de fuerza bruta contra los usuarios demo conocidos es trivial. Mismo problema en `POST /api/v1/admin/seed-data` (adivinar el token) y `POST /api/v1/transcripciones` (ver 2.5).

### MEDIA

**2.5 — DoS de coste en transcripción.** `routers/transcription.py:8-18` — cualquier usuario autenticado (sin comprobación de rol) puede subir audios de hasta 25 MB en bucle; el límite de tamaño se comprueba **después** de `await file.read()` (`transcription.py:13`), y sin modelo Vosk configurado cada llamada golpea la API de pago de OpenAI Whisper (`transcription_service.py:157-168`). Sin cuota ni límite de concurrencia.

**2.6 — Fuga de esquema SQL vía `str(exc)`.** `routers/shifts.py:73-74` y `routers/handovers.py:54-55` capturan `Exception` genérica y devuelven `detail=str(exc)` en un 422 — las excepciones de SQLAlchemy incluyen el `[SQL: INSERT INTO ...] [parameters: ...]` completo, saltándose el handler de saneamiento añadido en T15 (`main.py:224-235`, ver hallazgo 2.6 se aplica solo a estos dos routers porque atrapan la excepción ellos mismos antes de que llegue al handler global).

**2.7 — Body `dict` sin tipar en 10+ routers, con crashes concretos no cubiertos por el handler global.** Persisten en `animals.py`, `employees.py`, `incidents.py`, `lactations.py`, `machinery.py`, `treatments.py`, `zones.py`, `quality_tank.py`, además de los ya conocidos `tasks.py`/`orders.py`/`shifts.py`/`handovers.py`. Ejemplos verificados que producen **500 en vez de 422**: `POST /animals` sin `crotal_oficial` → `KeyError` (`repositories/animals_repository.py:47`); `POST /employees` sin `nombre` → `KeyError` (`employees_repository.py:28`); `POST /zones` con `orden: "abc"` → `ValueError` (`zones_repository.py:35`).

**2.8 — ID de zona controlable por el cliente.** `repositories/zones_repository.py:27` — `id=uuid.UUID(data["id"])` si el payload lo trae. Permite forzar UUIDs arbitrarios (colisión/sobrescritura) y un `id` malformado lanza `ValueError` → 500.

**2.9 — `audit_log` es de solo lectura en la práctica.** La tabla y el modelo existen (`models/tools4milk.py:486-487`) y se lee en `GET /api/v1/audit-log`, pero **nada en el código inserta en ella** (sin constructores `AuditLog(...)` en todo `app/`). Tampoco hay logging estructurado, request-id, ni registro de intentos de acceso denegado (`require_roles` en `security.py:69-78` lanza 403 sin loguear quién lo intentó).

### BAJA

**2.10 — `GET /health` expone recuento de tablas y filas sin autenticación** (`routers/health.py:12-31`).
**2.11 — `PUT /api/v1/pedidos/{id}` se salta la máquina de estados** que sí aplica `PATCH /pedidos/{id}/estado` (`orders.py:52-58` vs `:60-67`) — contenido por el ENUM de Postgres, pero rompe la integridad del flujo de negocio.
**2.12 — `ADMIN_SECRET` vacío falla cerrado (verificado, sin riesgo):** `admin.py:52-57` devuelve 503 si no está configurado. El riesgo residual es que la comparación de token no es de tiempo constante y la respuesta de éxito devuelve stdout/stderr del subprocess sin filtrar.

---

## 3. Modelo de datos y contratos

**Causa raíz común (afecta a todo §3.2):** SQLAlchemy 2.0 solo valida contra el `Enum` de Python cuando el valor ya es una instancia de ese enum; un `str` crudo de un payload `dict` se pasa tal cual a Postgres, que es quien finalmente rechaza el valor inválido con un `DataError` genérico (ahora convertido en un 422 sin nombre de campo por el handler de T15, pero sin validación de campo real). Esto es exactamente la misma clase de bug que provocó los 3 tests rotos al mover T15 a Postgres real — persiste sin corregir en el resto de la API.

### ALTA

**3.1 — `tipo_turno` en el baseline SQL no incluye `'noche'`.** `database/init.sql:28` y `migrations/0002b_baseline_tools4milk.sql:21` definen el enum solo con `('manana','tarde')`; la migración `0014` lo amplía, pero cualquier base de datos creada directamente desde `init.sql` sin pasar por `apply_migrations.py` (p. ej. un `docker-compose down -v && up` que solo re-ejecute el init script) **rechazará turnos de noche y hará fallar `seed_explotacion.py`**. Nótese la inconsistencia: `nivel_severidad` sí se baselinó con `'critica'` incluida — el criterio no se aplicó de forma uniforme.

**3.2 — Escrituras de ENUM sin validar en la capa de repositorio**, con Postgres como única red de seguridad (rechaza con 422 genérico, sin decir qué campo falló):
- `employees_repository.py:30,46-53` (`rol_empleado`)
- `machinery_repository.py:39,55-65` (`tipo_maquinaria`)
- `animals_repository.py:49,52,53` (`sexo_animal`, `estado_animal`, `estado_reproductivo`)
- `orders_repository.py:37,54-58,67` (`estado_pedido`)
- `incidents_repository.py:69,71,89-103` (`tipo_incidencia`, `nivel_severidad`, `estado_incidencia`)

Por contraste, `tasks_repository` y `alerts_repository` sí mapean/normalizan antes de escribir — el patrón correcto ya existe en el código, solo falta aplicarlo al resto.

**3.3 — `frontend/src/lib/types.ts:122` declara `Animal.estado` con un valor `"crianza"` que no existe** en el enum real `estado_animal` ni en `EstadoAnimal` (Python). El frontend cree que es un valor legal; enviarlo produce un 422 en un campo que su propio tipo dice que es válido.

**3.4 — Datos de retirada de leche no se sirven aunque existen.** `services/treatments_service.py:16-17` fuerza `periodo_retirada_dias` y `fecha_fin_retirada` a `None` siempre, pero el dato real (`EventoSanitario.periodo_retirada_hasta`) sí se genera y se guarda. Es un dato de seguridad alimentaria (cuándo la leche de un animal tratado vuelve a ser apta) que existe en la BD pero nunca llega a la UI.

### MEDIA

**3.5 — `AlertaUmbral.nivel_alerta` está mapeado como `String(20)` en el ORM** (`models/tools4milk.py:321`) pero la columna real en BD es el enum nativo `nivel_alerta` — cualquier escritura ORM a `alertas_umbrales` envía texto a una columna enum (contrastar con `Alerta.nivel:338`, que sí está bien tipado).

**3.6 — Una alerta "crítica" se degrada silenciosamente a "alta".** `repositories/alerts_repository.py:90` mapea `"critica"` → `NivelAlerta.ALTA` porque el enum de alertas nunca se amplió como sí se hizo con incidencias en T8. `types.ts:45` declara que el frontend puede enviar `"critica"` — nunca sobrevive al guardado.

**3.7 — Campos de contrato inconsistentes con lo que el frontend espera como no-nulo.** `tasks_service.py:19-20` emite siempre `categoria: None, frecuencia: None`, pero `types.ts:86-87` los declara **no-nulos**. `tasks_service.py:12` devuelve `tiempo_ejecucion_minutos` como número; `types.ts:101` lo declara `string | null`.

**3.8 — Varios bugs de realismo en `seed_explotacion.py` (T11):**
- `:552` genera eventos reproductivos (celo/inseminación/parto) sobre el censo completo, incluidos terneros de 3-60 días y machos — fechas de evento **anteriores al nacimiento del animal**, y eventos reproductivos en machos.
- `:1024-1027` genera lecturas de ordeño con fecha anterior al parto de la lactación a la que apuntan.
- `:504-511` produce primeros partos a ~13.6 meses de edad, contradiciendo el propio comentario del script (`≥22 meses`, línea 503).
- `:1081-1084` asigna box físico a terneros que en realidad viven en la zona general de recría, no en boxes.
- `:322` marca al último empleado como `activo=False`, pero se sigue usando en `MovimientoAnimal`, `EventoSanitarioRecria`, `Incidencia.reportado_por/asignado_a` y `Pedido.solicitante_id` — FKs apuntando a un empleado inactivo.

### BAJA

**3.9** — `apply_migrations.py:78` envuelve todas las migraciones en una sola transacción; los `ALTER TYPE … ADD VALUE` (`0009`, `0014`) son seguros solo mientras ninguna migración posterior use el valor nuevo — restricción real pero no documentada en el propio runner, solo en comentarios de las migraciones.
**3.10** — `machinery_service.py:11` reporta `estado="baja"` cuando `activa=False`, pero el repositorio también acepta `"inactiva"` — el valor no hace ida y vuelta.
**3.11** — `treatments_service.py:19,21` — `motivo` siempre `None`, aunque `treatments_repository.py:78` sí lo escribe (en `notas`, que se sirve como `observaciones` — el campo cambia de nombre en el camino de vuelta).
**3.12** — `lactations_service.py:21` usa un divisor fijo de 305 días para la producción media incluso en lactaciones en curso, infravalorando el promedio real.
**3.13** — `seed_explotacion.py:1115` genera pedidos cancelados con `ts_aprobacion` (una aprobación que no debería existir). `:1055` agrupa todas las lecturas de robot entre las 00:00 y ~09:00 UTC.
**3.14** — `PURGE_ORDER` en `seed_explotacion.py` (líneas 205-219) no incluye `Genomica` ni `LecturaCarroMezclador` — si alguna vez tienen filas, `--purge` fallará por FK.
**3.15** — `aemet_client.py:99,112` guarda un datetime naive en una columna `TIMESTAMPTZ`, interpretado con el timezone del servidor.

**Nota positiva verificada:** las columnas `GENERATED ALWAYS AS STORED` (`indice_thermo_humedad`, `desviacion_pct`) están correctamente excluidas de los modelos ORM y ningún repositorio, servicio ni script intenta escribirlas. Sin hallazgos aquí.

---

## 4. Frontend — calidad, accesibilidad, i18n

### ALTA

**4.1 — El botón de dictado por voz (T14) está 100% en español hardcodeado.** `components/ui/voice-to-text-button.tsx` importa `useTranslation` pero solo usa `i18n.language`; todos los textos visibles ("Dictar", "Detener", "Transcribiendo…", mensajes de error) son literales. No existe ninguna clave `voice`/`dictar`/`transcrib` en `locales/{en,gl,fr,ar}.json`. El botón que añadí en esta sesión queda **inutilizable en los otros 4 idiomas**, incluido árabe RTL.

**4.2 — Dos modales se abren sin comprobar permisos en la vista tablet de zona.** `app/(app)/zones/[id]/page.tsx:250,252` calculan `canManageTreatments` y `canCreateIncidents`, pero `:311-312` pasan los callbacks a `ZoneTabletView` **sin condición** — a diferencia de `canCompleteTasks`, que sí se usa (`:251` → `:310`). Cualquier rol logueado puede abrir el modal de tratamiento veterinario y crear incidencias desde la tablet. Esto es del mismo tipo que los huecos de permisos que cerré en T15 para pedidos/turnos/relevos — quedó sin cubrir en esta vista concreta.

**4.3 — El turno de noche (añadido hoy en T10) es invisible en la rejilla semanal.** `app/(app)/shifts/page.tsx`: `noche` existe en `SHIFT_LABELS`, `SHIFT_HOURS`, `SHIFT_CELL_STYLES` y el modal de creación lo ofrece, pero las filas de empleado del Gantt (`:428-442`), las celdas por día (`:469-493`), los KPIs (`:637-638`) y la leyenda (`:644-651`) están hardcodeados a `manana`/`tarde` únicamente. **Se puede crear un turno de noche y luego desaparece de la vista semanal** — exactamente el riesgo que anticipé al dejar el Gantt sin tercera fila por alcance, ahora confirmado como un hueco real, no cosmético.

**4.4 — La página de Turnos no tiene i18n en absoluto.** `shifts/page.tsx` no importa `useTranslation` en sus 672 líneas; ~60 literales en español ("Turnos", "Nuevo turno", "Hoy", "Mañana"/"Tarde", tooltips). Las claves ya existen en los 5 locales (p. ej. `shiftNight`) pero no se usan. Además `toLocaleDateString("es-ES", …)` está hardcodeado (`:554-555`) — las fechas del calendario semanal salen en español pase lo que pase con el idioma activo.

### MEDIA

**4.5 — Errores de API silenciados en Calidad.** `app/(app)/quality/page.tsx` no tiene ningún `isError`/`onError`/toast — un 500 se ve idéntico a "sin datos". Compárese con `orders/page.tsx` e `incidents/page.tsx`, que sí muestran error explícito.
**4.6 — Errores de listado no gestionados en Turnos.** Solo se comprueba `isLoading`; un fallo en la consulta semanal renderiza un Gantt vacío sin avisar.
**4.7 — Tres mutaciones de la tablet de zona sin manejo de error ni toast** (`components/zone/ZoneTabletView.tsx:136-166`: iniciar tarea, completar tarea, añadir nota) — en un contexto de manos ocupadas/conexión inestable, un fallo no da ninguna señal.
**4.8 — La columna "completadas" del Kanban de tablet nunca se renderiza.** `ZoneTabletView.tsx:170` calcula `completedTasks` pero solo `pendingTasks`/`inProgressTasks` tienen sección visible — funcionalidad a medio construir, no código muerto.
**4.9 — Estados de color puro en KPIs sin icono de respaldo**, contra la propia regla UX11 del proyecto ("sin depender del color"): `KpiCard` permite `Icon` opcional; verificado sin icono en `incidents/page.tsx`, `orders/page.tsx`, `shifts/page.tsx`, `zones/page.tsx`, `zones/[id]/page.tsx`.
**4.10 — Botones de navegación de semana sin nombre accesible.** `shifts/page.tsx:602-608,623-629` — chevrones sin `aria-label` ni `title`; el archivo entero tiene cero atributos `aria-label` (el repo completo solo tiene 8 en total).
**4.11 — El botón de dictado no usa la región viva ya existente.** Hay un `#app-live-region` global (`components/providers/app-providers.tsx:38`) sin usar; los cambios de estado grabando→transcribiendo y los errores no se anuncian a lectores de pantalla.
**4.12 — `brand-logo.tsx` usa `<img>` en vez de `next/image`**, con un `style` inline que sobrescribe `width`/`height` → salto de layout (CLS) en el primer render, en un componente que se pinta en todas las páginas.

### BAJA

**4.13 — Una sola regresión RTL real** tras un barrido completo de clases físicas (`ml-`, `pl-`, `text-left`, `border-l-`, etc. — cero coincidencias en Bento/KPI/panel): `ml-auto` (debería ser `ms-auto`) en 11 sitios: `shifts/page.tsx:193`, `quality/page.tsx:193,486`, `audit-log/page.tsx:63,315`, `animals/[id]/page.tsx:272,325`, `handover/tablet/page.tsx:444`, `ZonePlanView.tsx:603`, `WeatherPanel.tsx:91`, `LastHandoverCard.tsx:63` — empuja insignias/timestamps al lado equivocado en árabe.
**4.14 — Código muerto confirmado, seguro de borrar:** `type GanttCell` (`shifts/page.tsx:321`), `function formatDate` en `ZoneKanbanView.tsx:13`, `todayShiftsCount` en `shifts/page.tsx:551`.
**4.15 — Prop `zones` no usado en ambos lados** (`ZoneTabletView.tsx:119,126` y `GanttView` en `shifts/page.tsx:328,337`) — limpiar requiere tocar también las llamadas.
**4.16 — "Marcar como leído" del último relevo no persiste.** `zones/[id]/page.tsx:220` (`lastHandoverRead`) se fija localmente pero nunca se envía a la API — no sobrevive a un refresco de página.

**Verificado sin hallazgos:** estados de carga (skeletons dimensionados correctamente, sin salto de layout) y paridad exacta de claves de traducción (229 en cada uno de los 5 locales) — los huecos de i18n de arriba son claves que faltan añadir, no traducciones a medias.

---

## 5. Infraestructura y despliegue en Azure

### CRÍTICA

**5.1 — Credenciales demo hardcodeadas en el bundle del frontend.** `frontend/src/features/auth/login-screen.tsx:28-34` — array de 5 usuarios + `password: "testpass123"` con botones de "login rápido", sin ninguna condición de entorno. Cualquiera que abra la URL pública en Azure obtiene credenciales de administrador **leyendo el JavaScript del cliente**.

**5.2 — Volcados de base de datos con hashes reales, trackeados en git.** `backups/local_tools4milk_20260603_091153.sql` (y 3 ficheros hermanos, ~530 KB cada uno) contienen el bloque `COPY` de `usuarios` con hashes bcrypt reales de `admin`/`roberto.castro`/etc., más datos completos de la explotación. `.gitignore` lista `backups/`, pero `git ls-files` confirma que **los 5 ficheros están trackeados** — la regla de ignore nunca surtió efecto (se añadieron antes de existir la regla, o con `git add -f`). Estos hashes y datos llevan en el historial de git desde antes de esta sesión.

### ALTA

**5.3 — Migraciones sin bloqueo en despliegue multi-réplica.** El comando de arranque (`docker-compose.yml:59`) es `python scripts/apply_migrations.py && uvicorn ...`. `apply_migrations.py:78-115` no usa `pg_advisory_lock` ni ningún mecanismo de bloqueo — con más de una réplica de Azure Container Apps arrancando a la vez, **dos instancias pueden intentar aplicar la misma migración simultáneamente**, provocando un deadlock de DDL o un error de objeto duplicado que aborta el arranque del contenedor.

**5.4 — `validate_production_config()` no cubre lo que realmente importa en Azure.** Además de lo ya señalado en 2.2: no comprueba que `DATABASE_URL` no sea el sqlite por defecto (`config.py:7`, así que si se olvida la variable, la app arranca sobre un fichero sqlite efímero y la validación **pasa igualmente**); no comprueba que `AZURE_STORAGE_CONNECTION_STRING` esté definida cuando `storage_backend="azure_blob"` (una cadena vacía llega a `BlobServiceClient.from_connection_string` y falla de forma opaca en la primera subida, no al arrancar).

**5.5 — Almacenamiento local pierde fotos en Azure sin ningún aviso.** `storage_backend` por defecto es `"local"` (`config.py:32`; `docker-compose.yml:36`), que escribe en `/app/media/adjuntos` mediante un simple `mkdir`. En Azure Container Apps o App Service sin un montaje explícito de Azure Files, **cada foto de incidencia se pierde en cada redespliegue o reinicio**, sin ninguna advertencia en tiempo de arranque — solo comentarios de prosa en el código.

### MEDIA

**5.6 — `docker-compose.yml` es solo para desarrollo pero no está señalizado como tal.** Contraseña de Postgres hardcodeada, `SECRET_KEY` y `INITIAL_DEMO_PASSWORD` con los valores de desarrollo como fallback, puerto 5432 publicado al host, `ENVIRONMENT` por defecto `development` (lo que además desactiva la validación de 2.2). No existe un `docker-compose.prod.yml` ni una cabecera que diga "solo desarrollo local".

**5.7 — Dockerfile del backend corre como root, imagen de un solo stage con dependencias de test incluidas.** Sin directiva `USER`; instala `pytest`/`pytest-asyncio` (necesarias solo para tests) junto con `vosk` y `azure-storage-blob` en la imagen de producción. El `HEALTHCHECK` del Dockerfile es ignorado por Azure Container Apps (necesita definirse en la configuración de Azure aparte). El Dockerfile del frontend, en cambio, **ya está bien**: build multi-stage, usuario `nextjs` no-root, output standalone.

**5.8 — No existe ningún pipeline de CI/CD.** Sin `.github/workflows`, sin `azure-pipelines.yml`. Un CI mínimo para el backend necesita un contenedor de servicio `postgres:15` y la variable `TEST_DATABASE_URL` (conftest.py la usa desde T15), más ejecutar `apply_migrations.py` antes de `pytest`.

### BAJA

**5.9** — `/docs` y `/redoc` expuestos sin ninguna restricción de entorno (`main.py:205-206`).
**5.10** — El volumen `./backend/vosk_models:/app/vosk_models:ro` es un bind mount local que no existe en Azure — **verificado que degrada bien**: si la ruta no existe, `vosk_model_paths` queda vacío y el código cae a OpenAI Whisper sin error de arranque; solo falla en tiempo de petición si además falta `OPENAI_API_KEY`.
**5.11** — No hay ningún `.env` trackeado en git ni claves de API/tokens hardcodeadas en ficheros versionados (`sk-`, `AKIA`, `ghp_`, `AccountKey=` — cero coincidencias fuera de los defaults de desarrollo ya señalados en 5.1/5.6).

---

## 6. Qué haría primero

Sin comprometerme a un plan de ejecución (el usuario decide el orden), los tres hallazgos que darían más valor por el esfuerzo mínimo que requieren:

1. **5.2 (backups en git)** — decidir si se reescribe el historial o se rota toda credencial que aparezca en esos volcados; es lo único de esta lista que no se arregla solo tocando código nuevo.
2. **2.1 + 5.1** — dejar de resetear la contraseña demo en cada arranque y quitar (o poner tras un flag de entorno) el login rápido con credenciales visibles en el bundle. Es la combinación que hace trivial un acceso de administrador no autorizado.
3. **4.2** — cablear `canManageTreatments`/`canCreateIncidents` en la vista tablet de zona; es el único hallazgo de esta auditoría que es, literalmente, "una línea sin usar una variable que ya existe".

El resto son mejoras reales pero de menor urgencia inmediata, priorizables según lo que el cliente valore más (cierre de T10/T14 en frontend, endurecimiento de Azure, o limpieza de contratos de datos).
