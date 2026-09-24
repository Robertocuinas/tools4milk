# Tercer paquete de mejoras — diseño

## Objetivo

Mejorar la operación diaria de Tools4Milk en Informes, Lean Farming, Turnos,
Calidad, Zonas, TV, Animales e Idiomas. El paquete prioriza datos reales,
consistencia entre pantallas y una interfaz operativa responsive.

## Principios

- Un indicador de negocio tiene una única fuente de cálculo reutilizable.
- Las pantallas no infieren pertenencia a una zona por el estado del animal:
  usan la relación real `zona_id` cuando esté disponible.
- La tabla de animales se ordena y filtra en el servidor para mantener una
  paginación correcta.
- Los cambios compartidos se hacen únicamente durante integración, después de
  terminar los cambios propietarios de cada módulo.
- Los seeds de desarrollo son deterministas, idempotentes y usan entidades
  existentes; no se insertan datos de demostración en producción.
- No se añade una librería de iconos: la vaca será un componente SVG local y
  reutilizable si la versión instalada de Lucide no exporta ese icono.

## Oleadas y ownership

| Oleada | Área | Ownership exclusivo |
| --- | --- | --- |
| 1 | Informes | `frontend/src/app/(app)/report/page.tsx` |
| 1 | Turnos | `frontend/src/app/(app)/shifts/page.tsx` |
| 1 | Calidad | `frontend/src/app/(app)/quality/page.tsx` |
| 1 | Seeds Lean | `backend/scripts/seed_realistic_data.py` y documentación asociada |
| 1 | Idiomas | auditoría y, solo si procede, `frontend/src/lib/i18n-config.ts` y `frontend/src/components/ui/language-switcher.tsx` |
| 2 | Animales | listado frontend, contrato de animales y sus pruebas |
| 2 | Zonas UI | `frontend/src/app/(app)/zones/*` y `frontend/src/components/zone/*` |
| 2 | Zonas TV | `frontend/src/components/tv/*` y `frontend/src/lib/tv-mode.ts` |
| 3 | Integración | icono, locales compartidos, conexión Zonas/TV, QA y correcciones transversales |

Ningún propietario edita archivos reservados para otro. En particular, Zonas UI
no modifica la infraestructura TV; la integración conecta el callback de salida
de TV con el estado local de la página de detalle.

## Informes, Turnos y Calidad

Informes conserva el KPI de incidencias críticas ya existente, que consume el
agregado operativo común. El KPI de incidencias activas se reduce a una celda
normal, sin variar la semántica. La auditoría de la zona inferior corrige
estados de carga, error y vacío por panel, datos nulos, contenedores y respuesta
móvil. Las consultas con límites que puedan truncar totales se sustituyen por
un agregado o paginación correcta; no se oculta el problema con un ajuste visual.

Turnos elimina toda la franja superior de KPI, incluida Asignaciones y el
espacio residual. Se conservan consultas, planificación y listado de empleados.

Calidad sustituye Calidad media por cuatro KPI homogéneos: grasa media,
proteína media, producción media y RCS media. Usa el resumen de calidad
existente y conserva cualquier score empleado fuera de esa franja. La cuadrícula
es de cuatro columnas en escritorio y 2×2 en tamaños pequeños.

## Lean Farming

El seed mínimo de desarrollo garantizará tareas pendientes/programadas,
urgentes, retrasadas y ejecutadas, distribuidas entre zonas y empleados que ya
existan. Se respetan los tipos y estados del modelo; no se requieren migraciones.
El seed completo existente no se reestructura salvo que la auditoría demuestre
que no garantiza la cobertura solicitada.

## Animales

El endpoint de listado de animales se amplía de forma compatible con
`produccion_promedio` de la lactación activa y `tratamientos_activos`, contado
solo cuando `TratamientoActivo.activo` es verdadero. El cálculo será agregado o
en lote, nunca N+1.

El listado pasa a tabla: nombre, código, producción media, tratamientos activos
y estado. Una fila, nombre o acción abre la ficha ya existente. El orden inicial
es producción primero y, dentro de ese grupo, producción media descendente. El
servidor admite búsqueda por nombre/código y orden por producción, nombre,
código o estado para preservar el orden entre páginas. Los badges reflejan solo
estados presentes en el sistema.

## Zonas y TV

La configuración central de zonas sustituye duplicaciones y admite todas las
zonas reales, no solo Nave y Recría. Cada detalle actúa como centro operativo
local con datos reales pertinentes de animales, tareas, incidencias, alertas,
tratamientos y maquinaria; cada bloque cuenta con carga, error y vacío.

El modo TV sincroniza siempre el estado React con Fullscreen API. Al pulsar
Salir, abandona fullscreen y vuelve explícitamente a Gestión, incluso si la
ruta no cambia. `fullscreenchange` actualiza la interfaz tras Escape y se
limpian listeners y fullscreen al desmontar. Se evita mezclar la navegación
histórica del TV global con el TV local de zonas.

## Idiomas e iconografía

La configuración actual centralizada de cinco idiomas (`es`, `en`, `gl`, `fr`,
`ar`) alimenta todos los selectores. Se verifican nombres nativos, persistencia
y cambio de dirección RTL para árabe; solo se cambia código si la auditoría
encuentra una desviación visual o de fuente.

El icono funcional Beef se reemplaza en todos sus consumidores por una vaca
coherente visualmente. El componente compartido se añade en integración para no
crear colisiones con las páginas propietarias.

## Validación

- Backend: contratos del listado de animales, tratamiento activo frente a
  histórico, búsqueda/orden/paginación y agregado operativo de Informes.
- Frontend: `npm run typecheck`, `npm run lint` y `npm run build`.
- Funcional: cargas, errores, vacío, escritorio, móvil y RTL de cada pantalla.
- Recorrido TV: Gestión → TV → fullscreen → Salir → Gestión; Escape; reentrada;
  navegación durante fullscreen.
- Seed en base de datos de desarrollo desechable y comprobación de estados,
  prioridades, zonas y empleados asociados.

No se modifican los artefactos locales preexistentes `.playwright-cli/*` ni
`current.yaml`.
