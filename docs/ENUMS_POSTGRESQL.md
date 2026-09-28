# Enums de PostgreSQL y SQLAlchemy

`backend/app/enums.py` define los valores de Python; `database/init.sql` y las
migraciones definen los tipos PostgreSQL. Mantén ambas fuentes alineadas.

Para una columna ENUM nativa utiliza `sqlalchemy.Enum` con el nombre del tipo
PostgreSQL y `values_callable=lambda values: [item.value for item in values]`.
Así se persisten los valores de dominio, no los nombres de los miembros Python.
Los modelos existentes incluyen variantes String para SQLite, pero las pruebas
de integración deben usar PostgreSQL para detectar incompatibilidades de tipos.

Usa miembros del enum en comparaciones y valida los valores externos en schemas
o helpers de repositorio antes de guardarlos. Consulta los valores vigentes en
el código; por ejemplo, `NivelAlerta` incluye `critica` desde la migración 0015.
No mantengas otra lista de valores manual en la documentación.
