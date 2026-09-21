# Especificación técnica de mejoras — TOOLS4Milk

**Destinatario:** Codey (agente de implementación)
**Autor del análisis:** auditoría de código sobre el repositorio `proyecto-tfm-mvp`
**Fecha:** 2026-09-21
**Naturaleza:** documento de planificación. No se ha modificado código ni base de datos.

> **Cómo leer este documento.** Todo lo marcado como **[VERIFICADO]** procede de lectura directa del código, con ruta y línea. Todo lo marcado como **[DECISIÓN]** requiere confirmación humana antes de implementar. Todo lo marcado como **[BLOQUEANTE]** impide ejecutar la tarea hasta resolverlo. No se ha inventado ningún endpoint, tabla ni campo que no se haya comprobado.

---

## 1. Resumen ejecutivo

El encargo agrupa 15 bloques de mejora sobre una aplicación que ya está funcionalmente construida. La auditoría arroja cuatro conclusiones que cambian la planificación respecto a lo que el encargo daba por supuesto:

1. **El rebranding es barato, no caro.** El 95 % de la interfaz consume tokens de diseño (~1.700 usos de `brand`/`app-*`/`tv-*`/`state-*` en 49 archivos). Cambiando dos bloques de `globals.css` la paleta se propaga sola. El trabajo manual real son 133 colores hex escritos a mano, de los cuales **el 77 % está en 3 archivos**.

2. **El modo televisión no existe como tal.** No hay ni una sola llamada a la Fullscreen API en todo el frontend. Hoy `/tv` es una ruta normal sin barra lateral. Lo que pide el encargo ("que ocupe literalmente toda la pantalla y funcione como pantalla de monitorización") es **desarrollo nuevo**, no un ajuste de estilos.

3. **Hay bugs de contrato que dejan funcionalidad muerta.** El panel "Incidencias críticas" del modo TV **está permanentemente vacío por diseño**: el frontend filtra por `prioridad === "critica"`, pero el backend solo puede emitir `baja|media|alta`. Es imposible que aparezca nada. Hay un caso equivalente en tareas. Esto afecta directamente al encargo, porque ningún dataset por realista que sea podrá rellenar esos paneles hasta que se corrija el contrato.

4. **Los adjuntos son desarrollo desde cero.** Cero soporte de ficheros en backend, base de datos, almacenamiento e infraestructura.

Además, dos bloques del encargo **no se pueden ejecutar todavía**:

- **[BLOQUEANTE] El logo no ha sido recibido.** El encargo dice que está adjunto, pero no ha llegado ningún archivo y `frontend/public/` está vacío (solo `.gitkeep`). No existe ningún `.svg`/`.png`/`.ico` en el repositorio.
- **[BLOQUEANTE] Hermes no está documentado.** Cero menciones a "Hermes" en todo el repositorio. Sin documentación de su API no se puede especificar la integración, solo la arquitectura que la acogerá.

**Esfuerzo estimado** (orientativo, sin incluir Hermes ni audios): 4 bloques de trabajo de aproximadamente 1-2 semanas cada uno, ejecutables parcialmente en paralelo. Ver §12.

---

## 2. Estado actual auditado

### 2.1 Arquitectura general **[VERIFICADO]**

| Capa | Tecnología | Ubicación |
|---|---|---|
| Frontend | Next.js 16.2.6 (Turbopack), React 19, TypeScript, Tailwind CSS 4 | `frontend/src/` |
| Backend | FastAPI 0.115.6, SQLAlchemy 2.0.50, psycopg 3 | `backend/app/` |
| BD | PostgreSQL (`postgres:15-alpine` en compose; producción PG18) | `database/init.sql` |
| Despliegue | Docker Compose (postgres + backend + frontend + nginx) | `docker-compose.yml`, `nginx/` |

- Entrada backend: `backend/app/main.py`. Prefijo de API: `/api/v1` declarado router a router (no hay router padre).
- El backend arranca con `python scripts/apply_migrations.py && uvicorn app.main:app`.
- **No hay Alembic.** Las migraciones son ficheros SQL numerados en `backend/migrations/` (`0000_users.sql` … `0007_meteo_prob_precipitacion.sql`) aplicados por `backend/scripts/apply_migrations.py`. **Cualquier cambio de esquema de este documento debe seguir ese patrón: un fichero `NNNN_descripcion.sql` nuevo.**
- Middleware: únicamente CORS. No hay logging estructurado, request-id, rate limiting ni manejadores de excepción propios.

### 2.2 Autenticación y autorización **[VERIFICADO]**

- JWT Bearer (HS256, 60 min), `backend/app/security.py`. Contraseñas con passlib/bcrypt.
- Roles de sistema: `admin`, `operario`, `alimentacion`, `veterinario` (`Usuario.role`, String(40), default `operario`).
- El control de roles **sí existe en backend**: `backend/app/routers/deps.py` define alias (`AdminOnly`, `AnimalManager`, `TaskManager`, `ClinicalManager`, `QualityManager`, `OperationsManager`) y los routers los inyectan.
- **Huecos detectados:** `orders.py`, `shifts.py`, `handovers.py` solo exigen `get_current_user` sin comprobar rol; el catálogo de tareas (`POST/PUT/DELETE /tareas-catalogo`) tampoco.
- `POST /api/v1/admin/seed-data` **no usa JWT**: se autentica con cabecera `X-Admin-Token` contra la variable `ADMIN_SECRET`. Ejecuta el seed por `subprocess.run` con **timeout de 300 s** (restricción relevante, ver §9.6).
- En frontend existe un modelo de capacidades paralelo en `frontend/src/lib/role-capabilities.ts` (recientemente alineado con el nav y las páginas).

### 2.3 Modelo de datos **[VERIFICADO]**

25 tablas en `backend/app/models/tools4milk.py` (+ `Usuario`, `DatosMetereologicos` en otros ficheros). Todas con PK `UUID` salvo `audit_log` (BigInteger) y las series temporales con PK compuesta.

**Tablas:** `zonas`, `empleados`, `maquinaria`, `animales`, `lactaciones`, `tratamientos_activos`, `eventos_sanitarios`, `incidencias`, `alertas_umbrales`, `alertas`, `tareas_catalogo`, `tareas_recurrentes`, `tareas_ejecuciones`, `turnos`, `asignaciones_turno`, `pedidos`, `audit_log`, `lecturas_meteorologia`, `lecturas_robot_ordeno`, `lecturas_carro_mezclador`, `eventos_reproductivos`, `eventos_sanitarios_recria`, `genomica`, `boxes_recria`, `resumenes_relevo`.

**Enumerados** (`backend/app/enums.py`):

| Enum | Valores |
|---|---|
| `EstadoTarea` | pendiente, en_curso, completada, vencida, cancelada |
| `EstadoAnimal` | produccion, seca, recria, gestante, baja |
| `EstadoIncidencia` | abierta, en_gestion, resuelta, cerrada |
| `TipoIncidencia` | averia_maquinaria, infraestructura, sanidad_animal, calidad_leche, alimentacion, pedidos |
| `NivelSeveridad` | baja, media, alta |
| `NivelAlerta` | baja, media, alta |
| `TipoTurno` | **manana, tarde** (no existe noche) |
| `EstadoPedido` | solicitado, aprobado, en_transito, recibido, cancelado |

Enums PostgreSQL adicionales definidos en el modelo: `rol_empleado` (encargado, auxiliar, veterinario, mecanico), `tipo_maquinaria`, `sexo_animal`, `estado_reproductivo`, `tipo_patologia`, `tipo_evento_repro`.

### 2.4 Incoherencias críticas de contrato **[VERIFICADO]**

La capa `backend/app/services/*_service.py` es un **adaptador** que traduce el esquema real a un contrato heredado que espera el frontend. En esa traducción hay tres defectos que afectan directamente al encargo:

**(a) "Incidencia crítica" es inalcanzable.**
`incidents_service.py` hace `"prioridad": i.severidad`, y `severidad` solo admite `baja|media|alta`. Pero el frontend filtra por `prioridad === "critica"` en al menos tres sitios:
- `frontend/src/app/tv/page.tsx` — KPI "Incidencias criticas" y panel completo "Incidencias criticas".
- `frontend/src/app/(app)/dashboard/page.tsx` — subtítulo `"{{critical}} críticas · {{high}} altas"`.
- `frontend/src/app/(app)/leanfarming/page.tsx` — contador `criticalIncidentsCount`.

**Consecuencia: el panel "Incidencias críticas" del modo TV nunca mostrará nada.** Ningún dataset lo puede arreglar. Requiere corrección de contrato (tarea T8).

**(b) El título de la incidencia se pierde.**
`incidents_service.py` emite `"descripcion": i.descripcion or i.titulo`. Si hay descripción, el frontend **nunca ve el título**. El encargo (§13) pide título y descripción como campos distintos. Tampoco se exponen `subtipo`, `maquinaria_id`, `asignado_a`, `acciones` ni `foto_url`. El campo `resolucion` se emite siempre como `null`.

**(c) "Tarea urgente" y "tarea retrasada" son lo mismo.**
`tasks_service.py` deriva `"es_urgente": ejecucion.estado in {EstadoTarea.VENCIDA}`. No existe prioridad real de tarea. Como consecuencia, en `frontend/src/app/tv/page.tsx` la expresión que selecciona tareas urgentes no retrasadas (`t.es_urgente && t.estado === "programada"`) es **lógicamente imposible**: si `es_urgente` es verdadero, el estado mapeado es siempre `"retrasada"`. Es código muerto.

Mapeo de estados de tarea (`backend/app/repositories/tasks_repository.py:103`): `pendiente→programada`, `completada→ejecutada`, `vencida→retrasada`, `en_curso` y `cancelada` sin cambio.

Campos del contrato de tareas que se emiten siempre `null` (contrato inflado): `tiempo_ejecucion_minutos`, `resultado`, `problemas_encontrados`, `acciones_correctivas`, `checklist_datos`, `motivo_retraso`, `fecha_seguimiento`, `categoria`, `frecuencia`, `zona_aplicable`.

### 2.5 Carencias del modelo frente al encargo **[VERIFICADO]**

| Necesidad del encargo | Estado actual | Acción |
|---|---|---|
| §12 Calidad: lactosa, recuento bacteriano, urea, temperatura, volumen, lote | **No existe.** `lactaciones` solo guarda promedios *por lactación* (`grasa_promedio`, `proteina_promedio`, `rcs_promedio`); `lecturas_robot_ordeno` guarda por ordeño (`produccion_kg`, `conductividad`, `scc`) | **Tabla nueva** `analiticas_tanque` (T10) |
| §9 Idioma preferente del trabajador | `empleados` no tiene columna de idioma | **Columna nueva** (T10) |
| §9 Rol de aplicación del trabajador | No hay FK entre `empleados` y `usuarios` | **Columna nueva** (T10) |
| §10 Historial de movimientos del animal | Solo `animales.zona_id` (posición actual) | **Tabla nueva** `movimientos_animal` (T10) |
| §8 Jerarquía de zonas (recría > boxes; nave > ordeño, enfermería…) | `zonas` es plana. La agrupación está **hardcodeada en el frontend** (`TV_VISUAL_ZONES` en `tv/page.tsx`, `lib/visual-zones.ts`) | **Columna nueva** `zona_padre_id` (T10) |
| §11 Turno de noche | `TipoTurno` solo tiene `manana`, `tarde` | **Ampliar enum** (T10) |
| §11 Prioridad de tarea | No existe | **Columna nueva** (T9) |
| §13 Comentarios e historial de incidencia | Solo `acciones` (JSON) y `audit_log` genérico | **[DECISIÓN]** ver T8 |
| §5 Adjuntos | Solo `incidencias.foto_url` (texto libre, **nadie lo rellena ni lo sirve**) | **Tabla nueva** `adjuntos` (T6) |

### 2.6 Datos actuales **[VERIFICADO]**

`backend/scripts/seed_realistic_data.py` (593 líneas) genera un volumen mínimo, de demo:

| Tabla | Filas que genera |
|---|---|
| empleados | 6 |
| animales | ~30 |
| lactaciones | ~8 |
| incidencias | ~6 (plantillas fijas) |
| alertas | ~6 |
| tareas_ejecuciones | ~10 |
| turnos | ~4 (+asignaciones) |
| resumenes_relevo | 1 |
| pedidos | ~6 |
| boxes_recria | 8 |
| lecturas_meteorologia | N días |

**No genera nada** en: `lecturas_robot_ordeno`, `lecturas_carro_mezclador`, `tareas_recurrentes`, `eventos_reproductivos`, `eventos_sanitarios_recria`, `genomica`, `maquinaria`.

Esto es especialmente grave porque **`lecturas_robot_ordeno` es la única fuente de producción y SCC por ordeño**, de la que dependen Calidad y Predicciones. Está vacía.

### 2.7 Predicciones **[VERIFICADO]**

`backend/app/services/predictions_service.py`. El docstring lo dice explícitamente: *"no hay modelos de machine learning"*. Es **heurística aritmética** sobre datos reales:
- Producción prevista = `produccion_total_kg / 305` de la lactación activa, con penalización 0,08 por tratamiento activo y 0,03 por alerta (tope 0,12).
- Serie diaria = factores fijos `[0.98 … 1.02]`.
- **Composición (grasa/proteína) devuelve 0** — placeholder.
- `confidence` son constantes (0,82 / 0,45…). Riesgo de mastitis fijo en 0,18.
- Devuelve `"_mock": false` aunque parte del payload sea sintético.

**Implicación para el encargo (§12):** generar históricos de calidad mejorará el módulo *Calidad*, pero **no hará que Predicciones prediga composición**. Son dos tareas distintas y así se han separado (T11 vs. T16).

### 2.8 Internacionalización **[VERIFICADO]**

