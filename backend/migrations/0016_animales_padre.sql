-- Migración: genealogía paterna de animales (ficha de animal, sección
-- "Genealogía").
--
-- animales ya tenía madre_id (FK a animales) pero no había ningún campo de
-- padre: ni en animales ni en eventos_reproductivos (detalles JSONB vacío)
-- ni en genomica. Se añaden:
--   - padre_id: FK a animales, para toros/sementales registrados en la
--     explotación (poco habitual en vacuno de leche, pero posible).
--   - padre_crotal / padre_nombre: texto libre para el caso normal, un toro
--     externo (inseminación artificial con pajuela de centro de sementales),
--     que NUNCA estará dado de alta en animales.
--
-- Todas las columnas son anulables y sin valor por defecto: compatible con
-- los datos existentes (quedan en NULL = padre desconocido) y con PG15/PG18.
-- ADD COLUMN IF NOT EXISTS hace la migración idempotente (si la columna ya
-- existe se omite completa, incluida la FK, así que no se duplica).
-- ON DELETE SET NULL: borrar el registro del padre no debe arrastrar ni
-- bloquear a sus descendientes.

ALTER TABLE animales ADD COLUMN IF NOT EXISTS padre_id UUID REFERENCES animales(id) ON DELETE SET NULL;

ALTER TABLE animales ADD COLUMN IF NOT EXISTS padre_crotal VARCHAR(40);

ALTER TABLE animales ADD COLUMN IF NOT EXISTS padre_nombre VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_animales_padre ON animales(padre_id);
