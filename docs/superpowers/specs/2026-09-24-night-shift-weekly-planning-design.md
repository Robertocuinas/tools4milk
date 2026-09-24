# Turno nocturno y planificación semanal — diseño

## Objetivo

Permitir que una explotación active o desactive de forma persistente el turno
nocturno y dejar una semana operativa poblada con turnos, asignaciones y tareas
reales de desarrollo.

## Principios

- La configuración pertenece a la explotación y se guarda en backend; no es
  una preferencia por navegador.
- Desactivar la noche no borra datos históricos ni asignaciones existentes.
- La interfaz y el backend aplican la misma regla: no se muestra ni se crea un
  turno nocturno nuevo mientras la configuración esté desactivada.
- La planificación semanal usa empleados, zonas y catálogo existentes, con IDs
  estables para poder ejecutarse más de una vez sin duplicar registros.

## Configuración persistente

Se añadirá una configuración global `turno_noche_habilitado`, inicialmente
activa para conservar el comportamiento actual. Un usuario con permiso de
gestión de configuración puede leerla y modificarla desde Configuración.

El cliente consultará esta configuración en las pantallas que presentan
turnos: Turnos, Lean Farming y TV. Si es falsa, oculta el carril, selector,
leyenda y acciones de noche. Los turnos ya registrados se conservan y vuelven
a ser visibles al activar la configuración.

El endpoint de creación/edición valida el valor. Una solicitud para crear un
turno `noche` con la noche desactivada devuelve un error de dominio claro.
Las lecturas históricas no se eliminan ni se modifican.

## Planificación de la semana actual

Un seed o comando específico de desarrollo crea para los siete días de la
semana vigente:

- un turno de mañana y uno de tarde por día;
- un turno nocturno por día solo si la configuración está activa;
- asignaciones equilibradas entre trabajadores activos, respetando la
  información de rol/zona disponible;
- tareas de catálogo reales vinculadas a zona, trabajador y franja horaria,
  con estados que permitan probar la operativa.

La operación es idempotente: usa identificadores estables o detecta las
entidades de la semana antes de insertar. No modifica datos de producción ni
requiere referencias artificiales.

## Ownership

| Área | Archivos previsibles |
| --- | --- |
| Persistencia/API | migración, modelo/repositorio/servicio/router de configuración y router de turnos |
| Configuración UI | `frontend/src/app/(app)/settings/page.tsx`, cliente API y tipos necesarios |
| Visibilidad UI | Turnos, Lean Farming y TV, sin duplicar la regla de negocio |
| Datos semanales | script de seed/desarrollo y pruebas correspondientes |
| Integración | cliente de configuración común, traducciones y QA |

## Validación

- Pruebas backend de persistencia, permisos y rechazo de creación nocturna
  cuando está desactivada.
- Prueba idempotente del plan semanal: siete días, empleados/zonas válidos y
  tareas asociadas.
- `typecheck`, lint, build y pruebas backend.
- Recorrido UI: activar/desactivar desde Configuración, recargar, verificar
  Turnos/Lean/TV, reactivar y comprobar que no se perdió historial.