- i18next + react-i18next ya instalados y funcionando. Configuración en `frontend/src/lib/i18n.ts`; proveedor en `frontend/src/components/providers/app-providers.tsx`; selector en `frontend/src/components/ui/language-switcher.tsx`.
- Idiomas actuales: **es** (base) y **en**. Ficheros `frontend/src/locales/es.json` y `en.json`, ~219 claves cada uno, estructurados en espacios de nombres: `common`, `nav`, `dashboard`, `leanfarming`, `profile`.
- Persistencia: `localStorage` con la clave `t4m-language`. **Por dispositivo, no por usuario** — no viaja con la cuenta.
- Cobertura: traducidos el menú lateral, el dashboard, LeanFarming (página + 6 subcomponentes) y `access-denied`. **Quedan ~23 archivos `.tsx` con literales en español** sin extraer (de 53 totales).
- **RTL: no hay ningún soporte.** Cero usos de `dir=`. Se han contabilizado **~91 clases direccionales físicas** que habría que convertir a propiedades lógicas: `ml-` (20), `pr-` (15), `text-left` (17), `border-l-` (13), `pl-` (5), `rounded-l` (5), `left-` (5), `mr-` (4), `text-right` (5), `right-` (2).

### 2.9 Sistema visual **[VERIFICADO]**

- Tokens en `frontend/src/app/globals.css`, **duplicados en dos bloques** que hay que tocar a la vez: `@theme` (genera utilidades Tailwind) y `:root` (variables CSS planas).
- Paleta actual: `--color-brand #1b5e3b` (verde oscuro), `--color-brand-mid #34d471`, `--color-brand-light #e8f5ee`, `--color-brand-dark #071109`; superficies `app-*` y `tv-*` con tinte verdoso; estados semánticos `state-critica #dc2626`, `state-atencion #d97706`, `state-ok #16a34a`, `state-info #2563eb`, `state-neutral #64748b`.
- **Trampa:** `frontend/tailwind.config.ts` define una **segunda paleta verde distinta y desincronizada** (`brand #17663D`, `mid #22C55E`, etc.). En Tailwind 4 con `@theme` normalmente se ignora, pero debe actualizarse o eliminarse.
- **133 colores hex literales en 19 archivos**, concentrados así:

| Archivo | Ocurrencias |
|---|---|
| `frontend/src/app/globals.css` | 43 |
| `frontend/src/features/auth/login-screen.tsx` | 39 |
| `frontend/src/app/(app)/layout.tsx` | 21 |
| `frontend/src/components/ui/language-switcher.tsx` | 5 |
| Otros 15 archivos | 25 (mayoría `hover:bg-[#135532]`) |

- **Tokens muertos** (0 usos): `brand-mid`, `brand-light`, `brand-dark`, `app-surface`, `app-accent`, `shadow-deck`, `shadow-critical`.
- **Logo actual:** icono `Milk` de lucide-react dentro del contenedor `.t4m-logo` (gradiente verde), en 3 sitios: `components/tv/TvShell.tsx:54`, `app/(app)/layout.tsx:85`, `features/auth/login-screen.tsx:100`. **Ojo:** `Milk` se usa también como icono normal de KPI en `dashboard/page.tsx:200` y `management/page.tsx:175` — **esos dos NO deben sustituirse por el logo**.
- `frontend/public/` vacío. Sin favicon, sin manifest, sin `icon.*`/`opengraph-image.*`, sin `metadataBase`. `next/image` no se usa en ninguna parte.
- **Inconsistencia de marca:** la aplicación escribe **"Tools4 Milk"** (con espacio) en locales, login y ambas vistas TV; el encargo usa **"Tools4Milk"**.

### 2.10 Modo televisión **[VERIFICADO]**

- Solo 2 rutas: `/tv` (`app/tv/page.tsx`, "Estado Operativo") y `/tv/shifts` (`app/tv/shifts/page.tsx`, "Tablero de Turnos"). Existe además un modo TV *embebido* como pestaña en `app/(app)/zones/[id]/page.tsx` (toggle Gestión|TV|Tablet), que **no es fullscreen**.
- **No hay Fullscreen API.** Cero ocurrencias de `requestFullscreen`/`exitFullscreen`/`fullscreenElement`. Se entra solo por `<Link href="/tv">`; funciona sin barra lateral únicamente porque la ruta está fuera del grupo `(app)`.
- `TvShell.tsx` usa `min-h-screen` (no `h-screen`) y `<main className="flex-1 overflow-auto p-8">` → **la página crece y hace scroll**, justo lo contrario de un panel de monitorización.
- `TvPanel` aplica `overflow-hidden` en su cuerpo y las listas están limitadas a `.slice(0, 6)` → **riesgo de recorte silencioso**.
- Escalado: variante propia `tv-scale:` (≥1600px), 127 usos en 7 archivos.
- Auto-refresh vía `frontend/src/lib/tv-constants.ts`: `TV_REFETCH` FAST 15s / NORMAL 30s / SLOW 60s / VERY_SLOW 5min / CATALOG 10min. `FAST` está definido pero **no se usa**. Hay un TODO para migrar a WebSocket/SSE.
- **No hay:** rotación automática entre vistas, Wake Lock (la pantalla se apagará), bloqueo de orientación, ni salida controlada del modo TV.
- Puntos de entrada a TV: `dashboard/page.tsx:121` (cabecera), `dashboard/page.tsx:349` (acción rápida), `profile/page.tsx:248`, `settings/page.tsx:106`, `shifts/page.tsx:562` (→ `/tv/shifts`).

### 2.11 Otros hallazgos relevantes

- **`/tasks` no está en el menú** **[VERIFICADO]**. La página existe (`app/(app)/tasks/page.tsx`, 445 líneas, "Plan diario"), pero no figura en `navGroups` de `app/(app)/layout.tsx`. Solo se llega por URL directa o desde la acción rápida del dashboard. Si el módulo "Todos" del encargo es este, está inaccesible desde la navegación.
- **Los tests no corren contra PostgreSQL** **[VERIFICADO]**. `backend/tests/conftest.py` fuerza `DATABASE_URL=sqlite:///:memory:`. Tras la migración a PostgreSQL esto es un riesgo de divergencia (tipos ENUM, JSONB, columnas `GENERATED ALWAYS AS`). Hay 6 ficheros de test, ~1.130 líneas.
- **Columnas generadas** **[VERIFICADO]**: `lecturas_meteorologia.indice_thermo_humedad` y `lecturas_carro_mezclador.desviacion_pct` son `GENERATED ALWAYS AS STORED` en PostgreSQL → **solo lectura**, el generador de dataset no debe escribirlas.
- **No hay planificador**: `tareas_recurrentes.frecuencia_expr` almacena expresiones tipo cron, pero **no existe ningún scheduler que las ejecute**. No hay Celery, APScheduler ni cron.
- Única integración externa: **AEMET OpenData** (`backend/app/services/aemet_client.py`), con *fallback* a datos sintéticos si falta `AEMET_API_KEY`, disparada manualmente por `POST /api/v1/weather/sync`.

---

## 3. Tareas principales

Resumen de las 16 tareas. El detalle de cada una está en §4.

| ID | Tarea | Bloque del encargo | Prioridad |
|---|---|---|---|
| T0 | Desbloqueo de requisitos (logo, Hermes, decisiones) | 1, 15 | **Previa** |
| T1 | Rebranding: sistema de tokens | 1 | Alta |
| T2 | Logo y assets de marca | 1 | Alta (bloqueada por T0) |
| T3 | Limpieza de la cabecera de "Control de explotación" | 2 | Alta (rápida) |
| T4 | Verificación visual de módulos existentes | 3 | Alta |
| T5 | Ampliación de idiomas — fase 1 (gl, fr) | 4 | Media |
| T6 | Soporte RTL y árabe — fase 2 | 4 | Media |
| T7 | Adjuntos de imagen en incidencias | 5 | Alta |
| T8 | Corrección del contrato de incidencias | 6, 13 | **Alta** |
| T9 | Corrección del contrato de tareas | 6, 11 | Alta |
| T10 | Ampliación de esquema de base de datos | 6, 8, 9, 10, 12 | **Alta** |
| T11 | Generador de dataset realista | 7-13 | Alta (depende de T10) |
| T12 | Modo televisión profesional | 14 | Alta |
| T13 | Preparación de la integración Hermes | 15 | Baja (bloqueada por T0) |
| T14 | Audios en incidencias | 5 | Baja (opcional) |
| T15 | Endurecimiento de permisos y pruebas contra PostgreSQL | 16 | Media |
| T16 | Completar el servicio de predicciones | 12 | Media |

---

## 4. Detalle de tareas

---

### T0 — Desbloqueo de requisitos

**Objetivo.** Resolver las dependencias externas que impiden ejecutar T2 y T13, y cerrar las decisiones de producto que condicionan el resto.

**Descripción.** No es una tarea de código. Es la recopilación de entregables e información sin los cuales otras tareas no pueden empezar. Debe cerrarse antes del inicio del desarrollo.

**Subtareas.**
1. **[BLOQUEANTE] Obtener el archivo del logo.** Formato vectorial original (`.svg`, `.ai` o `.eps`). Si solo existe un raster, se necesita a ≥1024 px de lado con fondo transparente.
2. Obtener las variantes o la autorización para derivarlas: isotipo, versión para fondo claro, versión para fondo oscuro, versión monocroma para tamaños pequeños.
3. Confirmar el uso del texto secundario "GRUPO OPERATIVO": ¿aparece en login, en el menú, en TV, o en ninguno?
4. **[DECISIÓN]** Confirmar la grafía oficial: "Tools4Milk" vs. "Tools4 Milk" (hoy la app usa la segunda).
5. **[BLOQUEANTE] Obtener documentación de la API de Hermes**: especificación (OpenAPI/Swagger si existe), modelo de autenticación, entornos disponibles (sandbox/producción), credenciales de prueba, límites de uso, y qué entidades expone.
6. **[DECISIÓN]** Elegir estrategia de almacenamiento de adjuntos (ver T7, opciones A/B/C).
7. **[DECISIÓN]** Confirmar el conjunto de idiomas de fase 1 (ver T5).

**Criterios de aceptación.** Todos los puntos marcados **[BLOQUEANTE]** resueltos o explícitamente aplazados con su tarea marcada como "en espera".

**Riesgos.** Si el logo solo existe en formato raster de baja resolución, se degradará la nitidez en modo TV (pantallas grandes). En ese caso hay que vectorizarlo antes de empezar T2.

---

### T1 — Rebranding: sistema de tokens

**Objetivo.** Sustituir la identidad verde por la paleta corporativa azul/turquesa, de forma centralizada y sin colores arbitrarios.

**Descripción detallada.**
El sistema ya está bien construido: el 95 % de la interfaz consume tokens. La estrategia correcta es **redefinir los tokens, no repintar componentes**. El trabajo se concentra en `globals.css` y en eliminar los hex literales que se saltan el sistema.

Mapeo propuesto **[DECISIÓN — validar antes de aplicar]**:

| Token | Valor actual | Valor propuesto | Justificación |
|---|---|---|---|
| `--color-brand` | `#1b5e3b` | `#1DA1F2` | Azul principal de marca |
| `--color-brand-mid` | `#34d471` | `#1DB6F2` | Azul secundario |
| `--color-brand-light` | `#e8f5ee` | `#E8F6FE` | Derivado claro del azul principal |
| `--color-brand-dark` | `#071109` | `#0A5C8F` | Derivado oscuro para hover/activo |
| `--color-brand-accent` *(nuevo)* | — | `#0DC4D9` | Turquesa de apoyo |
| `--color-app-bg` | `#f2f5f3` | `#F2F2F2` | Gris claro corporativo |
| `--color-app-surface` | `#ffffff` | `#FFFFFF` | Sin cambio |
| `--color-app-surface2` | `#e8f0eb` | `#E8EAEC` | Neutro sin tinte verde |
| `--color-app-border` | `#dde8e1` | `#DFE3E6` | Neutro sin tinte verde |
| `--color-app-text` | `#0d1a10` | `#0D0D0D` | Negro corporativo |
| `--color-app-dim` | `#5c7268` | `#5E6A71` | Gris neutro legible |
| `--color-tv-bg` | `#eef3f0` | `#F2F2F2` | Coherencia con la app |
| `--color-tv-text` | `#0d1a10` | `#0D0D0D` | Negro corporativo |
| `--color-tv-accent` | `#1b5e3b` | `#1DA1F2` | Azul principal |
| `--color-tv-dim` | `#5c7268` | `#5E6A71` | Gris neutro |
| `--shadow-brand` | `rgba(27,94,59,…)` | `rgba(29,161,242,…)` | Sombra teñida de azul |

