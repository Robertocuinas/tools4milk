-- Migración: analíticas de calidad de leche de tanque (tarea T10.1 de
-- docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
--
-- El módulo Calidad pide lactosa, recuento bacteriano, urea, temperatura,
-- volumen y lote, que hoy no existen en ningún sitio: `lactaciones` solo
-- guarda promedios POR LACTACION (grasa/proteína/RCS), y
-- `lecturas_robot_ordeno` guarda POR ORDEÑO individual. Esta tabla registra
-- el control de calidad de TANQUE/entrega a industria, complementario a
-- ambas (conviven, no se sustituyen).

CREATE TABLE IF NOT EXISTS analiticas_tanque (
    id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha                DATE         NOT NULL,
    lote                 VARCHAR(40),
    volumen_l            NUMERIC(10,2) NOT NULL,
    grasa_pct            NUMERIC(5,3),
    proteina_pct         NUMERIC(5,3),
    lactosa_pct          NUMERIC(5,3),
    rcs_x1000            INTEGER,
    bacteriologia_ufc_ml INTEGER,
    urea_mg_dl           NUMERIC(6,2),
    temperatura_c        NUMERIC(4,1),
    punto_criscopico     NUMERIC(6,4),
    inhibidores          BOOLEAN      NOT NULL DEFAULT FALSE,
    laboratorio          VARCHAR(150),
    observaciones        TEXT,
    CONSTRAINT uq_analiticas_tanque_fecha_lote UNIQUE (fecha, lote)
);

CREATE INDEX IF NOT EXISTS idx_analiticas_tanque_fecha ON analiticas_tanque(fecha DESC);
