# Auditoría de código y limpieza — Tools4Milk

Fecha: 2026-09-28. Base revisada: `c39fed7` y cambios locales de esta auditoría.
Este informe sustituye el diagnóstico del 22 de septiembre, que enumeraba como
pendientes varios defectos ya corregidos. El informe anterior permanece en Git.

## Alcance y método

Inventario de archivos versionados y referencias; análisis de uso del frontend
con Knip; ESLint, TypeScript y build Next.js; análisis Python Ruff (reglas F);
suite backend sobre PostgreSQL real; revisión dirigida de autenticación, arranque,
meteorología, migraciones, carga de archivos, configuración, Docker y nginx;
auditoría de dependencias npm y del entorno virtual Python con pip-audit.

No es una certificación de seguridad ni una revisión manual línea por línea de
cada módulo. No se ha hecho pentest, prueba de carga, auditoría del historial de
secretos, validación visual en navegador, ni verificado Azure, voz o AEMET reales.
No se ha desplegado ni reconstruido la pila Docker: se validó su configuración.

## Correcciones y limpieza aplicadas

| Área | Evidencia y cambio |
|---|---|
| Meteorología | `aemet_client.py` duplicaba escrituras en `DatosMetereologicos`, tabla sin migración ni lectores de API. Fallaban dos tests en una base recién migrada. Se elimina ese modelo y la escritura duplicada; los tests usan `LecturaMeteo`, como los endpoints, y comprueban actualización sin duplicados. |
| Usuarios | `seed_demo_user()` restauraba `activo=True`, correo y rol al reiniciar. Ahora solo crea las cuentas ausentes; un test verifica que respeta una cuenta desactivada y con rol reducido. |
| Configuración | `debug: bool | str` podía conservar `"False"` como cadena verdadera. Se tipa como booleano y se conserva compatibilidad con el valor heredado `release`; cuatro casos de regresión. |
| Token administrativo | Comparación del secreto con `secrets.compare_digest` en lugar de igualdad ordinaria. |
| Frontend | Eliminados `TaskCard.tsx`, `LoadingGrid`, `SectionEyebrow`, `Th`, `taskZoneName`, `ApiErrorPayload` y el alias duplicado `useAuthStore`, sin consumidores. Funciones y tipos usados dentro de su módulo pasan a privados; se retiran reexportaciones sobrantes. |
| Configuración frontend | Eliminado `tailwind.config.ts`, sin `@config` que lo cargase; Tailwind 4 usa `globals.css`. Retirada la dependencia directa `@eslint/eslintrc`, que no usa la configuración plana. |
| Artefactos | Retirados 48 snapshots Playwright, 18 capturas `t17-*`, el script puntual `.audit-ux.cjs`, sus excepciones ESLint, previsualizaciones UX y el JSON intermedio. Git ignora nuevas capturas temporales y cachés. |
| Scripts y assets | Retirado `scripts/populate_shifts.py`, sustituido por el seed semanal vigente y con dependencia `requests` no declarada. Eliminados `.gitkeep` en carpetas ya pobladas, el ejemplo backend duplicado y `logo-mark.png`, sin referencias; se conservan variantes de marca usadas dinámicamente. |
| Python | Retirados cuatro imports sin uso, una asignación sin lectura y la variable de pruebas `REDIS_ENABLED`, que la configuración ya no consume. |
| Dependencias | Next.js y eslint-config-next pasan a 16.3.6; actualizado el lockfile con parches compatibles. python-jose pasa a 3.5.0 y python-dotenv a 1.2.2. |
| Documentación | Nuevo índice y guía de desarrollo, pruebas PostgreSQL documentadas, seeds y migración 0017 documentados, ejemplos de entorno completados y nota de enums consolidada en `ENUMS_POSTGRESQL.md`. Diseños y evidencia UX conservados como históricos. |

Se conservan migraciones, esquema inicial, tests funcionales, documentos de
requisitos y assets referenciados. No se han borrado bases, backups, secretos,
modelos de voz descargados ni datos de usuario. La tabla meteorológica antigua,
si existe en una instalación, no se borra: ya no recibe escrituras del código.

## Hallazgos abiertos

### Alta: dependencias backend

Tras los dos parches Python, pip-audit aún devuelve **42 entradas de avisos en
7 paquetes instalados**. Hay identificadores repetidos: no son 42 fallos únicos.
El análisis es del entorno local Python 3.14, no una resolución limpia de la
imagen Python 3.12. Incluye `pip`, herramienta del entorno, no dependencia del
producto.

| Paquete instalado | Versión | Versiones de corrección indicadas por el escáner |
|---|---|---|
| starlette | 0.41.3 | Hasta 1.3.1, según aviso |
| anyio | 4.13.0 | 4.14.2 |
| cryptography | 48.0.0 | Hasta 50.0.0, según aviso |
| ecdsa | 0.19.2 | Sin corrección indicada |
| pyasn1 | 0.6.3 | 0.6.4 |
| pydantic-settings | 2.14.1 | 2.14.2 |
| pip | 25.3 | Hasta 26.2, según aviso |

