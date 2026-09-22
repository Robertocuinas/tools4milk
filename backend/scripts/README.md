# Scripts de datos — Tools4Milk

## `seed_realistic_data.py` — demo mínima

Siembra un puñado de filas de demostración (idempotente: se salta cada
tabla que ya tenga datos). Pensado para dejar la aplicación visualizable
rápidamente, no para simular una explotación real.

```powershell
python scripts/seed_realistic_data.py            # siembra lo que falte
python scripts/seed_realistic_data.py --status   # solo recuentos
```

## `seed_explotacion.py` — dataset realista completo (T11)

Genera el volumen completo de una explotación de ~300 animales descrito en
`docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md` (sección 9): censo con
distribución por estado, 7 trabajadores, 90 días de turnos/tareas,
histórico de calidad, lecturas de robot de ordeño con curva de lactación
de Wood, 3 episodios anómalos trazables entre módulos (mastitis, avería de
robot, problema de alimentación), etc.

**Requiere `--purge` explícito** para regenerar desde cero: el volumen es
demasiado grande para razonar sobre un "añadir encima de lo que haya", así
que sin `--purge` el script se niega a sembrar si ya hay animales.

```powershell
# Generación completa con los valores por defecto del documento (300
# animales, 90 días, seed reproducible 42). Tarda unos segundos en local
# (~6s en un portátil de gama media; la tabla mas pesada, lecturas de
# robot de ordeño, usa insercion masiva por lotes).
python scripts/seed_explotacion.py --purge

# Personalizar volumen (util para pruebas rapidas: --animales 20 --dias 10
# tarda <1s y genera unas pocas centenas de filas en vez de decenas de miles).
python scripts/seed_explotacion.py --purge --animales 300 --dias 90 --incidencias 120 --pedidos 40 --seed 42

# Ver que va a hacer sin escribir nada:
python scripts/seed_explotacion.py --dry-run --animales 300 --dias 90

# Solo recuentos actuales:
python scripts/seed_explotacion.py --status
```

**`--purge` borra** (y regenera) las tablas de dominio de la explotación:
animales, empleados, turnos/asignaciones/relevos, tareas_ejecuciones,
tareas_recurrentes, incidencias, alertas, lactaciones, eventos
(sanitarios/reproductivos/recría), tratamientos, analiticas_tanque,
lecturas_robot_ordeno, movimientos_animal, boxes_recria, pedidos,
lecturas_meteorologia. **Nunca toca** `usuarios`, `audit_log`, `zonas`,
`maquinaria` ni `tareas_catalogo` (estas tres últimas se completan si
faltan, nunca se purgan, para no romper referencias de datos reales que
pudiera haber).

**NO ejecutar `--purge` contra producción** salvo que sea exactamente lo
que se quiere: es destructivo sobre las tablas listadas arriba. El script
respeta `DATABASE_URL` como cualquier otro script del proyecto.

### Fuera de alcance (deliberado)

- No se generan `genomica` ni `lecturas_carro_mezclador`: el encargo no
  las pide explícitamente y añadirlas sin volumen fiable solo ampliaría
  el alcance sin valor claro.
- No se crean zonas nuevas ni se reestructura la jerarquía de zonas más
  allá de enlazar `Boxes` bajo `Recría`: la explotación real solo tiene
  6 zonas coarse-grained, no las ~12 sub-zonas que proponía el documento
  antes de verificarlas contra el esquema real. Reestructurarlas
  implicaría reasignar animales/tareas/maquinaria ya existentes — una
  decisión de migración aparte, no de generación de datos.
- El volumen de `analiticas_tanque` es una estimación agregada
  (nº de vacas en producción × producción media × factor estacional), no
  la suma exacta de las lecturas individuales de `lecturas_robot_ordeno`
  de ese día. Ambas series son realistas y comparten las mismas fechas de
  anomalías, pero no están aritméticamente conciliadas entre sí.
