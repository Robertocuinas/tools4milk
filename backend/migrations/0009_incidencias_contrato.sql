-- Migración: contrato de incidencias (tarea T8 de
-- docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
--
-- 1) nivel_severidad gana el valor 'critica': el frontend ya filtraba por
--    prioridad=="critica" en el panel TV de incidencias criticas y en los
--    KPIs de dashboard/leanfarming, pero el backend nunca pudo emitirlo
--    (solo baja|media|alta), asi que ese panel estaba permanentemente vacio.
-- 2) incidencias.resolucion: campo de texto libre para registrar como se
--    resolvio la incidencia, hoy inexistente (el serializer lo devolvia
--    siempre null).
--
-- Nota: ALTER TYPE ... ADD VALUE no puede usarse en la misma transaccion en
-- la que ese valor nuevo se lee o se escribe. Esta migracion solo añade el
-- valor sin usarlo, asi que es segura dentro de la transaccion que
-- apply_migrations.py abre para aplicar todas las migraciones pendientes.
ALTER TYPE nivel_severidad ADD VALUE IF NOT EXISTS 'critica';

ALTER TABLE incidencias
    ADD COLUMN IF NOT EXISTS resolucion TEXT;