**Estados semánticos:** mantener `state-critica` (#dc2626), `state-atencion` (#d97706) y `state-ok` (#16a34a) **sin cambios**. Razón: son señales de seguridad operativa (rojo = crítico, ámbar = atención, verde = correcto) y su significado es universal; sustituirlos por tonos de marca degradaría la legibilidad operativa. **`state-info` (#2563eb) sí debe revisarse**, porque su azul chocará con el nuevo azul de marca: se propone desplazarlo a un azul más profundo (`#1E40AF`) o reasignarlo al turquesa `#0DC4D9` **[DECISIÓN]**.

> Nota sobre el verde: tras este cambio el verde queda **únicamente** como color de estado "correcto" (`state-ok`), lo cual cumple el criterio del encargo ("evita mantener el verde como color predominante") sin sacrificar la semántica.

**Subtareas.**
1. Redefinir el bloque `@theme` en `frontend/src/app/globals.css` (L12-52).
2. Redefinir el bloque `:root` (L54-71) con los mismos valores. **Ambos bloques deben quedar sincronizados.**
3. Actualizar `--shadow-brand` y `--shadow-critical`.
4. Reescribir el gradiente de `.t4m-logo` (L122-132) o eliminarlo si T2 lo sustituye por una imagen.
5. **Actualizar o eliminar `frontend/tailwind.config.ts`** (paleta verde desincronizada).
6. Eliminar los 39 hex literales de `features/auth/login-screen.tsx` sustituyéndolos por tokens.
7. Eliminar los 21 hex literales de `app/(app)/layout.tsx` (sidebar oscuro): definir tokens nuevos `--color-sidebar-bg`, `--color-sidebar-hover`, `--color-sidebar-border`, `--color-sidebar-text`, `--color-sidebar-active` en vez de hex sueltos.
8. Eliminar los 5 hex de `components/ui/language-switcher.tsx` (usa los mismos colores de sidebar; reutilizar los tokens de la subtarea 7).
9. Sustituir las ~25 ocurrencias restantes, casi todas `hover:bg-[#135532]` → `hover:bg-brand-dark`.
10. Actualizar los colores de gráfico en `components/charts/MiniCharts.tsx` (2 hex, `#35E479`).
11. Eliminar los tokens muertos o darles uso: `brand-mid`, `brand-light`, `brand-dark`, `app-surface`, `app-accent`, `shadow-deck`, `shadow-critical`.
12. Verificar contraste AA (≥4,5:1 texto normal, ≥3:1 texto grande) en: botón primario (blanco sobre `#1DA1F2`), enlaces, badges de estado, y **modo TV a distancia**. `#1DA1F2` sobre blanco da ~2,7:1 → **no es válido para texto pequeño**; usar `brand-dark` (`#0A5C8F`) para texto sobre fondo claro y reservar `#1DA1F2` para fondos y elementos gráficos. **Este punto es obligatorio, no opcional.**

**Componentes afectados.** `globals.css`, `tailwind.config.ts`, `login-screen.tsx`, `(app)/layout.tsx`, `language-switcher.tsx`, `MiniCharts.tsx`, y de forma automática los 49 archivos que consumen tokens.

**Cambios en BD.** Ninguno.
**Cambios en backend.** Ninguno.
**Cambios en configuración.** `tailwind.config.ts`.

**Dependencias.** Ninguna (puede empezar de inmediato). T2 y T12 dependen de ella.

**Criterios de aceptación.**
- `grep -rE "#[0-9a-fA-F]{6}" frontend/src --include=*.tsx` devuelve **0 resultados** (todos los colores vía token).
- No queda ningún verde de marca; el verde solo aparece como `state-ok`.
- Contraste AA verificado en los 6 componentes listados.
- `npm run build` pasa sin errores.

**Riesgos.** El sidebar es oscuro (`#0d1a10`) y con un azul de marca vivo puede perder contraste. Requiere revisión visual, no solo cálculo automático.

---

### T2 — Logo y assets de marca

**Objetivo.** Sustituir el icono de botella de leche por el logo oficial, con la disposición `[LOGO] Tools4Milk`.

**Estado: BLOQUEADA por T0.1.**

**Descripción detallada.**
Hoy el "logo" es el icono `Milk` de lucide-react dentro de un contenedor cuadrado con gradiente verde (`.t4m-logo`). Aparece en tres ubicaciones, cada una con un tamaño distinto.

**Subtareas.**
1. Recibir el logo y generar las variantes de producción en `frontend/public/brand/`:
   - `logo-full.svg` — logotipo completo (isotipo + texto), para el login.
   - `logo-mark.svg` — isotipo solo, para el menú y TV.
   - `logo-mark-light.svg` / `logo-mark-dark.svg` — versiones para fondo claro y oscuro (el sidebar es oscuro; el modo TV es claro).
   - `logo-mark-mono.svg` — monocroma para tamaños < 24 px.
   - **Formato recomendado: SVG** (nitidez en TV a 4K, peso mínimo, coloreable por CSS). PNG con transparencia a 2x/3x solo como respaldo para correo o contextos que no admitan SVG. WebP no aporta nada frente a SVG en un logotipo.
2. Crear un componente `frontend/src/components/ui/brand-logo.tsx` con props `variant` (`full` | `mark`), `theme` (`light` | `dark`) y `size`, para no repetir markup en tres sitios.
3. Sustituir en `components/tv/TvShell.tsx:54` (tamaño TV, mayor).
4. Sustituir en `app/(app)/layout.tsx:85` (sidebar oscuro → variante clara del logo).
5. Sustituir en `features/auth/login-screen.tsx:100` (logotipo completo).
6. **No tocar** `dashboard/page.tsx:200` ni `management/page.tsx:175`: ahí `Milk` es un icono de KPI/pestaña, no el logo.
7. Unificar la grafía del nombre según T0.4 en: `locales/es.json` y `en.json` (clave `nav.brand`), `login-screen.tsx` (L135, L176), `tv/page.tsx:213`, `tv/shifts/page.tsx:244`, y `app/layout.tsx` (metadata `title`).
8. Añadir favicon y metadatos: `frontend/src/app/icon.svg`, `apple-icon.png`, `opengraph-image.png`, y completar `metadata` en `app/layout.tsx` con `icons`, `metadataBase`, `themeColor: "#1DA1F2"` y `openGraph`.
9. Crear `frontend/public/manifest.webmanifest` (nombre, iconos, `theme_color`, `background_color`) — necesario si se quiere instalar en tablets de la explotación.
10. Eliminar o reconvertir la clase `.t4m-logo` si deja de usarse.

**Verificación visual obligatoria** (del encargo): tamaño proporcional, separación logo-texto, alineación vertical, sin deformación (`object-fit`/`preserveAspectRatio`), sin recorte, nitidez en escritorio / móvil / TV 1080p y 4K, y legibilidad sobre fondo claro y oscuro.

**Componentes afectados.** `TvShell.tsx`, `(app)/layout.tsx`, `login-screen.tsx`, `app/layout.tsx`, `globals.css`, `locales/*.json`, `frontend/public/`.

**Cambios en BD / backend.** Ninguno.

**Dependencias.** T0.1 (archivo del logo), T0.4 (grafía). Conviene ejecutarla junto a T1.

**Criterios de aceptación.** El icono `Milk` ya no se usa como logo en ninguno de los 3 puntos; los 2 usos como icono siguen intactos; favicon visible en pestaña; logo nítido en TV 4K; disposición `[LOGO] Tools4Milk` correcta en los 3 contextos.

**Riesgos.** Si el logo tiene proporciones muy apaisadas, el contenedor cuadrado actual (`h-9 w-9`) lo deformará: hay que rediseñar el contenedor, no escalar el logo.

---

### T3 — Limpieza de la cabecera de "Control de explotación"

**Objetivo.** Eliminar los elementos "TV Global" y "Actualización cada 30 s" de la cabecera del dashboard sin perder acceso al modo televisión.

**Descripción detallada.** **[VERIFICADO]** Ambos elementos están en `frontend/src/app/(app)/dashboard/page.tsx`, líneas 119-130, dentro del `PageHeader`:
- **"TV Global"** (L120-126) es un **enlace funcional** `<Link href="/tv">`, no un texto decorativo.
- **"Actualización cada 30 s"** (L127-130) es un `<span>` puramente informativo. Además **es inexacto**: solo 2 de las 5 consultas del dashboard refrescan a 30 s; calidad y lactaciones van a 60 s y el clima a 10 min. Eliminarlo corrige también una imprecisión.

**Comprobación de impacto ya realizada:** el modo TV seguirá siendo accesible desde 4 puntos: la acción rápida del propio dashboard (`dashboard/page.tsx:349`), `profile/page.tsx:248`, `settings/page.tsx:106` y `shifts/page.tsx:562` (→ `/tv/shifts`). **No se pierde funcionalidad.**

**Subtareas.**
1. Eliminar el `<Link href="/tv">` de la cabecera (L120-126).
2. Eliminar el `<span>` de intervalo de refresco (L127-130).
3. Eliminar las claves `dashboard.refreshInterval` de `locales/es.json` y `en.json`. **Conservar `dashboard.tvGlobal`**, que sigue usándose en la acción rápida (L349).
4. Revisar si el `PageHeader` queda visualmente vacío en su zona derecha y reequilibrar (el componente acepta `children`; si queda sin hijos, comprobar que no deja un hueco).
5. Verificar que los iconos `Monitor` y `RefreshCw` siguen importándose solo si se usan (evitar imports muertos que rompan el lint).

**Componentes afectados.** `app/(app)/dashboard/page.tsx`, `locales/es.json`, `locales/en.json`.

**Cambios en BD / backend / configuración.** Ninguno.

**Dependencias.** Ninguna. Es la tarea más rápida del paquete; puede hacerse primero.

**Criterios de aceptación.** La cabecera no muestra ninguno de los dos elementos; el acceso a `/tv` sigue funcionando desde los 4 puntos restantes; `npm run build` pasa; no quedan claves de traducción huérfanas ni imports sin usar.

**Riesgos.** Ninguno relevante.

---

### T4 — Verificación visual de módulos existentes

**Objetivo.** Garantizar que Lean Farming, Incidencias, Todos (`/tasks`), Calidad, Predicciones y Zonas mantienen su funcionalidad y se adaptan a la nueva identidad.

**Descripción.** Tarea de verificación, no de desarrollo. Se ejecuta **después** de T1/T2 y de nuevo después de T10/T11.

**Subtareas.**
1. Revisar cada módulo tras el rebranding buscando: texto ilegible por contraste, elementos que dependían del verde para significar algo, gráficos con colores ahora duplicados.
2. Revisar `components/charts/MiniCharts.tsx`: las series usan verde `#35E479` hardcodeado; con la nueva paleta deben pasar a azul/turquesa manteniendo distinción entre series.
3. Verificar los módulos en modo TV (los que se muestran allí).
4. **[DECISIÓN] Resolver el acceso a "Todos"**: `/tasks` no está en el menú lateral. Decidir si se añade a `navGroups` (grupo "Operativa", junto a LeanFarming) o si es intencionadamente accesible solo por acción rápida.
5. Comprobar que ninguno rompe tras los cambios de esquema de T10.

**Componentes afectados.** Los 6 módulos + `MiniCharts.tsx` + `(app)/layout.tsx` (si se decide añadir `/tasks`).

**Dependencias.** T1, T2 (visual); T10, T11 (datos).

**Criterios de aceptación.** Los 6 módulos cargan sin error, con la nueva paleta y con datos del nuevo dataset; gráficos legibles; sin regresiones funcionales.

---

### T5 — Ampliación de idiomas (fase 1)

**Objetivo.** Ampliar de 2 a 4-5 idiomas cubriendo los perfiles de trabajadores indicados, sin abordar todavía la complejidad RTL.

**Análisis de idiomas [análisis, no verificación de código].**

El encargo cita trabajadores de Marruecos, Senegal y Ghana. La recomendación se basa en las **lenguas de trabajo escritas** de cada origen, que no siempre coinciden con la lengua materna:

| Idioma | Código | Cubre | Recomendación |
|---|---|---|---|
| Español | `es` | Base actual | **Fase 1** (ya existe) |
| Inglés | `en` | **Ghana (lengua oficial)**, perfiles internacionales | **Fase 1** (ya existe) |
| Gallego | `gl` | Personal local | **Fase 1** |
| Francés | `fr` | **Senegal (lengua oficial)**, **Marruecos (lengua de trabajo habitual)** | **Fase 1** |
| Árabe | `ar` | Marruecos | **Fase 2** (ver T6: requiere RTL) |
| Portugués | `pt` | Cabo Verde, Guinea-Bisáu, Brasil; proximidad con Galicia | Fase 3, si hay demanda real |
| Wolof | `wo` | Senegal | **No recomendado en fase 1** — ver nota |
| Hausa | `ha` | — | **No recomendado** — ver nota |

**Nota sobre Ghana y el hausa.** El encargo propone hausa "por su relevancia para Ghana". Conviene corregir esa premisa: **la lengua oficial de Ghana es el inglés**, y es la lengua de alfabetización y de trabajo. El hausa es mayoritariamente de Nigeria y Níger, y en Ghana solo tiene presencia minoritaria en el norte. Las lenguas ghanesas más habladas son el twi/akan, el ewe y el ga. **Añadir inglés cubre Ghana mejor que cualquier lengua local**, y con mucho menos coste de mantenimiento.

**Nota sobre el wolof.** El wolof es la lengua vehicular de Senegal, pero es predominantemente **oral**: la alfabetización formal se produce en francés, y no existe una norma escrita de uso generalizado. Una interfaz en wolof escrito puede resultar menos útil que una en francés. **Alternativa recomendada para perfiles con baja alfabetización, independientemente del idioma: reforzar pictogramas, códigos de color y confirmaciones visuales** en las pantallas operativas (tablet de zona y relevos). Esto beneficia a toda la plantilla y es más barato que mantener un idioma adicional.

**Subtareas.**
1. Completar primero la cobertura de traducción existente: quedan **~23 archivos `.tsx` con literales en español** sin extraer (de 53). Traducir idiomas nuevos sobre una base incompleta multiplica el trabajo.
2. Reorganizar los locales por espacios de nombres si el fichero único se vuelve inmanejable (hoy ~219 claves; con 5 idiomas y cobertura completa se estiman 450-600).
3. Añadir `gl` y `fr`: crear `frontend/src/locales/gl.json` y `fr.json`, y registrarlos en `SUPPORTED_LANGUAGES` de `frontend/src/lib/i18n.ts`.
4. **Revisión terminológica ganadera obligatoria.** No traducir automáticamente. Términos que exigen revisión por alguien del dominio: *crotal* (fr: *boucle d'identification*), *recría* (*génisses/élevage*), *vaca seca* (*vache tarie*), *secado* (*tarissement*), *lactación* (*lactation*), *celo* (*chaleurs*), *parto* (*vêlage*), *ordeño* (*traite*), *relevo* (*relève/passation*), *recuento de células somáticas* (*comptage cellulaire*), *cojera* (*boiterie*), *metritis*, *cetosis*. En gallego: *crotal*, *recría*, *vaca seca*, *muxidura* (ordeño), *parto*, *presa*.
5. Adaptar el selector de idioma (`language-switcher.tsx`): con 4-5 idiomas el conmutador de dos botones deja de servir; convertirlo en desplegable con nombre del idioma en su propia lengua (Español / Galego / English / Français / العربية).
6. **Persistir el idioma en el perfil del usuario**, no solo en `localStorage`. Requiere la columna `empleados.idioma_preferente` de T10 y, si se quiere por cuenta, `usuarios.idioma`. Hoy el idioma es por dispositivo: un trabajador que cambia de tablet pierde su preferencia.
7. **Auditoría de desbordamiento de texto.** El alemán/francés expanden ~20-30 % respecto al español. Revisar: botones de ancho fijo, badges de estado, cabeceras de tabla, elementos del menú lateral (ancho fijo `w-56`) y las tarjetas del modo TV. Buscar `truncate`, `whitespace-nowrap` y anchos fijos.

**Componentes afectados.** `lib/i18n.ts`, `locales/*.json`, `language-switcher.tsx`, los ~23 archivos pendientes de extracción, `(app)/layout.tsx` (ancho del sidebar).

**Cambios en BD.** `empleados.idioma_preferente` (T10).
**Cambios en backend.** Exponer y aceptar `idioma_preferente` en el endpoint de empleados.

**Dependencias.** T10 (para la subtarea 6).

**Criterios de aceptación.** 4 idiomas seleccionables y persistentes; ningún literal español sin extraer en los módulos principales; terminología ganadera revisada por una persona; sin desbordamientos en menú, botones ni TV.

**Riesgos.** La calidad de la traducción técnica es el riesgo principal: una traducción literal de *"secado"* o *"crotal"* puede resultar incomprensible o inducir a error operativo.

---

### T6 — Soporte RTL y árabe (fase 2)

**Objetivo.** Incorporar el árabe con soporte completo de escritura de derecha a izquierda.

**Descripción detallada.** **[VERIFICADO]** No existe ningún soporte RTL: cero usos de `dir=`. Se han contabilizado **~91 clases direccionales físicas** que se romperían en árabe.

**Subtareas.**
1. Conmutar `dir` en el elemento `<html>` al cambiar de idioma (ampliar `setLanguage()` en `lib/i18n.ts`, que ya fija `document.documentElement.lang`).
2. Convertir las ~91 clases físicas a lógicas: `ml-`→`ms-` (20), `mr-`→`me-` (4), `pl-`→`ps-` (5), `pr-`→`pe-` (15), `text-left`→`text-start` (17), `text-right`→`text-end` (5), `border-l-`→`border-s-` (13), `rounded-l`→`rounded-s` (5), `left-`→`start-` (5), `right-`→`end-` (2).
3. Revisar iconografía direccional: flechas de paginación, `ArrowRight` del flujo de pedidos, `ArrowLeftRight` de relevos, chevrons de expansión. Deben reflejarse en RTL (`rtl:rotate-180` o equivalente).
4. Cargar una fuente con cobertura árabe (Space Grotesk y DM Sans **no tienen glifos árabes**). Propuesta: Noto Sans Arabic o IBM Plex Sans Arabic, cargada solo cuando el idioma sea `ar`.
5. Verificar el formateo de números y fechas: el código usa `toLocaleString("es-ES", …)` **hardcodeado** en varios sitios (p. ej. `tv/page.tsx`, `orders/page.tsx`). Debe pasar a usar el idioma activo. **[DECISIÓN]** ¿Números arábigos orientales (٠١٢٣) u occidentales? En contexto laboral y con datos numéricos de producción, se recomienda **occidentales** para evitar errores de lectura entre trabajadores de distintos orígenes.
6. Revisar el modo TV en RTL (el layout de paneles debe invertirse coherentemente).
7. Crear `locales/ar.json` con revisión terminológica por hablante nativo.

**Componentes afectados.** Prácticamente todo el frontend (91 puntos en ~30 archivos), `lib/i18n.ts`, `app/layout.tsx`, `globals.css` (fuentes).

**Dependencias.** T5 (base de idiomas), y conviene ejecutarla **después** de T1 para no tocar dos veces los mismos archivos.

**Criterios de aceptación.** Con `ar` activo: layout espejado correctamente, sin solapamientos, iconos direccionales invertidos, texto árabe renderizado con fuente adecuada, modo TV coherente, resto de idiomas sin regresión.

**Riesgos.** Es la tarea con mayor superficie de regresión visual del paquete. Recomendación: ejecutarla en una rama propia y revisar pantalla por pantalla. El texto árabe mezclado con identificadores latinos (crotales, códigos de zona) produce texto bidireccional que puede desordenarse visualmente: envolver los identificadores en elementos con `dir="ltr"`.

---

### T7 — Adjuntos de imagen en incidencias

**Objetivo.** Permitir adjuntar fotografías a una incidencia, desde cámara o galería, con previsualización, borrado y control de acceso.

**Descripción detallada.** **[VERIFICADO]** Punto de partida: **no existe absolutamente nada**. Cero ocurrencias de `UploadFile`, `File(...)`, `multipart/form-data`, `StaticFiles`, `aiofiles`, `boto3`, MinIO o Cloudinary. No hay carpeta `media/`/`uploads/`, ni tabla de adjuntos, ni volumen persistente en `docker-compose.yml`. Lo único existente es `incidencias.foto_url` (Text), **que nadie rellena ni sirve**.

Es desarrollo *greenfield*. La decisión estructural es dónde se guardan los bytes.

**[DECISIÓN] Opciones de almacenamiento:**

| Opción | Descripción | Pros | Contras |
|---|---|---|---|
| **A. Volumen local + Nginx** | Ficheros en un volumen Docker, servidos por Nginx tras validación | Sencillo, sin coste, sin dependencias | No sobrevive a redespliegues en PaaS efímero (**riesgo real en Railway**); no escala horizontalmente; copias de seguridad manuales |
| **B. S3 / compatible (MinIO, R2, Spaces)** | Almacenamiento de objetos externo, URLs prefirmadas | Escalable, duradero, desacoplado del contenedor, respaldo integrado | Requiere credenciales y coste; dependencia externa |
| **C. BYTEA en PostgreSQL** | Bytes en la propia base de datos | Transaccional, respaldo unificado | Infla la BD, degrada el rendimiento, mala práctica para binarios grandes — **no recomendado** |

**Recomendación: opción B** si el despliegue es en Railway (el sistema de ficheros del contenedor es efímero y una foto subida se perdería en el siguiente despliegue). Opción A solo si el despliegue definitivo es on-premise en la explotación con volumen persistente garantizado.

**Subtareas — Base de datos.**
1. Nueva migración `backend/migrations/0008_adjuntos.sql` con la tabla:

```sql
CREATE TABLE adjuntos (
    id                UUID PRIMARY KEY,
    entidad_tipo      VARCHAR(40)  NOT NULL,   -- 'incidencia' (extensible a 'animal', 'tarea')
    entidad_id        UUID         NOT NULL,
    tipo_media        VARCHAR(20)  NOT NULL,   -- 'imagen' | 'audio'
    nombre_original   VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) NOT NULL,
    tamano_bytes      BIGINT       NOT NULL,
    storage_key       TEXT         NOT NULL,   -- ruta o clave de objeto
    ancho_px          INTEGER,                 -- solo imagen
    alto_px           INTEGER,
    duracion_seg      NUMERIC(6,2),            -- solo audio
    hash_sha256       TEXT         NOT NULL,   -- deduplicación e integridad
    subido_por        UUID         REFERENCES empleados(id),
    ts_subida         TIMESTAMPTZ  NOT NULL,
    eliminado         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT adjuntos_tamano_positivo CHECK (tamano_bytes > 0)
);
CREATE INDEX idx_adjuntos_entidad ON adjuntos (entidad_tipo, entidad_id) WHERE eliminado = FALSE;
CREATE INDEX idx_adjuntos_hash    ON adjuntos (hash_sha256);
```

> Se modela genérica (`entidad_tipo` + `entidad_id`) en vez de con FK directa a `incidencias` para poder extenderla a animales o tareas sin otra migración. **[DECISIÓN]** Si se prefiere integridad referencial estricta, usar `incidencia_id UUID REFERENCES incidencias(id) ON DELETE CASCADE` y aceptar una tabla por entidad.

2. Marcar `incidencias.foto_url` como obsoleta (no eliminar todavía; migrar si tuviera datos — hoy está vacía).

**Subtareas — Backend.**
3. Modelo ORM `Adjunto` en `backend/app/models/tools4milk.py`.
4. Capa de almacenamiento abstracta `backend/app/services/storage_service.py` con interfaz `save(file) -> storage_key`, `get_url(key)`, `delete(key)`, y dos implementaciones (local / S3) seleccionadas por variable de entorno. **Esto evita atarse a la decisión A/B ahora.**
5. Endpoints nuevos en un router `attachments.py`:
   - `POST /api/v1/incidents/{incident_id}/adjuntos` (multipart, requiere rol con `manage_incidents`).
   - `GET /api/v1/incidents/{incident_id}/adjuntos` (lista metadatos + URL de acceso).
   - `DELETE /api/v1/adjuntos/{adjunto_id}` (borrado lógico + borrado del objeto).
   - `GET /api/v1/adjuntos/{adjunto_id}/contenido` **solo si se elige la opción A** (con comprobación de JWT antes de servir el fichero).
6. **Validación de seguridad — obligatoria:**
   - Lista blanca de MIME **validada por contenido real (magic bytes), no por extensión ni por el `Content-Type` del cliente**.
   - Límite de tamaño: **10 MB** por imagen **[DECISIÓN]**.
   - Límite de número de adjuntos por incidencia (p. ej. 10).
   - Renombrado a UUID: **nunca** usar el nombre original como ruta (previene *path traversal*).
   - Servir siempre con `Content-Disposition: attachment` o desde un dominio/ruta sin permisos de sesión, para evitar XSS por SVG. **Excluir `image/svg+xml` de la lista blanca.**
   - Recompresión/normalización de imagen en servidor (elimina metadatos EXIF, incluida geolocalización) — requiere `Pillow`.
7. Añadir el volumen o las credenciales al despliegue (`docker-compose.yml`, variables de entorno).

**Subtareas — Frontend.**
8. Componente `components/ui/file-upload.tsx`: selección por galería y **captura directa de cámara** (`<input type="file" accept="image/*" capture="environment">`, que en móvil/tablet abre la cámara).
9. Previsualización en miniatura con lightbox, en la ficha de incidencia.
10. Indicador de progreso de subida y manejo de error (fichero grande, tipo no permitido, red caída).
11. Borrado con confirmación.
12. Integrar en `app/(app)/incidents/page.tsx` (modal de creación y detalle).

**Formatos iniciales.** `image/jpeg`, `image/png`, `image/webp`. **Excluir SVG** por riesgo de XSS.

**Dependencias.** T0.6 (decisión de almacenamiento). Recomendable hacerla después de T8 (contrato de incidencias) para no tocar dos veces el mismo serializador.

**Criterios de aceptación.** Subida desde cámara y galería en tablet; previsualización; borrado; un usuario sin permiso no accede al fichero; un `.exe` renombrado a `.jpg` es rechazado; los ficheros sobreviven a un redespliegue (si opción B).

**Riesgos.** El principal es el almacenamiento efímero: con la opción A en Railway, **las fotos se perderán silenciosamente** en cada despliegue. Debe decidirse antes de implementar.

---

### T8 — Corrección del contrato de incidencias

**Objetivo.** Hacer posible la severidad "crítica" y exponer los campos que el encargo pide (título, responsable, comentarios).

**Estado: prerrequisito del encargo §13.** Sin esta tarea, parte de lo pedido es inalcanzable por mucho dataset que se genere.

**Descripción detallada.** Ver §2.4(a) y (b). El frontend espera `prioridad: "critica"`, que el backend no puede emitir; y el título se pierde al fusionarse con la descripción.

**[DECISIÓN] Dos estrategias posibles:**

- **Estrategia 1 (recomendada): ampliar el enum `nivel_severidad` con `critica`.** Alinea backend y frontend, es coherente con `TipoIncidencia` y con la operativa real (una avería de robot de ordeño no es "alta", es crítica). Requiere migración de tipo ENUM en PostgreSQL.
- **Estrategia 2: eliminar "crítica" del frontend** y trabajar con 3 niveles. Menos trabajo, pero degrada la operativa y deja el panel de TV sin sentido (habría que refundirlo con "Incidencias abiertas").

**Subtareas (asumiendo Estrategia 1).**
1. Migración `0009_incidencias_contrato.sql`:
   ```sql
   ALTER TYPE nivel_severidad ADD VALUE IF NOT EXISTS 'critica';
   ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS resolucion TEXT;
   ```
   > **Atención:** `ALTER TYPE … ADD VALUE` no puede ejecutarse dentro de un bloque de transacción en PostgreSQL < 12 y tiene restricciones de uso inmediato. Verificar el comportamiento de `apply_migrations.py` (si envuelve cada fichero en transacción, hay que ejecutarlo en `AUTOCOMMIT` o recrear el tipo).
2. Añadir `CRITICA = "critica"` a `NivelSeveridad` en `backend/app/enums.py`.
3. Corregir `backend/app/services/incidents_service.py`:
   - Emitir `titulo` y `descripcion` como **campos separados** (dejar de hacer `descripcion or titulo`).
   - Exponer `severidad` con su nombre real, manteniendo `prioridad` como alias durante una transición.
   - Exponer `subtipo`, `maquinaria_id`, `asignado_a`, `acciones`, y `resolucion`.
4. Actualizar `frontend/src/lib/types.ts` y los componentes que muestran incidencias para usar `titulo` + `descripcion`.
5. Revisar los filtros de severidad en `incidents/page.tsx`, `tv/page.tsx`, `dashboard/page.tsx` y `leanfarming/page.tsx` para incluir el nuevo nivel.
6. **[DECISIÓN] Comentarios e historial.** El encargo §13 pide "comentarios" e "historial de cambios". Opciones: (a) usar el campo `acciones` (JSON) ya existente, sin migración; (b) tabla `comentarios_incidencia` con autor y fecha, que es lo correcto si se quiere trazabilidad real. El historial de cambios ya está parcialmente cubierto por `audit_log`, que registra `datos_anteriores`/`datos_nuevos` por registro.

**Componentes afectados.** `enums.py`, `incidents_service.py`, `incidents_repository.py`, `schemas/api.py`, migración nueva; frontend: `types.ts`, `incidents/page.tsx`, `tv/page.tsx`, `dashboard/page.tsx`, `leanfarming/page.tsx`.

**Dependencias.** Ninguna técnica, pero **debe ir antes de T11** (el dataset debe poder generar incidencias críticas).

**Criterios de aceptación.** Una incidencia con severidad `critica` se crea, se lista, aparece en el panel "Incidencias críticas" del modo TV y en el KPI del dashboard. El título es visible y distinto de la descripción.

**Riesgos.** La migración de ENUM en PostgreSQL es delicada y no es reversible con un simple `DROP VALUE` (PostgreSQL no permite eliminar valores de un enum). Probar primero en local.

---

### T9 — Corrección del contrato de tareas

**Objetivo.** Dotar a las tareas de prioridad real, independiente del estado.

**Descripción detallada.** Ver §2.4(c). Hoy `es_urgente` se deriva de `estado == VENCIDA`, lo que hace imposible una tarea "urgente pero aún no retrasada" y convierte en código muerto la lógica de `tv/page.tsx`. El encargo §11 pide "Prioridad" como atributo del dataset.

**Subtareas.**
1. Migración `0010_tareas_prioridad.sql`:
   ```sql
   CREATE TYPE prioridad_tarea AS ENUM ('baja','normal','alta','urgente');
   ALTER TABLE tareas_ejecuciones
       ADD COLUMN prioridad prioridad_tarea NOT NULL DEFAULT 'normal';
   CREATE INDEX idx_tareas_prioridad ON tareas_ejecuciones (prioridad)
       WHERE estado IN ('pendiente','en_curso');
   ```
2. Añadir el enum a `backend/app/enums.py` y la columna al modelo `TareaEjecucion`.
3. Corregir `tasks_service.py`: `es_urgente` pasa a derivar de `prioridad == 'urgente'` (no del estado). Exponer también `prioridad` como campo propio.
4. **[DECISIÓN]** Decidir qué hacer con los campos del contrato que siempre son `null` (`tiempo_ejecucion_minutos`, `resultado`, `problemas_encontrados`, `acciones_correctivas`, `motivo_retraso`, `fecha_seguimiento`, `categoria`, `frecuencia`, `zona_aplicable`): o se implementan, o se eliminan del contrato. Mantenerlos como `null` fijo es deuda técnica que confunde. Nota: `tiempo_ejecucion_minutos` es calculable como `ts_fin - ts_inicio`, y `categoria`/`frecuencia` podrían venir de `tareas_catalogo`/`tareas_recurrentes`.
5. Reactivar/corregir la lógica de `priorityTasks` en `frontend/src/app/tv/page.tsx`, que ahora sí podrá distinguir urgentes de retrasadas.
6. Añadir el selector de prioridad en los formularios de creación/edición de tarea.

**Componentes afectados.** `enums.py`, `models/tools4milk.py`, `tasks_service.py`, `tasks_repository.py`, migración; frontend: `types.ts`, `tasks/page.tsx`, `leanfarming/*`, `tv/page.tsx`.

**Dependencias.** Debe ir antes de T11.

**Criterios de aceptación.** Se puede crear una tarea urgente no vencida; aparece como urgente en el modo TV sin estar retrasada; `tiempo_ejecucion_minutos` devuelve un valor real o desaparece del contrato.

---

### T10 — Ampliación de esquema de base de datos

**Objetivo.** Cubrir las carencias del modelo identificadas en §2.5 para que el dataset del encargo sea representable.

**Descripción detallada.** Seis cambios de esquema, agrupables en una o dos migraciones.

**Subtareas.**

**10.1 — Tabla de calidad de leche de tanque (la más importante).**
El encargo §12 pide lactosa, recuento bacteriano, urea, temperatura, volumen y lote: **ninguno existe hoy**. La calidad actual se deriva de promedios por lactación, que no permiten series temporales diarias.

```sql
CREATE TABLE analiticas_tanque (
    id                     UUID PRIMARY KEY,
    fecha                  DATE         NOT NULL,
    lote                   VARCHAR(40),          -- identificador de recogida/cisterna
    volumen_l              NUMERIC(10,2) NOT NULL,
    grasa_pct              NUMERIC(5,3),
    proteina_pct           NUMERIC(5,3),
    lactosa_pct            NUMERIC(5,3),
    rcs_x1000              INTEGER,              -- células somáticas (miles/ml)
    bacteriologia_ufc_ml   INTEGER,              -- recuento bacteriano
    urea_mg_dl             NUMERIC(6,2),
    temperatura_c          NUMERIC(4,1),
    punto_crioscopico      NUMERIC(6,4),
    inhibidores            BOOLEAN NOT NULL DEFAULT FALSE,
    laboratorio            VARCHAR(150),
    observaciones          TEXT,
    CONSTRAINT analiticas_tanque_fecha_lote UNIQUE (fecha, lote)
);
CREATE INDEX idx_analiticas_tanque_fecha ON analiticas_tanque (fecha DESC);
```
Requiere endpoints nuevos (`GET/POST /api/v1/calidad/tanque`) y adaptar el módulo Calidad para consumirlos. **[DECISIÓN]** ¿Se sustituye la fuente actual del módulo Calidad o conviven ambas (calidad individual por lactación + calidad de tanque)? Recomendación: **convivir**, son cosas distintas (control individual vs. control de entrega a industria).

**10.2 — Idioma preferente y vínculo con usuario en empleados.**
```sql
ALTER TABLE empleados ADD COLUMN idioma_preferente VARCHAR(5) NOT NULL DEFAULT 'es';
ALTER TABLE empleados ADD COLUMN usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL;
```
La segunda columna cierra el TODO "Phase 13" existente en `frontend/src/app/(app)/profile/page.tsx`, donde el "modo trabajador" es hoy **puramente local y visual**.

**10.3 — Jerarquía de zonas.**
```sql
ALTER TABLE zonas ADD COLUMN zona_padre_id UUID REFERENCES zonas(id) ON DELETE SET NULL;
ALTER TABLE zonas ADD COLUMN orden SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE zonas ADD COLUMN activa BOOLEAN NOT NULL DEFAULT TRUE;
```
Permite modelar la estructura del encargo §8 y **eliminar la agrupación hardcodeada del frontend** (`TV_VISUAL_ZONES` en `tv/page.tsx`, `lib/visual-zones.ts`), que hoy es deuda técnica: las zonas visuales "Recria" y "Nave" están escritas a mano en el código con listas de códigos.

**10.4 — Historial de movimientos de animales.**
```sql
CREATE TABLE movimientos_animal (
    id           UUID PRIMARY KEY,
    animal_id    UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    zona_origen  UUID REFERENCES zonas(id),
    zona_destino UUID NOT NULL REFERENCES zonas(id),
    fecha        TIMESTAMPTZ NOT NULL,
    motivo       VARCHAR(120),
    empleado_id  UUID REFERENCES empleados(id),
    notas        TEXT
);
CREATE INDEX idx_movimientos_animal ON movimientos_animal (animal_id, fecha DESC);
```

**10.5 — Turno de noche.**
```sql
ALTER TYPE tipo_turno ADD VALUE IF NOT EXISTS 'noche';
```
**[DECISIÓN]** ¿La explotación tiene realmente turno de noche? El encargo dice "y, si procede, noche". Si no lo hay, no añadirlo: falsearía el dataset. Confirmar con el cliente.
> Ojo: `turnos` tiene `UNIQUE (fecha, tipo_turno)`, por lo que solo puede haber un turno de cada tipo por día. Es correcto para este modelo, pero limita escenarios de turnos partidos.

**10.6 — Índices de rendimiento.**
Con el dataset ampliado (§9), las consultas por fecha crecerán mucho. Añadir índices en `lecturas_robot_ordeno (animal_id, ts DESC)`, `tareas_ejecuciones (ts_planificada DESC)` e `incidencias (ts_apertura DESC)` si no existen.

**Cambios en backend.** Modelos ORM correspondientes, repositorios, serializadores y endpoints para `analiticas_tanque` y `movimientos_animal`.
**Cambios en frontend.** Módulo Calidad (nueva fuente), ficha de animal (historial de movimientos), gestión de zonas (jerarquía), perfil (idioma).

**Dependencias.** Ninguna técnica; **bloquea T11**.

**Criterios de aceptación.** Migraciones aplicables desde cero y sobre una BD existente con datos; modelos ORM alineados; endpoints nuevos documentados en OpenAPI; el frontend consume la jerarquía de zonas real en lugar de la lista hardcodeada.

**Riesgos.** `ALTER TYPE … ADD VALUE` (10.5) tiene las mismas cautelas descritas en T8. Y cualquier cambio en `zonas` afecta a Tareas, Incidencias, TV, Turnos y Animales: es la tabla más referenciada del modelo.

---

### T11 — Generador de dataset realista

**Objetivo.** Sustituir el seed de demostración (~30 animales) por un generador de explotación completa y coherente.

**Descripción detallada.** Ver la propuesta completa de volúmenes y reglas de coherencia en **§9**. Aquí se describe la tarea de implementación.

**Subtareas.**
1. Crear `backend/scripts/seed_explotacion.py` **como script nuevo**, sin borrar `seed_realistic_data.py` (útil para pruebas rápidas y para los tests).
2. Hacerlo **idempotente y parametrizable**: `--animales 300 --semanas 8 --desde 2026-01-01 --seed 42`. Semilla fija para que el dataset sea reproducible.
3. Implementar en el orden de dependencias descrito en §9.2.
4. **Generación por lotes** (`bulk_insert_mappings` o `COPY`): con ~40.000 lecturas de robot, insertar fila a fila es inviable.
5. Añadir un modo `--purge` explícito y protegido para regenerar desde cero.
6. **[VERIFICADO — restricción real]** El endpoint `POST /api/v1/admin/seed-data` ejecuta el seed con `subprocess.run(timeout=300)`. Un dataset de este tamaño **superará los 300 s**. Opciones: (a) ampliar el timeout; (b) ejecutar el seed grande solo por CLI y dejar el endpoint para el seed pequeño; (c) trocear en fases invocables por separado. **Recomendación: (b) + (c)**.
7. No escribir nunca las columnas generadas (`indice_thermo_humedad`, `desviacion_pct`).
8. Documentar en `backend/scripts/README.md` cómo ejecutarlo y cuánto tarda.

**Criterios de aceptación.** Ver §9.7.

**Riesgos.** Tiempo de ejecución y tamaño de la BD. Un dataset de un año de lecturas de robot para 180 vacas son ~130.000 filas; se propone limitarlo (ver §9.3).

---

### T12 — Modo televisión profesional

**Objetivo.** Convertir `/tv` en una pantalla de monitorización real: pantalla completa, sin scroll, legible a distancia y estable durante días.

**Descripción detallada.** **[VERIFICADO]** Punto de partida: no hay Fullscreen API, el contenedor usa `min-h-screen` con `overflow-auto`, hay riesgo de recorte por `overflow-hidden` en `TvPanel`, no hay Wake Lock ni rotación de vistas. Esto es desarrollo nuevo.

**Subtareas.**

**12.1 — Pantalla completa real.**
- Añadir un botón "Pantalla completa" en `TvShell` que llame a `document.documentElement.requestFullscreen()`.
- Gestionar la salida: tecla `Escape` (el navegador la maneja), botón visible y evento `fullscreenchange` para sincronizar el estado.
- **[DECISIÓN]** ¿Entrada automática en fullscreen al abrir `/tv`? **No es posible**: los navegadores exigen un gesto del usuario. Alternativas: (a) botón explícito; (b) parámetro `?kiosk=1` + instrucción de arrancar el navegador en modo quiosco (`chrome --kiosk --app=https://…`), que es lo habitual en instalaciones fijas de explotación. **Recomendación: implementar (a) y documentar (b) como despliegue recomendado.**

**12.2 — Layout sin desbordamiento.**
- Cambiar `min-h-screen` por `h-screen` y `overflow-auto` por `overflow-hidden` en `TvShell.tsx` (L49, L84).
- Convertir la rejilla a una que reparta el alto disponible (`grid-rows-[auto_1fr]`, paneles con `min-h-0`).
- Sustituir los `.slice(0, 6)` fijos por un cálculo de cuántos elementos caben, o por paginación automática rotativa dentro del panel.
- Verificar en 1280×720, 1920×1080 y 3840×2160.

**12.3 — Legibilidad a distancia.**
- Revisar la variante `tv-scale:` existente (≥1600px, 127 usos): aumentar el salto tipográfico y añadir un punto de ruptura para 4K.
- Objetivo: ningún texto informativo por debajo de ~24 px reales a 1080p; los KPI principales muy por encima.
- Aplicar la paleta de T1 con contraste reforzado (a distancia el contraste efectivo baja).

**12.4 — Estabilidad de una pantalla permanente.**
- **Wake Lock API** (`navigator.wakeLock.request('screen')`) para que la pantalla no se apague, con reintento al recuperar visibilidad.
- Reconexión tras pérdida de red: hoy `TvRefreshStatus` muestra el estado, pero conviene una franja visible de "SIN CONEXIÓN" cuando las consultas fallan de forma sostenida.
- **[DECISIÓN]** Rotación automática entre vistas (`/tv` ↔ `/tv/shifts`) cada N segundos, activable por parámetro. Muy útil en una pantalla fija.
- Considerar el TODO existente de migrar a WebSocket/SSE (fuera del alcance mínimo).

**12.5 — Vistas TV que faltan.**
El encargo §14 pide comprobar las vistas de Zonas, Tareas, Incidencias, Alertas, **Calidad**, **Predicciones** y estado general. **[VERIFICADO]** Hoy solo existen "Estado Operativo" y "Turnos". Zonas/Tareas/Incidencias/Alertas están *dentro* de "Estado Operativo" como paneles. **Calidad y Predicciones no tienen presencia en TV.** **[DECISIÓN]** ¿Se crean vistas nuevas `/tv/quality` y `/tv/predictions`, o basta con añadir paneles a la vista general? Recomendación: **un panel de calidad en la vista general** (tendencia de grasa/proteína/RCS del tanque, alimentado por T10.1) y **no** una vista de predicciones hasta que T16 esté hecha.

**12.6 — Modo TV embebido de zona.**
`app/(app)/zones/[id]/page.tsx` tiene un toggle Gestión|TV|Tablet que no es fullscreen. Decidir si se unifica con el modo TV real o se deja como vista previa.

**Componentes afectados.** `components/tv/TvShell.tsx`, `TvPanel.tsx`, `TvKpiCard.tsx`, `TvClock.tsx`, `TvRefreshStatus.tsx`, `app/tv/page.tsx`, `app/tv/shifts/page.tsx`, `lib/tv-constants.ts`, `globals.css`.

**Dependencias.** T1 (paleta), T8 (para que el panel de incidencias críticas deje de estar vacío), T10.1 + T11 (para el panel de calidad).

**Criterios de aceptación.** El botón de pantalla completa funciona y se sale con Escape; **no hay scroll ni recorte** en 720p, 1080p y 4K; ningún texto informativo ilegible a 3 m; la pantalla no se apaga tras 30 min; una caída de red se señaliza visualmente; tras 24 h encendida no hay fugas de memoria ni datos congelados.

**Riesgos.** La Wake Lock API no está disponible en todos los navegadores/SO de TV. Si la pantalla es una smart TV con navegador limitado, puede ser necesario un dispositivo dedicado (mini-PC o Raspberry Pi en modo quiosco). **[DECISIÓN] Confirmar en qué hardware se va a mostrar.**

---

### T13 — Preparación de la integración con Hermes

**Estado: BLOQUEADA por T0.5.** Ver la propuesta de arquitectura completa en **§10**.

**Objetivo.** Dejar la aplicación preparada para sincronizar datos reales con Hermes, sin inventar el contrato de su API.

**Descripción.** **[VERIFICADO]** No existe ninguna mención a Hermes en el repositorio. Sin su documentación no se puede especificar el mapeo de campos ni los endpoints. Lo que **sí** puede hacerse ahora es construir la infraestructura de integración, que es independiente del proveedor concreto.

**Subtareas ejecutables sin la documentación.**
1. Tabla de correspondencia de identidades externas (evita duplicados en cualquier integración):
```sql
CREATE TABLE integracion_mapeo (
    id             UUID PRIMARY KEY,
    sistema        VARCHAR(40) NOT NULL,      -- 'hermes'
    entidad_tipo   VARCHAR(40) NOT NULL,      -- 'animal' | 'lactacion' | ...
    entidad_id     UUID        NOT NULL,      -- id local
    id_externo     VARCHAR(120) NOT NULL,     -- id en Hermes
    hash_payload   TEXT,                      -- para detectar cambios reales
    ts_sync        TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_mapeo_externo UNIQUE (sistema, entidad_tipo, id_externo),
    CONSTRAINT uq_mapeo_local   UNIQUE (sistema, entidad_tipo, entidad_id)
);
```
2. Tabla de registro de comunicaciones (trazabilidad):
```sql
CREATE TABLE integracion_log (
    id           BIGSERIAL PRIMARY KEY,
    sistema      VARCHAR(40) NOT NULL,
    operacion    VARCHAR(80) NOT NULL,
    direccion    VARCHAR(10) NOT NULL,        -- 'entrada' | 'salida'
    ts           TIMESTAMPTZ NOT NULL,
    estado       VARCHAR(20) NOT NULL,        -- 'ok' | 'error' | 'reintento'
    http_status  INTEGER,
    duracion_ms  INTEGER,
    registros    INTEGER,
    error_msg    TEXT,
    correlation_id UUID
);
```
3. Cliente HTTP genérico con reintentos y *backoff* exponencial (ya existe `httpx` como dependencia; `aemet_client.py` sirve de patrón).
4. Variables de entorno en `backend/app/config.py` (ver §10.4).
5. **Infraestructura de ejecución programada: hoy no existe ninguna.** Ver §10.3.

**Dependencias.** T0.5 (documentación de Hermes) para todo lo demás.

**Riesgos.** Alto riesgo de trabajo desperdiciado si se especula sobre el contrato. **No implementar mapeos hasta tener la documentación.**

---

### T14 — Audios en incidencias (opcional)

**Objetivo.** Permitir grabar y reproducir notas de voz asociadas a incidencias.

**Recomendación: aplazar a una segunda fase.** Razones:
- La tabla `adjuntos` de T7 ya contempla audio (`tipo_media`, `duracion_seg`), así que no habrá deuda de esquema.
- La grabación en navegador (`MediaRecorder`) produce formatos distintos según plataforma: **Chrome/Android graban `audio/webm;codecs=opus`, Safari/iOS graban `audio/mp4`**. No hay un formato único universal. Soportarlo bien exige transcodificación en servidor (ffmpeg), que añade una dependencia binaria pesada al contenedor.
- Requiere permisos de micrófono y, en algunos navegadores, contexto seguro HTTPS.

**Alternativa para la fase 1, más barata y probablemente más útil:** permitir **adjuntar** ficheros de audio ya grabados con la aplicación nativa del dispositivo (mismo componente de subida de T7, ampliando la lista blanca a `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`) y reproducirlos con un `<audio controls>`. Esto cubre el caso de uso real (dejar una nota de voz sobre una incidencia) sin transcodificación ni `MediaRecorder`.

**[DECISIÓN]** Confirmar si basta con la alternativa o se requiere grabación integrada.

---

### T15 — Endurecimiento de permisos y pruebas contra PostgreSQL

**Objetivo.** Cerrar los huecos de autorización detectados y eliminar la divergencia de motor en los tests.

**Subtareas.**
1. Añadir comprobación de rol a los routers que hoy solo exigen autenticación: `orders.py`, `shifts.py`, `handovers.py`, y el catálogo de tareas en `tasks.py`. **[VERIFICADO]** Alinear con `frontend/src/lib/role-capabilities.ts`, que ya define `manage_orders`, `create_order`, `manage_shifts`, `create_handover`.
2. **[VERIFICADO — riesgo]** `backend/tests/conftest.py` fuerza SQLite en memoria. Con PostgreSQL en producción, los tests no cubren tipos ENUM, JSONB, arrays ni columnas generadas. Migrar la suite a un PostgreSQL efímero (contenedor de test o `pytest-postgresql`).
3. Añadir tests de los contratos corregidos en T8 y T9.
4. Revisar `POST /api/v1/admin/seed-data`: se autentica con `X-Admin-Token` fuera del flujo JWT y ejecuta un subproceso. Confirmar que `ADMIN_SECRET` está definido en producción (**no figura en `.env.example`**) y valorar restringirlo a entornos no productivos.

**Dependencias.** T8, T9 (para los tests nuevos).

---

### T16 — Completar el servicio de predicciones

**Objetivo.** Que el módulo de Predicciones deje de devolver placeholders.

**Descripción.** **[VERIFICADO]** `predictions_service.py` devuelve **composición = 0** y confianza constante. El encargo §12 espera que los datos históricos "alimenten" las predicciones; con el código actual no lo harán para composición.

**Subtareas.**
1. Implementar el cálculo de composición prevista (grasa/proteína) a partir de las series históricas reales: media móvil por animal con corrección por días en leche, usando `analiticas_tanque` (T10.1) y/o `lactaciones`.
2. Calcular `confidence` a partir de la cantidad y dispersión de datos disponibles, no como constante.
3. Sustituir el riesgo de mastitis fijo (0,18) por una regla basada en SCC/conductividad de `lecturas_robot_ordeno` y eventos sanitarios previos.
4. Corregir la bandera `_mock`: debe reflejar honestamente si el valor es estimado o sintético.
5. **[DECISIÓN]** ¿Se mantiene el enfoque heurístico (transparente y explicable, adecuado para un TFM) o se introduce un modelo estadístico? Recomendación: **mantener heurística documentada**, pero honesta en cuanto a confianza y origen del dato.

**Dependencias.** T10.1 y T11 (necesita datos históricos reales).

---

## 5. Archivos, módulos y tablas potencialmente afectados

### 5.1 Frontend

| Ruta | Tareas |
|---|---|
| `src/app/globals.css` | T1, T2, T6, T12 |
| `tailwind.config.ts` | T1 |
| `src/app/layout.tsx` | T2, T6 |
| `src/app/(app)/layout.tsx` | T1, T2, T4, T5 |
| `src/features/auth/login-screen.tsx` | T1, T2 |
| `src/app/(app)/dashboard/page.tsx` | **T3**, T8, T1 |
| `src/app/(app)/incidents/page.tsx` | T7, T8 |
| `src/app/(app)/tasks/page.tsx` | T4, T9 |
| `src/app/(app)/quality/page.tsx` | T10.1, T4 |
| `src/app/(app)/predictions/page.tsx` | T16, T4 |
| `src/app/(app)/zones/page.tsx`, `zones/[id]/page.tsx` | T10.3, T12.6 |
| `src/app/(app)/animals/[id]/page.tsx` | T10.4 |
| `src/app/(app)/profile/page.tsx` | T5.6, T10.2 |
| `src/app/tv/page.tsx`, `src/app/tv/shifts/page.tsx` | T12, T8, T1 |
| `src/components/tv/*` (5 archivos) | T12, T1, T2 |
| `src/components/charts/MiniCharts.tsx` | T1, T4 |
| `src/components/ui/language-switcher.tsx` | T1, T5 |
| `src/components/ui/brand-logo.tsx` *(nuevo)* | T2 |
| `src/components/ui/file-upload.tsx` *(nuevo)* | T7 |
| `src/lib/i18n.ts`, `src/locales/*.json` | T5, T6 |
| `src/lib/types.ts` | T8, T9, T10 |
| `src/lib/tv-constants.ts` | T12 |
| `src/lib/visual-zones.ts` | T10.3 (eliminar hardcodeo) |
| `public/brand/*` *(nuevo)* | T2 |

### 5.2 Backend

| Ruta | Tareas |
|---|---|
| `app/enums.py` | T8, T9, T10.5 |
| `app/models/tools4milk.py` | T7, T9, T10 |
| `app/services/incidents_service.py` | **T8** |
| `app/services/tasks_service.py` | **T9** |
| `app/services/predictions_service.py` | T16 |
| `app/services/storage_service.py` *(nuevo)* | T7 |
| `app/services/hermes_client.py` *(nuevo)* | T13 |
| `app/repositories/tasks_repository.py` | T9 |
| `app/routers/attachments.py` *(nuevo)* | T7 |
| `app/routers/quality.py` *(nuevo o ampliar `lactations.py`)* | T10.1 |
| `app/routers/orders.py`, `shifts.py`, `handovers.py`, `tasks.py` | T15.1 |
| `app/config.py` | T7, T13 |
| `app/schemas/api.py` | T7, T8, T9, T10 |
| `migrations/0008…0012_*.sql` *(nuevos)* | T7, T8, T9, T10, T13 |
| `scripts/seed_explotacion.py` *(nuevo)* | T11 |
| `tests/conftest.py` + tests nuevos | T15 |

### 5.3 Tablas

**Nuevas:** `adjuntos` (T7), `analiticas_tanque` (T10.1), `movimientos_animal` (T10.4), `integracion_mapeo` (T13), `integracion_log` (T13), opcionalmente `comentarios_incidencia` (T8.6).

**Modificadas:** `incidencias` (+`resolucion`, enum `nivel_severidad`), `tareas_ejecuciones` (+`prioridad`), `empleados` (+`idioma_preferente`, +`usuario_id`), `zonas` (+`zona_padre_id`, +`orden`, +`activa`), enum `tipo_turno` (+`noche`).

**Muy pobladas por T11:** `animales`, `lactaciones`, `lecturas_robot_ordeno`, `tareas_ejecuciones`, `turnos`, `asignaciones_turno`, `incidencias`, `alertas`, `analiticas_tanque`, `resumenes_relevo`, `eventos_sanitarios`, `tratamientos_activos`, `movimientos_animal`, `boxes_recria`, `maquinaria`, `tareas_recurrentes`.

---

## 6. Dependencias entre tareas

```
T0 (desbloqueo) ──┬──> T2 (logo)
                  └──> T13 (Hermes)

T1 (tokens) ──┬──> T2 (logo)
              ├──> T4 (verificación visual)
              ├──> T6 (RTL — evitar tocar 2 veces los mismos archivos)
              └──> T12 (modo TV)

T3 (cabecera) ── independiente, ejecutable ya

T8 (contrato incidencias) ──┬──> T11 (dataset con incidencias críticas)
                            ├──> T12 (panel TV deja de estar vacío)
                            └──> T7 (evitar tocar 2 veces el serializador)

T9 (contrato tareas) ──> T11 (dataset con prioridades)

T10 (esquema) ──┬──> T11 (dataset)
                ├──> T5.6 (idioma por usuario)
                ├──> T12.5 (panel de calidad en TV)
                └──> T16 (predicciones con datos reales)

T11 (dataset) ──┬──> T4 (verificación con datos reales)
                ├──> T12 (TV con contenido real)
                └──> T16

T5 (idiomas) ──> T6 (RTL/árabe)

T7 (adjuntos img) ──> T14 (audios)
```

**Camino crítico:** `T10 → T11 → T12` (esquema → dataset → televisión). Es la secuencia más larga y la que más valor visible aporta.

**Paralelizable desde el día 1:** T3 (independiente), T1 (independiente), T8 y T9 (independientes entre sí y de T1).

---

## 7. Riesgos y decisiones pendientes

### 7.1 Bloqueantes

| # | Asunto | Impacto |
|---|---|---|
| B1 | **Logo no recibido** | T2 no puede empezar. El encargo lo daba por adjunto; no ha llegado ningún archivo y el repositorio no contiene ninguna imagen. |
| B2 | **Documentación de Hermes inexistente** | T13 no puede especificarse. Sin ella, cualquier mapeo sería invención. |

### 7.2 Decisiones de producto pendientes

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Grafía: "Tools4Milk" vs "Tools4 Milk" | Unificar a "Tools4Milk" (la del encargo) |
| D2 | Uso de "GRUPO OPERATIVO" en la interfaz | Solo en login; no en menú ni TV |
| D3 | ¿`state-info` cambia de azul para no chocar con la marca? | Sí, a azul profundo o turquesa |
| D4 | ¿Se mantienen verde/ámbar/rojo como colores de estado? | **Sí** — son señales de seguridad, no de marca |
| D5 | Almacenamiento de adjuntos: local / S3 / BYTEA | **S3 o compatible** si el despliegue es Railway |
| D6 | Severidad "crítica": ¿ampliar enum o quitar del frontend? | **Ampliar el enum** |
| D7 | Comentarios de incidencia: ¿campo JSON o tabla propia? | Tabla propia si se quiere trazabilidad real |
| D8 | ¿Existe turno de noche en la explotación? | **Confirmar con el cliente**; no inventar |
| D9 | ¿Grabación de audio integrada o solo adjuntar audio? | Solo adjuntar en fase 1 |
| D10 | Idiomas de fase 1 | es, gl, en, fr (árabe en fase 2) |
| D11 | ¿Wolof / hausa? | No en fase 1 — ver análisis en T5 |
| D12 | ¿Vistas TV nuevas de Calidad y Predicciones? | Panel de calidad sí; predicciones no hasta T16 |
| D13 | Hardware de la pantalla de TV | **Confirmar**: condiciona Wake Lock y modo quiosco |
| D14 | ¿Se añade `/tasks` al menú lateral? | Sí, salvo que sea intencionado |
| D15 | Campos del contrato siempre `null` | Implementarlos o eliminarlos |
| D16 | Calidad: ¿tanque sustituye o convive con lactaciones? | **Convive** |

### 7.3 Riesgos técnicos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `ALTER TYPE … ADD VALUE` es irreversible y sensible a transacciones | Probar en local; verificar cómo `apply_migrations.py` envuelve las transacciones |
| R2 | Adjuntos en almacenamiento efímero → **pérdida silenciosa de fotos** | Decidir D5 antes de implementar |
| R3 | Los tests corren en SQLite y producción es PostgreSQL | T15.2 |
| R4 | El seed grande supera el timeout de 300 s del endpoint admin | Ejecutar por CLI y/o trocear |
| R5 | RTL tiene enorme superficie de regresión visual | Rama propia, revisión pantalla a pantalla |
| R6 | `#1DA1F2` sobre blanco no alcanza contraste AA para texto pequeño | Usar `brand-dark` para texto; `#1DA1F2` para fondos |
| R7 | `zonas` es la tabla más referenciada; cambiarla afecta a 5 módulos | Migración cuidadosa + T4 |
| R8 | No hay planificador: las tareas recurrentes no se generan solas | Fuera de alcance, pero **debe saberse**: el dataset las creará, pero no se autogenerarán después |
| R9 | Auto-commit del repositorio a `main` | Trabajar en rama; confirmar política antes de empezar |

---

## 8. Propuesta de estructura de datos

Resumen consolidado de los cambios de esquema (detalle en T7, T8, T9, T10, T13).

**Tablas nuevas**

| Tabla | Propósito | Tarea |
|---|---|---|
| `adjuntos` | Ficheros (imagen/audio) asociados a entidades | T7 |
| `analiticas_tanque` | Calidad de leche de tanque: lactosa, bacteriología, urea, temperatura, volumen, lote | T10.1 |
| `movimientos_animal` | Historial de ubicación de cada animal | T10.4 |
| `comentarios_incidencia` *(opcional)* | Comentarios con autor y fecha | T8.6 |
| `integracion_mapeo` | Correspondencia id local ↔ id externo (anti-duplicados) | T13 |
| `integracion_log` | Trazabilidad de comunicaciones con sistemas externos | T13 |

**Modificaciones**

| Tabla / tipo | Cambio | Tarea |
|---|---|---|
| `nivel_severidad` (ENUM) | `+ 'critica'` | T8 |
| `incidencias` | `+ resolucion TEXT` | T8 |
| `prioridad_tarea` (ENUM nuevo) | baja/normal/alta/urgente | T9 |
| `tareas_ejecuciones` | `+ prioridad` | T9 |
| `empleados` | `+ idioma_preferente`, `+ usuario_id` | T10.2 |
| `zonas` | `+ zona_padre_id`, `+ orden`, `+ activa` | T10.3 |
| `tipo_turno` (ENUM) | `+ 'noche'` *(sujeto a D8)* | T10.5 |

---

## 9. Propuesta de dataset

### 9.1 Volúmenes objetivo

| Entidad | Volumen | Notas |
|---|---|---|
| **Animales** | **300** | Distribución en §9.4 |
| Empleados | **7** | Nombres ficticios (§9.5) |
| Zonas | ~12 | Jerárquicas (§9.6) |
| Maquinaria | 8-10 | 2 robots de ordeño, carro mezclador, amamantadora, bombas |
| Lactaciones | ~420 | Histórico: 1-4 por vaca adulta |
| Turnos | **8 semanas × 2-3/día** ≈ 112-168 | Con asignaciones |
| Asignaciones de turno | ~350 | 2-3 empleados por turno |
| Resúmenes de relevo | ~110 | Uno por transición de turno |
| Tareas (catálogo) | ~25 | Cubriendo las 12 categorías del encargo |
| Tareas recurrentes | ~18 | Con `frecuencia_expr` coherente |
| Tareas ejecuciones | **~2.000** | 8 semanas × ~35/día |
| Incidencias | **~120** | Repartidas en 8 semanas, todos los tipos y severidades |
| Alertas | ~150 | Ligadas a animales y umbrales |
| Analíticas de tanque | **~240** | Diarias, 8 meses de histórico |
| Lecturas de robot | **~40.000** | 180 vacas × 2,5 ordeños × 90 días |
| Eventos sanitarios | ~180 | Mastitis, cojeras, metritis… |
| Tratamientos activos | ~45 | Con periodos de retirada |
| Eventos reproductivos | ~500 | Celos, inseminaciones, partos, secados |
| Movimientos de animal | ~600 | Cambios de zona coherentes |
| Boxes de recría | 20 | Ocupación parcial |
| Pedidos | ~40 | Varios estados |
| Lecturas meteo | ~240 | Diarias |

**Total aproximado: ~45.000 filas**, dominadas por las lecturas de robot.

**[DECISIÓN]** El histórico de lecturas de robot es el que dispara el volumen. Se propone **90 días** como compromiso entre realismo y tamaño. Un año completo serían ~130.000 filas.

### 9.2 Orden de generación (dependencias)

```
1. zonas (jerarquía)         6. lactaciones            11. incidencias
2. maquinaria                7. eventos reproductivos  12. alertas
3. empleados (+usuarios)     8. eventos sanitarios     13. analíticas de tanque
4. tareas_catalogo           9. tratamientos            14. lecturas de robot
5. animales (+movimientos)  10. turnos + asignaciones   15. resúmenes de relevo
                                 + tareas_ejecuciones   16. pedidos, meteo, boxes
```

### 9.3 Reglas de coherencia (obligatorias)

Estas reglas son lo que diferencia un dataset realista de datos aleatorios:

1. **Animal ↔ zona:** todo animal activo tiene `zona_id` coherente con su estado (vacas en producción en la nave/ordeño; recría en su zona; animales en tratamiento en enfermería).
2. **Producción ↔ lactación:** solo los animales con `estado = produccion` y lactación activa (sin `fecha_secado`) generan `lecturas_robot_ordeno`.
3. **Curva de lactación real:** la producción diaria debe seguir una curva de Wood — pico a los 45-70 días tras el parto, descenso progresivo. **No generar producción plana ni aleatoria.** Vacas de primer parto producen ~20 % menos que las multíparas.
4. **Calidad ↔ estación y producción:** grasa y proteína suben en invierno y bajan en verano, y **correlacionan inversamente con el volumen**. Rangos plausibles: grasa 3,5-4,2 %, proteína 3,1-3,5 %, lactosa 4,6-4,9 %, RCS 120-300 (miles/ml), bacteriología 10-50 (miles UFC/ml), urea 20-30 mg/dl.
5. **Episodios anómalos (el encargo los pide explícitamente):** insertar 2-3 eventos deliberados y **trazables entre módulos**, por ejemplo:
   - Un pico de RCS a 450.000 durante 5 días → acompañado de casos de mastitis en `eventos_sanitarios`, tratamientos con periodo de retirada, una incidencia de tipo `calidad_leche` con severidad `alta`/`critica`, y alertas.
   - Una avería del robot de ordeño → caída de producción esos días, incidencia `averia_maquinaria` crítica, tareas de mantenimiento, y `intentos_fallidos` elevados en las lecturas.
   - Un problema de alimentación → descenso de proteína y urea alterada, incidencia `alimentacion`, desviación en `lecturas_carro_mezclador`.
6. **Tratamiento ↔ retirada:** todo tratamiento con fármaco implica `periodo_retirada_hasta`, y la leche de ese animal no debe computar en el tanque durante ese periodo.
7. **Turnos ↔ asignaciones ↔ tareas:** cada turno tiene 2-3 empleados; las tareas de ese turno se asignan solo a empleados asignados a él y a zonas coherentes con su `zona_principal_id` y sus `cualificaciones`.
8. **Relevos ↔ turnos:** cada `resumen_relevo` referencia un turno saliente y otro entrante **consecutivos y existentes**, y sus JSON de incidencias/tareas pendientes deben corresponder a registros reales de esa fecha.
9. **Estados de tarea coherentes con el tiempo:** tareas pasadas → completadas o vencidas; tareas de hoy → mezcla de pendiente/en_curso/completada; futuras → pendientes. **Ninguna tarea futura puede estar completada.**
10. **Incidencias ↔ resolución:** las cerradas tienen `ts_cierre > ts_apertura` con un tiempo de resolución plausible según severidad (críticas en horas, bajas en días).
11. **Distribución temporal no uniforme:** más incidencias en días de avería, más tareas en días laborables, menos actividad en fines de semana.
12. **Edad ↔ estado:** un animal en `produccion` tiene ≥ 22 meses y al menos un parto; la recría, < 24 meses; las novillas gestantes, 15-24 meses.

### 9.4 Distribución de los 300 animales

Ajustada al enum real `EstadoAnimal` (produccion, seca, recria, gestante, baja):

| Estado | Nº | Corresponde a |
|---|---|---|
| `produccion` | **180** | Vacas en lactación (objetivo del encargo) |
| `seca` | 35 | Vacas en periodo seco |
| `gestante` | 45 | Novillas gestantes y vacas confirmadas |
| `recria` | 40 | Terneras y novillas jóvenes (20 en boxes) |
| **Subtotal activos** | **300** | |
| `baja` | +25 | Históricas (no cuentan en el censo activo) |

> **Nota sobre "enfermería":** no es un estado del animal sino una **zona**. Los animales en tratamiento mantienen su estado productivo y se ubican en `zona_id = enfermería`. Igualmente, "novillas" no es un estado del enum: se representan como `recria` (jóvenes) o `gestante` (cubiertas). Esto debe respetarse para no falsear el modelo.

**Identificación:** crotales con formato español realista pero claramente ficticio, p. ej. `ES` + 12 dígitos con prefijo fijo reservado para pruebas. Nombres opcionales de vaca (tradición gallega: *Marela*, *Pinta*, *Xoiba*…) para ~40 % de los animales.

### 9.5 Los 7 trabajadores

Datos **ficticios**, no personas reales. Estructura alineada con el enum `rol_empleado` (encargado, auxiliar, veterinario, mecanico) y con los roles de aplicación (`admin`, `operario`, `alimentacion`, `veterinario`):

| # | Rol empleado | Rol app | Zona principal | Idioma | Turno habitual |
|---|---|---|---|---|---|
| 1 | encargado | admin | Nave principal | es | mañana |
| 2 | auxiliar | operario | Sala de ordeño | gl | mañana |
| 3 | auxiliar | operario | Recría | fr | tarde |
| 4 | auxiliar | alimentacion | Zona de alimentación | es | mañana |
| 5 | auxiliar | operario | Nave principal | fr | tarde |
| 6 | veterinario | veterinario | Enfermería | es | variable |
| 7 | mecanico | operario | Zona de maquinaria | es | variable |

Cada uno con: `cualificaciones` (array), teléfono y email ficticios de dominio de ejemplo, `fecha_alta`, `activo = true` (uno inactivo para probar el filtrado), historial de turnos y de tareas.

### 9.6 Estructura de zonas propuesta

Aprovechando la jerarquía de T10.3, **sin duplicar las zonas existentes** (verificar antes los `codigo` ya presentes: el frontend referencia `boxes_terneros`, `zona_recria`, `recria`, `becerrero`, `patio_alimentacion`, `enfermeria`, `maquinaria`, `robots`, `sala_ordeno`, `silos`, `almacen`, `oficina`, `general`):

```
RECRÍA (raíz)
├── Boxes externos           (boxes_terneros)
└── Zona general de recría   (zona_recria)

NAVE PRINCIPAL (raíz)
├── Zona de alimentación     (patio_alimentacion)
├── Enfermería               (enfermeria)
├── Zona de maquinaria       (maquinaria)
├── Sala de ordeño           (sala_ordeno)
├── Robots de ordeño         (robots)
├── Silos                    (silos)
└── Almacén                  (almacen)

SERVICIOS (raíz)
└── Oficina                  (oficina)
```

Esto permite además **eliminar el hardcodeo** de `TV_VISUAL_ZONES` en `tv/page.tsx` y de `lib/visual-zones.ts`, que hoy replica esta agrupación en el código.

### 9.7 Criterios de aceptación del dataset

- El censo activo es exactamente 300 animales, con ~180 en producción.
- Toda vaca en producción tiene lactación activa y lecturas de robot en los últimos 90 días.
- No existe ningún registro huérfano (FK rotas = 0).
- Ninguna tarea futura está completada.
- Los 3 episodios anómalos son **trazables de extremo a extremo**: se ven en Calidad, generan incidencias, alertas y tareas, y son visibles en el modo TV.
- El dashboard, LeanFarming, Calidad, Incidencias, Zonas y TV muestran datos plausibles sin huecos ni "—".
- El generador es reproducible con la misma semilla.
- Ningún dato personal corresponde a una persona real.

---

## 10. Propuesta de integración con Hermes

> **[BLOQUEANTE]** No hay ninguna referencia a Hermes en el repositorio y no se dispone de su documentación. **Todo lo que sigue es arquitectura propuesta, agnóstica del proveedor.** No se especifica ningún endpoint de Hermes porque sería inventado.

### 10.1 Información requerida antes de implementar

1. Especificación de la API (OpenAPI/Swagger, o documentación equivalente).
2. Modelo de autenticación: OAuth2 *client credentials*, API key, mTLS, otro.
3. Entornos disponibles (sandbox/preproducción) y credenciales de prueba.
4. Catálogo de entidades expuestas y su granularidad.
5. Dirección del flujo: ¿Tools4Milk **lee** de Hermes, **escribe** en Hermes, o ambas?
6. Límites de uso (rate limits), paginación y política de errores.
7. ¿Ofrece webhooks o solo consulta? ¿Soporta consultas incrementales por fecha de modificación?
8. Identificadores: ¿qué campo es la clave estable de cada entidad?
9. Requisitos legales/RGPD si se intercambian datos de personas.

### 10.2 Arquitectura propuesta (capa anticorrupción)

```
Hermes API
    │  HTTPS + auth
    ▼
HermesClient (app/services/hermes_client.py)
    · httpx.AsyncClient con timeout
    · reintentos con backoff exponencial + jitter
    · circuit breaker
    · registro en integracion_log
    ▼
HermesMapper (app/services/hermes_mapper.py)
    · traduce el modelo de Hermes al modelo Tools4Milk
    · ÚNICO punto que conoce el formato externo
    ▼
SyncService (app/services/hermes_sync.py)
    · idempotencia vía integracion_mapeo (id_externo → id local)
    · upsert por hash_payload (evita escrituras sin cambios)
    · resolución de conflictos
    ▼
Repositorios / BD
```

El punto clave es que **solo `HermesMapper` conoce el formato externo**. Si Hermes cambia, se toca un archivo.

### 10.3 Modo de sincronización

**[VERIFICADO]** No existe ninguna infraestructura de ejecución programada: ni Celery, ni APScheduler, ni cron, ni colas. Hay que crearla.

| Modo | Cuándo | Coste |
|---|---|---|
| **Bajo demanda** (endpoint manual) | Fase 1, para validar el mapeo | Bajo — patrón ya existente en `POST /weather/sync` |
| **Programada** (APScheduler en el proceso, o cron externo) | Fase 2, sincronización nocturna | Medio |
| **Webhooks entrantes** | Si Hermes los ofrece: `POST /api/v1/integrations/hermes/webhook` con validación de firma HMAC | Medio |
| **Cola (Celery/Redis)** | Solo si el volumen lo exige | Alto — nueva dependencia de infraestructura |

**Recomendación:** empezar por **bajo demanda**, replicando el patrón ya probado de AEMET; añadir programación cuando el mapeo esté validado. No introducir Celery sin necesidad demostrada.

### 10.4 Variables de entorno a crear

En `backend/app/config.py` (pydantic-settings), siguiendo el patrón existente:

| Variable | Propósito |
|---|---|
| `HERMES_ENABLED` | Interruptor general (por defecto `false`) |
| `HERMES_BASE_URL` | URL base de la API |
| `HERMES_AUTH_MODE` | `oauth2` \| `apikey` \| `mtls` |
| `HERMES_CLIENT_ID` | Credencial (si OAuth2) |
| `HERMES_CLIENT_SECRET` | **Secreto** |
| `HERMES_API_KEY` | **Secreto** (si API key) |
| `HERMES_TIMEOUT_SECONDS` | Por defecto 30 |
| `HERMES_MAX_RETRIES` | Por defecto 3 |
| `HERMES_SYNC_INTERVAL_MINUTES` | Si hay programación |
| `HERMES_WEBHOOK_SECRET` | **Secreto**, validación HMAC |
| `HERMES_ENVIRONMENT` | `sandbox` \| `production` |

### 10.5 Seguridad y buenas prácticas

- **Nunca** en el repositorio: añadir todos los `HERMES_*` a `.env.example` **solo con nombres y valores vacíos**. Verificar que `.env` está en `.gitignore`. **[VERIFICADO]** `ADMIN_SECRET` hoy **no figura en `.env.example`** — mismo error a no repetir.
- Los secretos nunca llegan al frontend: toda la comunicación con Hermes es **servidor a servidor**. Ninguna variable `NEXT_PUBLIC_*`.
- Registrar en `integracion_log` sin volcar credenciales ni datos personales; truncar cuerpos largos.
- `correlation_id` por operación para poder seguir una sincronización de principio a fin.
- Permisos: los endpoints de sincronización manual, solo para `admin`.

### 10.6 Distinguir datos reales de datos de prueba

Necesario porque conviviremos con el dataset sintético de T11:

- Columna `origen VARCHAR(20) NOT NULL DEFAULT 'manual'` (`manual` | `seed` | `hermes`) en las tablas sincronizables, **o** derivarlo de la presencia de fila en `integracion_mapeo` (más limpio, sin tocar tablas).
- **Recomendación:** usar `integracion_mapeo` como fuente de verdad del origen externo, y marcar los datos de seed con un flag propio para poder purgarlos sin arrastrar datos reales.
- `HERMES_ENVIRONMENT` debe impedir que un entorno de desarrollo escriba en la Hermes de producción.

### 10.7 Pruebas en desarrollo

- Simulador local de Hermes con `respx` (compatible con httpx, ya en dependencias) o un contenedor WireMock.
- Contratos grabados a partir del sandbox real, si existe.
- Pruebas de: reintento tras 5xx, idempotencia (sincronizar dos veces no duplica), manejo de campos ausentes, y expiración de token.

---

## 11. Plan de pruebas

### 11.1 Identidad visual (T1, T2)

| # | Prueba | Criterio |
|---|---|---|
| V1 | `grep -rE "#[0-9a-fA-F]{6}" frontend/src --include=*.tsx` | 0 resultados |
| V2 | Contraste AA en botón primario, enlaces, badges, tablas y TV | ≥4,5:1 texto normal, ≥3:1 grande |
| V3 | El verde solo aparece como `state-ok` | Revisión visual de los 6 módulos |
| V4 | Logo en sidebar (fondo oscuro), login (claro) y TV | Sin deformación ni recorte |
| V5 | Logo a 1080p y 4K | Nítido (SVG) |
| V6 | Favicon y metadatos | Visible en pestaña; OG correcto |
| V7 | El icono `Milk` sigue en dashboard y management como icono de KPI | No sustituido por el logo |
| V8 | Grafía del nombre unificada | Coherente en 6 ubicaciones |

### 11.2 Cabecera del dashboard (T3)

| # | Prueba | Criterio |
|---|---|---|
| C1 | "TV Global" y "Actualización cada 30 s" no aparecen | Ausentes |
| C2 | `/tv` sigue accesible | Desde los 4 puntos restantes |
| C3 | Cabecera equilibrada sin hueco | Revisión visual |
| C4 | Sin claves de traducción huérfanas ni imports muertos | `npm run build` + lint limpios |

### 11.3 Módulos existentes (T4)

Para cada uno de los 6 módulos (LeanFarming, Incidencias, Todos, Calidad, Predicciones, Zonas): carga sin error, nueva paleta aplicada, datos del nuevo dataset visibles, gráficos legibles, sin regresión funcional, y comportamiento correcto en TV cuando aplique.

### 11.4 Idiomas (T5, T6)

| # | Prueba | Criterio |
|---|---|---|
| I1 | Cambio entre los 4 idiomas | Sin recarga; sin claves crudas visibles |
| I2 | Persistencia | Sobrevive a recarga y, si D-T5.6, viaja con el usuario |
| I3 | Sin literales españoles en los módulos principales con `en`/`fr` activos | Inspección visual |
| I4 | Terminología ganadera | Revisada por persona del dominio |
| I5 | Desbordamiento en francés | Menú, botones, badges y TV sin corte |
| I6 | Árabe: `dir=rtl` | Layout espejado correctamente |
| I7 | Árabe: iconos direccionales | Invertidos |
| I8 | Árabe: identificadores latinos (crotales) | Legibles, sin desorden bidireccional |
| I9 | Árabe: fuente | Glifos correctos, sin cuadros vacíos |
| I10 | Vuelta a español tras árabe | Sin restos de RTL |

### 11.5 Adjuntos (T7, T14)

| # | Prueba | Criterio |
|---|---|---|
| A1 | Captura desde cámara en tablet | Se adjunta y previsualiza |
| A2 | Subida desde galería/PC | Correcta |
| A3 | Fichero > límite | Rechazado con mensaje claro |
| A4 | `.exe` renombrado a `.jpg` | **Rechazado** (validación por magic bytes) |
| A5 | SVG malicioso | **Rechazado** (fuera de lista blanca) |
| A6 | Usuario sin permiso accede a la URL del fichero | **Denegado** |
| A7 | Borrado | Desaparece de la incidencia y del almacenamiento |
| A8 | **Persistencia tras redespliegue** | Las fotos siguen ahí (crítico, ver R2) |
| A9 | Metadatos EXIF | Eliminados tras la subida |
| A10 | Audio adjunto | Se reproduce en navegador |

### 11.6 Base de datos y dataset (T10, T11)

| # | Prueba | Criterio |
|---|---|---|
| D1 | Migraciones desde cero | Aplicación limpia |
| D2 | Migraciones sobre BD con datos | Sin pérdida |
| D3 | Integridad referencial | 0 FK huérfanas |
| D4 | Censo | 300 activos, ~180 en producción |
| D5 | Coherencia temporal | Ninguna tarea futura completada |
| D6 | Curva de lactación | Pico a los 45-70 días, no plana |
| D7 | Los 3 episodios anómalos | Trazables en Calidad → incidencias → alertas → tareas → TV |
| D8 | Reproducibilidad | Misma semilla, mismo resultado |
| D9 | Datos personales | Todos ficticios |
| D10 | Rendimiento del dashboard con el dataset completo | Carga < 2 s |

### 11.7 Contratos corregidos (T8, T9)

| # | Prueba | Criterio |
|---|---|---|
| K1 | Crear incidencia `critica` | Se guarda y se lista |
| K2 | Panel "Incidencias críticas" en TV | **Muestra datos** (hoy imposible) |
| K3 | Título y descripción de incidencia | Visibles y distintos |
| K4 | Tarea urgente no vencida | Existe y se distingue de las retrasadas |
| K5 | Campos del contrato | Sin `null` fijos injustificados |

### 11.8 Modo televisión (T12)

| # | Prueba | Criterio |
|---|---|---|
| T1 | Botón de pantalla completa | Entra en fullscreen |
| T2 | Salida con Escape y con botón | Correcta, sin estado inconsistente |
| T3 | 1280×720 / 1920×1080 / 3840×2160 | **Sin scroll ni recorte** |
| T4 | Legibilidad a 3 m | Todo el texto informativo legible |
| T5 | Contraste con la nueva paleta a distancia | Suficiente |
| T6 | Wake Lock | Pantalla encendida tras 30 min |
| T7 | Pérdida de red | Señalización visible |
| T8 | 24 h encendida | Sin fuga de memoria ni datos congelados |
| T9 | Auto-refresh | Datos actualizados en los intervalos definidos |
| T10 | Estado de carga | Sin saltos bruscos de layout |

### 11.9 Integración Hermes (T13)

Solo ejecutable tras desbloquear B2: autenticación correcta; sincronizar dos veces **no duplica**; reintento tras 5xx; secretos ausentes del repositorio y del frontend; `integracion_log` registra cada operación; el entorno de desarrollo no escribe en producción.

### 11.10 Seguridad y rendimiento (transversal)

- Endpoints de pedidos, turnos, relevos y catálogo de tareas con comprobación de rol (T15.1).
- Tests ejecutándose contra PostgreSQL (T15.2).
- Sin secretos en el repositorio.
- Carga del dashboard y del modo TV con el dataset completo por debajo de 2 s.
- Compatibilidad verificada en: móvil (360 px), tablet (768-1024 px), escritorio (1440 px) y TV (1920/3840 px).

---

## 12. Orden recomendado de implementación

### Fase 0 — Desbloqueo (antes de escribir código)
**T0 completa.** Conseguir el logo, la documentación de Hermes y cerrar las 16 decisiones de §7.2. Sin esto, dos tareas quedan paradas y varias se implementarían sobre suposiciones.

### Fase 1 — Victorias rápidas y base visual (~1 semana)
1. **T3** — Limpieza de la cabecera. Es la tarea más corta y no depende de nada.
2. **T1** — Rebranding por tokens. Alto impacto visible, riesgo contenido.
3. **T2** — Logo (en cuanto llegue el archivo).
4. **T4** (primera pasada) — Verificación visual de los 6 módulos.

> Al final de esta fase la aplicación ya **parece** Tools4Milk, que es el cambio más visible para el cliente.

### Fase 2 — Corrección de cimientos (~1-1,5 semanas)
5. **T8** — Contrato de incidencias (desbloquea el panel de TV).
6. **T9** — Contrato de tareas.
7. **T10** — Ampliación de esquema.

> Se hace **antes** del dataset a propósito: generar 45.000 filas sobre un esquema que después cambia obliga a regenerarlo todo.

### Fase 3 — Datos (~1 semana)
8. **T11** — Generador de dataset.
9. **T4** (segunda pasada) — Verificación de los módulos ya con datos realistas.
10. **T16** — Predicciones, que ahora sí tienen histórico del que tirar.

### Fase 4 — Televisión (~1 semana)
11. **T12** — Modo TV profesional. Se deja para después de T8/T11 para que la pantalla muestre contenido real y con los paneles ya funcionales.

### Fase 5 — Multiidioma (~1-1,5 semanas)
12. **T5** — Completar cobertura + gallego y francés.
13. **T6** — RTL y árabe. **En rama propia**, por su superficie de regresión.

### Fase 6 — Adjuntos (~1 semana)
14. **T7** — Fotografías en incidencias.
15. **T14** — Audios, si se confirma (recomendado: solo adjuntar, no grabar).

### Fase 7 — Consolidación
16. **T15** — Permisos y tests contra PostgreSQL.
17. **T13** — Hermes, cuando haya documentación.

### Notas de ejecución

- **Trabajar en ramas.** **[VERIFICADO]** Este repositorio tiene un mecanismo que **commitea automáticamente a `main`** los cambios de edición (hay commits recientes de `railway-app[bot]` y auto-commits generados durante la sesión de auditoría). Antes de empezar, confirmar la política de ramas para que un cambio a medias no llegue a producción.
- **Verificar con `npm run build` tras cada tarea de frontend.** Actualmente el build pasa limpio (24 rutas, TypeScript estricto): es una buena red de seguridad.
- **No mezclar T6 (RTL) con otras tareas**: toca ~91 puntos repartidos por casi todo el frontend.
- **Regenerar el dataset tras cualquier cambio de esquema posterior a T11.**

---

## Anexo A — Resumen de lo que NO se ha podido verificar

Por honestidad metodológica, estos puntos del encargo quedan abiertos y **no deben implementarse por suposición**:

1. **El logo** — no recibido; no hay ninguna imagen en el repositorio.
2. **La API de Hermes** — sin documentación, sin credenciales, sin referencias en el código.
3. **Si la explotación tiene turno de noche** — el modelo solo contempla mañana y tarde.
4. **El hardware de la pantalla de TV** — condiciona Wake Lock, modo quiosco y resolución objetivo.
5. **El destino definitivo del despliegue** (Railway vs. on-premise) — condiciona por completo la decisión de almacenamiento de adjuntos.
6. **Los datos reales de los 7 trabajadores** — se usarán datos ficticios mientras no se proporcionen.
7. **Los códigos de zona ya existentes en la base de datos de producción** — la propuesta de §9.6 debe contrastarse con el contenido real de la tabla `zonas` antes de crear zonas nuevas, para no duplicar.

---

*Fin del documento.*
