# Pruebas backend

Ejecuta las pruebas con el entorno virtual del repositorio, no con el Python
global del sistema: puede contener versiones incompatibles de FastAPI y
Starlette.

```powershell
./.venv/Scripts/python.exe -m pytest
```

La imagen Docker usa Python 3.12 y también instala las dependencias desde
`requirements.txt`.
