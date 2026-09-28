# Desarrollo y mantenimiento

## Arquitectura

- `frontend/`: Next.js 16, React 19, TypeScript, Tailwind CSS 4, TanStack Query,
  Zustand e i18next (español, gallego, inglés, francés y árabe).
- `backend/app/`: FastAPI; routers HTTP → servicios → repositorios SQLAlchemy.
  `schemas/` contiene contratos Pydantic y `models/` el mapeo de tablas.
- `backend/migrations/`: esquema PostgreSQL incremental, registrado en
  `schema_migrations`; el ejecutor serializa migraciones con advisory lock.
- `database/init.sql`: inicialización del volumen PostgreSQL de Compose.
- `nginx/`: proxy local para frontend, API, documentación y health.

PostgreSQL es la base soportada por las pruebas y migraciones de dominio. El
valor SQLite heredado de configuración no equivale a soporte completo: hay ENUM,
JSONB y columnas generadas propias de PostgreSQL. Configura siempre DATABASE_URL.
Los tokens de diseño están en `frontend/src/app/globals.css`, mediante `@theme`.

## Inicio con Docker (desarrollo)

Desde la raíz, crea `backend/.env` copiando `backend/.env.example` si no existe.
No sobrescribas un archivo de configuración que ya tenga tus valores.

```powershell
docker compose up --build -d
```

Abre `http://localhost`; Swagger está en `http://localhost/docs`. Compose aplica
migraciones antes de iniciar la API. Los datos se guardan en volúmenes PostgreSQL
y de adjuntos. `docker compose down` conserva esos volúmenes; no uses `down -v`
si quieres conservar los datos.

El arranque crea los usuarios demo que faltan. En desarrollo, `admin` usa
`INITIAL_DEMO_PASSWORD` (valor de ejemplo: `testpass123`). Las cuentas existentes
conservan correo, rol, estado y contraseña. El arranque no siembra todo el dominio.
Consulta los [scripts de datos](../backend/scripts/README.md) para una demo completa.

Las variables interpoladas por Compose salen del entorno del shell o del `.env`
de la raíz. Sus entradas `environment` prevalecen sobre `backend/.env`. No copies
secretos reales a los archivos `.example`.

## Desarrollo sin contenedores de aplicación

Requiere PostgreSQL accesible, Python 3.12 (versión de la imagen) y Node.js 24
(versión de la imagen frontend). Puedes levantar solo la BD con `docker compose up -d db`.

Desde `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/apply_migrations.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Crea antes `backend/.env` a partir del ejemplo y ajusta DATABASE_URL. Para adjuntos
locales fuera de Docker, usa `STORAGE_LOCAL_PATH=./media/adjuntos`.

Desde `frontend/`, copia `.env.local.example` a `.env.local` si no existe:

```powershell
npm ci
npm run dev
```

Abre `http://localhost:3000`. `NEXT_PUBLIC_API_URL=http://localhost:8000` conecta
con la API local; un valor vacío usa el mismo origen, como detrás de nginx.
Las variables `NEXT_PUBLIC_*` se fijan al compilar; cambiarlas exige recompilar.

## Verificación

Desde `frontend/`:

```powershell
npm run lint
npm run typecheck
npm run build
npm audit
npx --yes knip --no-progress
```

Desde `backend/`, sigue [TESTING.md](../backend/TESTING.md). El análisis Python
usado en la auditoría es `python -m ruff check app scripts tests --select F`;
requiere instalar `ruff` como herramienta local. Para dependencias, instala
`pip-audit` y ejecuta `python -m pip_audit --progress-spinner off` en el entorno
que deseas auditar. Los resultados dependen de las versiones instaladas.

## Despliegue

Compose proporciona configuración de desarrollo, con puertos y credenciales
locales. Antes de un despliegue real configura `ENVIRONMENT=production`,
`DEBUG=False`, una `SECRET_KEY` aleatoria de al menos 32 caracteres, otra
`INITIAL_DEMO_PASSWORD`, PostgreSQL y orígenes CORS explícitos. La validación actual
exige `STORAGE_BACKEND=azure_blob` y `AZURE_STORAGE_CONNECTION_STRING` en producción.
`NEXT_PUBLIC_ENVIRONMENT=production` debe estar fijado durante el build frontend.

El Dockerfile backend por sí solo no aplica migraciones; Compose sí. En otro
orquestador ejecuta `python scripts/apply_migrations.py` antes de iniciar la API.
Configura TLS y exposición de puertos en la infraestructura de destino. Revisa
los riesgos todavía abiertos en la [auditoría](AUDITORIA_POST_IMPLEMENTACION.md).

AEMET, Azure y transcripción externa requieren configuración propia. Sin clave
AEMET se generan datos sintéticos; la transcripción intenta Vosk y después el
proveedor externo configurado. Los modelos Vosk y ffmpeg son necesarios para voz
local; la imagen backend incluye ffmpeg.
