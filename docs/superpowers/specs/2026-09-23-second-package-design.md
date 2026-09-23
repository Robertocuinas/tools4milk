# Segundo paquete de mejoras — diseño

## Objetivo

Reorganizar las pantallas operativas de Tools4Milk sin duplicar cálculos,
mejorar Farming y Zonas, y convertir el dictado existente en un flujo de
autocompletado revisable para incidencias y pedidos.

## Principios

- Control de explotación, Incidencias e Informes comparten agregados de
  negocio; ningún recuento equivalente se calcula por separado en el cliente.
- La tendencia por criticidad se implementa una vez y se muestra en
  Incidencias e Informes, no en el panel operativo.
- El dictado conserva la transcripción actual Vosk/Whisper. La extracción es
  determinista, explicable y no persiste datos sin confirmación humana.
- Gestión, TV y Tablet de zonas son vistas distintas. TV reutiliza el sistema
  fullscreen existente; Tablet conserva o documenta su comportamiento táctil.
- Las claves de traducción, API común, componentes reutilizados y layouts
  globales se modifican únicamente durante integración.

## Datos operativos compartidos

Se añadirá un agregado de backend para el estado operativo actual, con la
misma semántica en Control e Informes:

- incidencias abiertas, críticas y totales;
- tareas retrasadas, pendientes/programadas y ejecutadas;
- animales en alerta, agrupados por severidad disponible;
- producción disponible cuando exista una fuente ya usada por el producto.

El agregado define explícitamente que las incidencias son actuales y las
tareas usan su estado actual. Informes puede etiquetar filtros temporales
propios para análisis histórico, pero sus KPI equivalentes usarán el mismo
agregado cuando se etiqueten como estado actual.

## Pantallas

### Control de explotación

Se retira la tendencia histórica. Se añade un bloque legible de animales en
alerta y un KPI compacto de incidencias críticas con enlace al listado
filtrado. El resto de acciones operativas se mantiene.

### Informes e Incidencias

Informes incorpora el resumen operativo global y la tendencia reutilizable.
Incidencias divide el resumen principal en KPI de críticas y totales, e
incorpora la misma tendencia. El componente de tendencia toma la misma fuente
de datos y admite el contexto visual de ambas páginas, sin duplicar lógica.

### Farming

Los KPI se organizan en una cuadrícula 2×2: retrasadas, urgentes,
programadas y ejecutadas. La planificación semanal pasa a acordeones por día
y turno, inicialmente cerrados salvo el periodo actual; las tareas se ordenan
por retrasada, programada/pendiente y ejecutada. Se elimina Carga de trabajo
y los tres controles superiores solicitados. El catálogo se conserva.

### Zonas y TV

Se corrigen únicamente defectos de alineación, espaciado y respuesta móvil.
La vista de detalle conserva Gestión, ofrece TV mediante el shell fullscreen
existente y mantiene Tablet como vista táctil diferenciada cuando ya exista.
Se elimina el acceso TV de Turnos.

### Dictado

Tras transcribir, un extractor determinista devuelve solo campos que detecta
con evidencia: zona, tipo, prioridad y título para incidencias; cliente,
productos/cantidades, fecha y observaciones para pedidos. Las coincidencias
ambiguas quedan vacías. El formulario muestra los valores editables y el
usuario guarda manualmente.

## Ownership y orden

| Fase | Ownership exclusivo |
| --- | --- |
| Datos | router, servicio, schema y pruebas de agregado operativo y extracción |
| Pantallas | dashboard, report/incidents, Farming, zonas/turnos y pedidos en scopes separados |
| Integración | clientes API comunes, gráfica, TV compartido, locales y layouts |

La integración es la única fase que toca componentes compartidos. No se
introducen migraciones salvo que la auditoría de modelos pruebe que un campo
existente no permite representar datos ya solicitados.

## Validación

- Pruebas backend de agregado y extracción, incluidas entradas ambiguas.
- Lint, TypeScript y build frontend.
- Pruebas backend en `backend/.venv`.
- Verificación de móvil, teclado y contraste de KPI, acordeones, zonas y voz.
- Configuración Docker válida y reconstrucción de imágenes si cambian
  dependencias.