`requirements.txt` fija FastAPI 0.115.6, que limita la versión de Starlette.
Resolver este conjunto exige actualizar coordinadamente el stack ASGI y revisar
la cadena JWT/criptografía, además de auditar una instalación limpia de Python
3.12. No se fuerza una versión de Starlette incompatible para silenciar avisos.
La presencia de un aviso no demuestra que el código exponga todas sus condiciones
de explotación. Los parches de Next y JOSE se contrastaron con las fuentes de
los mantenedores: [Next.js](https://github.com/vercel/next.js/security/advisories)
y [python-jose](https://github.com/mpdavis/python-jose/releases).

### Alta: autenticación y configuración de producción

- `app/routers/auth.py`: límite por `IP:username`, en memoria de cada proceso;
  las claves nunca se eliminan globalmente. Variar usuarios permite aumentar
  entradas y repartir intentos. Falta una política compartida por IP/cuenta
  para múltiples réplicas.
- `app/main.py`: el arranque sigue creando usuarios demo ausentes incluso en
  producción; ya no altera los existentes. Falta separar provisionamiento de
  cuentas y arranque normal. Las altas simultáneas también pueden competir.
- `app/config.py` y `docker-compose.yml`: los valores por defecto son de
  desarrollo; las validaciones estrictas solo actúan con
  `ENVIRONMENT=production`. No deben usarse sin configuración explícita fuera
  del entorno local.

### Media: archivos, autorización y recursos

- `app/routers/attachments.py` y `transcription.py`: `await file.read()` carga
  todo el fichero antes de comprobar su tamaño. nginx limita el cuerpo a 20 MB,
  pero Compose también expone directamente el backend. Conviene lectura acotada,
  límites coherentes (voz admite 25 MB en el servicio) y cuotas/concurrencia.
- `attachments.py` usa `OperationsManager` para subir adjuntos, mientras que
  crear incidencias permite veterinarios mediante `IncidentCreator`. Un
  veterinario puede crear una incidencia y recibir 403 al adjuntar una foto.
- `attachments_service.py`: el segundo decode/encode de Pillow queda fuera del
  bloque que convierte errores en validación; imágenes corruptas o enormes
  pueden producir errores sin normalizar. Faltan pruebas de estos límites.

### Media: observabilidad y contratos

- `app/main.py:/health` responde `database=ok` sin consultar la BD. Docker y
  nginx utilizan esa ruta; una caída posterior de PostgreSQL no se refleja en
  ese healthcheck. Existe `/api/v1/health/db`, pero no es la ruta configurada.
- `app/routers/weather.py`: `forecast` ordena ascendente y limita a siete
  registros, por lo que puede servir los más antiguos; las respuestas además
  etiquetan como AEMET datos que pueden haberse generado sin API key. Falta
  separar observaciones, previsiones y datos sintéticos con procedencia explícita.
- `frontend/src/proxy.ts`: la lista de rutas protegidas omite varias páginas
  operativas y solo comprueba presencia de cookie. Hay validación en la app y
  JWT en backend; el proxy no constituye una autorización válida por sí mismo.
- Persisten payloads `dict` y serializaciones manuales en routers/repositorios;
  ampliar los contratos Pydantic reduciría divergencias entre API y frontend.

### Mantenimiento

- Persisten `Base.metadata.create_all()` y cambios de esquema en startup junto
  a migraciones SQL. Centralizar evolución del esquema evitaría diferencias
  entre instalaciones; no se borran migraciones históricas para reducir archivos.
- No hay lockfile completo Python ni pipeline CI versionado. La suite depende
  de PostgreSQL; conviene automatizar instalación reproducible, migraciones,
  pruebas, build y escáneres en CI.
- El frontend almacena el JWT accesible a JavaScript. Una migración a sesiones
  con cookies HttpOnly exige diseñar CSRF y el flujo completo; no es limpieza
  mecánica y queda fuera de estos cambios.

## Validación

| Comprobación | Resultado |
|---|---|
| Baseline backend | 99 pasan, 2 fallan por tabla meteorológica heredada ausente |
| Backend tras cambios, PostgreSQL nuevo | 102 pasan; 554 avisos de deprecación de bibliotecas |
| Ruff, reglas F, app/scripts/tests | Sin hallazgos |
| Knip | Sin archivos, dependencias o exportaciones sin uso detectados |
| ESLint | Correcto |
| TypeScript | Correcto |
| Next.js build | Correcto, 27 páginas estáticas generadas |
| npm audit, incluyendo desarrollo | 0 avisos (antes: 9 paquetes, uno de severidad crítica) |
| npm audit --omit=dev | 0 avisos |
| Docker Compose config --quiet | Correcto |

La suite antigua contenía cinco pruebas de propiedades del modelo retirado.
Se sustituyen por comprobaciones sobre el modelo real y se añade un test de
upsert y cinco de arranque/configuración: 101 - 5 + 1 + 5 = 102.
Se utilizó la base separada `tools4milk_audit_20260928`; no se tocó la base de
negocio para estas verificaciones. Esa base de pruebas queda disponible localmente.
Los comandos reproducibles están en [DESARROLLO.md](DESARROLLO.md) y
[TESTING.md](../backend/TESTING.md).
