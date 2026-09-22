-- T7: adjuntos de imagen en incidencias (docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
-- Modelada de forma generica (entidad_tipo + entidad_id) en vez de FK directa
-- a incidencias, para poder extenderla a animales/tareas sin otra migracion.
CREATE TABLE IF NOT EXISTS adjuntos (
    id                UUID PRIMARY KEY,
    entidad_tipo      VARCHAR(40)  NOT NULL,
    entidad_id        UUID         NOT NULL,
    tipo_media        VARCHAR(20)  NOT NULL,
    nombre_original   VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) NOT NULL,
    tamano_bytes      BIGINT       NOT NULL,
    storage_key       TEXT         NOT NULL,
    ancho_px          INTEGER,
    alto_px           INTEGER,
    duracion_seg      NUMERIC(6,2),
    hash_sha256       TEXT         NOT NULL,
    subido_por        UUID         REFERENCES empleados(id),
    ts_subida         TIMESTAMPTZ  NOT NULL,
    eliminado         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT adjuntos_tamano_positivo CHECK (tamano_bytes > 0)
);
CREATE INDEX IF NOT EXISTS idx_adjuntos_entidad ON adjuntos (entidad_tipo, entidad_id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_adjuntos_hash    ON adjuntos (hash_sha256);

-- incidencias.foto_url queda obsoleta (nadie la rellena ni la sirve hoy) pero
-- no se elimina todavia por si algun cliente antiguo la referencia.
COMMENT ON COLUMN incidencias.foto_url IS 'Obsoleta desde T7 (adjuntos). Usar la tabla adjuntos con entidad_tipo=''incidencia''.';
