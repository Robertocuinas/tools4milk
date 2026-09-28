# Pruebas backend

Ejecuta desde `backend/`, con dependencias de `requirements.txt` instaladas:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --disable-warnings
```

Las pruebas necesitan **PostgreSQL real**. `tests/conftest.py` usa
`TEST_DATABASE_URL` o, por defecto,
`postgresql+psycopg://postgres:postgres@localhost:5432/tools4milk_test`.
El usuario necesita poder crear esa base si aún no existe. No apuntes esta
variable a una base de producción: las fixtures aplican migraciones y el
arranque crea usuarios demo. Los cambios de cada test se revierten mediante
transacción y SAVEPOINT; el esquema y los usuarios creados en startup permanecen.

Para probar las migraciones desde cero usa un nombre de base de pruebas nuevo:

```powershell
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/tools4milk_audit_test"
.\.venv\Scripts\python.exe -m pytest -q --disable-warnings
```

No se necesita API key ni acceso a AEMET: las pruebas deshabilitan su clave.
Las pruebas de meteorología consultan `lecturas_meteorologia`, la misma tabla
que los endpoints, y verifican que repetir la sincronización actualiza sin duplicar.

La imagen Docker usa Python 3.12. La auditoría también ejecutó la suite en el
entorno local Python 3.14; las bibliotecas antiguas pueden emitir deprecaciones.
La caché de pytest está en `.pytest_cache_runtime/`, excluida de Git.
