-- Migración: prioridad de tareas independiente del estado (tarea T9 de
-- docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
--
-- Antes, "es_urgente" se derivaba en el backend de estado==VENCIDA, lo que
-- hacia imposible marcar una tarea como urgente sin que ya estuviera
-- retrasada. Esta migración añade una prioridad real y explícita.

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_tarea') THEN CREATE TYPE prioridad_tarea AS ENUM ('baja', 'normal', 'alta', 'urgente'); END IF; END $$;

ALTER TABLE tareas_ejecuciones
    ADD COLUMN IF NOT EXISTS prioridad prioridad_tarea NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_tareas_prioridad ON tareas_ejecuciones(prioridad)
    WHERE estado IN ('pendiente', 'en_curso');
