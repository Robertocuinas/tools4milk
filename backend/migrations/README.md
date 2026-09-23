# Tools4Milk migrations

This folder contains ordered SQL migrations for stable deployments.

Run them from `backend` with:

```powershell
python scripts/apply_migrations.py
```

The app still creates missing tables on startup for local development, but
production should apply these migrations against Postgres before starting the
API container.

## Notes on recent migrations

- `0016_animales_padre.sql`: adds nullable `animales.padre_id` (FK to
  `animales`, `ON DELETE SET NULL`), `padre_crotal` and `padre_nombre`
  (external sires, e.g. AI bulls) plus `idx_animales_padre`. Idempotent
  (`ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`); existing rows
  keep `NULL` (unknown sire). Used by `GET /api/v1/animals/{id}/genealogy`.
