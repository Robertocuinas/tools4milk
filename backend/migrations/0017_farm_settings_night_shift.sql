-- Persistent global settings for the farm. Singleton row keeps the API contract
-- simple while allowing additional settings to be added to this record later.
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    turno_noche_habilitado BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO configuracion_sistema (id, turno_noche_habilitado)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;
