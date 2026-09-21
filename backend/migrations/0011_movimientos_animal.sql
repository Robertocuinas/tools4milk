-- Migración: historial de movimientos de animales (tarea T10.4 de
-- docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
--
-- animales.zona_id solo guarda la ubicacion ACTUAL del animal. Esta tabla
-- registra el historial completo de cambios de zona, hoy inexistente.

CREATE TABLE IF NOT EXISTS movimientos_animal (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id      UUID        NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    zona_origen_id UUID        REFERENCES zonas(id),
    zona_destino_id UUID       NOT NULL REFERENCES zonas(id),
    fecha          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    motivo         VARCHAR(120),
    empleado_id    UUID        REFERENCES empleados(id),
    notas          TEXT
);

CREATE INDEX IF NOT EXISTS idx_movimientos_animal_animal ON movimientos_animal(animal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_animal_fecha  ON movimientos_animal(fecha DESC);
