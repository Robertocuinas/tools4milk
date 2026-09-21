-- Migración: jerarquía de zonas + idioma/usuario del empleado (tarea T10 de
-- docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md, subtareas 10.2 y 10.3).
--
-- zonas gana una jerarquía (zona_padre_id/orden/activa) para poder agrupar
-- p.ej. "Boxes externos" y "Zona general de recría" bajo una zona raíz
-- "Recría", sustituyendo la agrupación hoy hardcodeada en el frontend
-- (TV_VISUAL_ZONES en tv/page.tsx, lib/visual-zones.ts).
--
-- empleados gana idioma_preferente (para I18n por trabajador, no por
-- dispositivo) y usuario_id (vínculo real con su cuenta de aplicación, hoy
-- inexistente: el "modo trabajador" del perfil es puramente local/visual).

ALTER TABLE zonas
    ADD COLUMN IF NOT EXISTS zona_padre_id UUID REFERENCES zonas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS orden SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_zonas_padre ON zonas(zona_padre_id);

ALTER TABLE empleados
    ADD COLUMN IF NOT EXISTS idioma_preferente VARCHAR(5) NOT NULL DEFAULT 'es',
    ADD COLUMN IF NOT EXISTS usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL;
