CREATE TABLE IF NOT EXISTS security_rate_limits (
    bucket VARCHAR(160) PRIMARY KEY,
    attempts INTEGER NOT NULL CHECK (attempts > 0),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_security_rate_limits_expiry ON security_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS browser_sessions (
    id VARCHAR(64) PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_browser_sessions_expiry ON browser_sessions (expires_at);
CREATE INDEX IF NOT EXISTS ix_browser_sessions_user ON browser_sessions (usuario_id);

ALTER TABLE lecturas_meteorologia ADD COLUMN IF NOT EXISTS fuente VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE lecturas_meteorologia ADD COLUMN IF NOT EXISTS tipo_dato VARCHAR(32) NOT NULL DEFAULT 'unknown';
