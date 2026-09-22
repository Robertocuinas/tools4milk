"""Generador de dataset realista de explotación completa (tarea T11 de
docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).

Distinto de `seed_realistic_data.py` (que siembra un puñado de filas de
demostración y se salta cada tabla que ya tenga datos): este script genera
el volumen completo que pide el encargo (~300 animales, 7 trabajadores,
varias semanas de turnos/tareas, histórico de calidad, incidencias
realistas, lecturas de robot de ordeño...) y requiere `--purge` explícito
para regenerar desde cero, precisamente porque su volumen es demasiado
grande para razonar sobre un "añadir encima de lo que haya".

Reglas de coherencia aplicadas (ver doc, sección 9.3): curva de lactación
de Wood (no producción plana), variación estacional de calidad inversa al
volumen, 3 episodios anómalos trazables entre módulos (mastitis, avería de
robot, problema de alimentación), estados de tarea coherentes con el
tiempo (ninguna tarea futura completada), tratamientos con periodo de
retirada, turnos/asignaciones/relevos consistentes entre sí.

No se generan `genomica` ni `lecturas_carro_mezclador`: no los pide
explícitamente el encargo (secciones 7-13) y añadirlos sin volumen fiable
solo aumentaría el alcance sin valor claro. `zonas` NO se amplía ni
reestructura: la explotación real solo tiene 6 zonas coarse-grained (no
las ~12 sub-zonas que proponía el documento antes de verificarlas), así
que reestructurarlas implicaría reasignar animales/tareas/maquinaria ya
existentes — una decisión de migración aparte, no de generación de datos.
Solo se enlaza Boxes bajo Recría (misma jerarquía física, cero
duplicación).

Uso:
    python scripts/seed_explotacion.py --purge                 # todo por defecto
    python scripts/seed_explotacion.py --purge --animales 300 --dias 90 --seed 42
    python scripts/seed_explotacion.py --status                # solo recuentos
    python scripts/seed_explotacion.py --dry-run                # no escribe nada

NO ejecutar --purge contra producción: borra y regenera las tablas de
dominio de la explotación (no toca `usuarios`). Respeta DATABASE_URL.
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from math import exp, sin, pi
from pathlib import Path
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.enums import EstadoTarea, NivelAlerta, NivelSeveridad, PrioridadTarea, TipoIncidencia, TipoTurno  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402
from app.models.tools4milk import (  # noqa: E402
    Alerta,
    AnaliticaTanque,
    Animal,
    AsignacionTurno,
    BoxRecria,
    Empleado,
    EventoReproductivo,
    EventoSanitario,
    EventoSanitarioRecria,
    Incidencia,
    Lactacion,
    LecturaMeteo,
    LecturaRobotOrdeno,
    Maquinaria,
    MovimientoAnimal,
    Pedido,
    ResumenRelevo,
    TareaCatalogo,
    TareaEjecucion,
    TareaRecurrente,
    TratamientoActivo,
    Turno,
    Zona,
)
from app.time_utils import utc_now  # noqa: E402

ESTACION_ID = "villalba_lugo"

NOMBRES_VACAS = [
    "Lúa", "Estrela", "Marela", "Pinta", "Galana", "Loira", "Cabana", "Rosa",
    "Vaqueira", "Moura", "Xoana", "Brava", "Donosa", "Faísca", "Lousa", "Meiga",
    "Nai", "Perla", "Quenlla", "Ruda", "Sela", "Tella", "Uxía", "Veiga",
    "Airexa", "Bican", "Centola", "Dorna", "Eira", "Fonte", "Grela", "Hedra",
    "Iria", "Lama", "Mencía", "Noa", "Ourela", "Pomba", "Rula", "Sabela",
    "Teixa", "Uz", "Vidueira", "Xesta", "Zorra", "Amencer", "Brisa", "Carqueixa",
    "Doncela", "Enxebre",
]
RAZAS = ["Frisona", "Frisona", "Frisona", "Frisona", "Pardo Alpina", "Cruce"]

# Trabajadores ficticios (T9 del documento, sección 9.5). Datos de prueba,
# NO personas reales.
EMPLEADOS_BASE = [
    # (nombre, apellidos, rol_empleado, rol_app, zona_codigo, idioma, cualificaciones, username_app)
    # username_app enlaza con las cuentas fijas de seed_demo_user() (main.py)
    # via empleados.usuario_id (T10.2), para que el idioma_preferente pueda
    # aplicarse de verdad al iniciar sesion (T5.6). None = sin cuenta de
    # login asociada en el dataset de demo.
    ("Roberto", "Castro Insua", "encargado", "admin", "sala_ordeno", "es", ["VMS", "TMR", "gestion"], "roberto.castro"),
    ("Laura", "Fernández Bao", "auxiliar", "operario", "sala_ordeno", "gl", ["VMS"], "laura.fernandez"),
    ("Marcos", "Vázquez Rial", "auxiliar", "operario", "zona_recria", "fr", ["recria"], None),
    ("Sofía", "Rodríguez Painceira", "auxiliar", "alimentacion", "general", "es", ["TMR"], None),
    ("Ibrahim", "Diallo", "auxiliar", "operario", "sala_ordeno", "fr", ["VMS", "mantenimiento"], None),
    ("Elena", "Méndez Souto", "veterinario", "veterinario", "enfermeria", "es", ["veterinaria"], "dr.mendez"),
    ("Diego", "López Cascudo", "mecanico", "operario", "sala_ordeno", "es", ["mecanica"], None),
]

# Catálogo de tareas ampliado (doc sección 11: cubre alimentación, limpieza,
# control de animales, enfermería, mantenimiento, ordeño, bebederos, boxes,
# tratamientos, calidad, equipos). Se añade a las 7 ya existentes en el
# esquema base sin duplicar códigos.
TAREAS_CATALOGO_EXTRA = [
    ("control_animales", "Control visual de animales", "Revisión de estado general, cojeras y celo", 25),
    ("revision_enfermeria", "Revisión de enfermería", "Chequeo de animales en tratamiento", 20),
    ("mantenimiento_maquinaria", "Mantenimiento preventivo de maquinaria", "Revisión de robots y carro mezclador", 50),
    ("control_ordeno", "Control de parámetros de ordeño", "Verificación de caudal y conductividad", 20),
    ("control_boxes", "Control de boxes de recría", "Revisión de terneros en boxes", 20),
    ("revision_equipos", "Revisión de equipos y sensores", "Calibración y verificación de sensores", 35),
]

TAREAS_RECURRENTES_DEF = [
    ("lavado_robot", "0 */8 * * *", "Cada 8 horas"),
    ("limpieza_bebederos", "0 7 * * *", "Diario a las 7:00"),
    ("preparacion_racion", "0 6,14 * * *", "Dos veces al día"),
    ("control_animales", "0 8 * * *", "Diario a las 8:00"),
    ("revision_enfermeria", "0 9 * * *", "Diario a las 9:00"),
    ("recogida_muestras", "0 7 * * 1", "Semanal (lunes)"),
    ("desinfeccion_camas", "0 10 * * 1,4", "Lunes y jueves"),
    ("control_boxes", "0 8,18 * * *", "Dos veces al día"),
    ("mantenimiento_maquinaria", "0 9 * * 3", "Semanal (miércoles)"),
    ("revision_equipos", "0 9 1 * *", "Mensual"),
]

FARMACOS = [
    ("Mastijet", "1 cánula/12h", "intramamaria", 4, 3),
    ("Penethaject", "20 ml/día", "intramuscular", 3, 4),
    ("Metacam", "15 ml/día", "subcutánea", 2, 1),
    ("Rumenol", "10 ml/día", "oral", 5, 0),
    ("Excenel", "5 ml/día", "subcutánea", 3, 5),
]


def make_rng(seed: int) -> random.Random:
    return random.Random(seed)


# ---------------------------------------------------------------------------
# Utilidades de dominio
# ---------------------------------------------------------------------------

def wood_curve(dim: int, multipara: bool) -> float:
    """Curva de lactación de Wood: y(t) = a * t^b * e^(-c*t).

    Pico hacia el día 55-65 en leche, descenso progresivo posterior. Las
    primíparas producen ~20% menos que las multíparas (doc, sección 9.3.3).
    """
    dim = max(1, dim)
    a, b, c = (23.5, 0.20, 0.0033) if multipara else (18.5, 0.19, 0.0032)
    valor = a * (dim ** b) * exp(-c * dim)
    return max(4.0, valor)


def variacion_estacional(fecha: date) -> tuple[float, float]:
    """Factor (grasa/proteína sube en invierno) y (volumen baja en invierno).

    Devuelve (factor_composicion, factor_volumen), ambos alrededor de 1.0,
    correlacionados inversamente entre sí como pide el doc (sección 9.3.4).
    """
    dia_anio = fecha.timetuple().tm_yday
    # Fase para que el pico de "invierno" caiga sobre enero (dia ~15)
    fase = 2 * pi * (dia_anio - 15) / 365.0
    factor_composicion = 1.0 + 0.09 * (0.5 + 0.5 * (1 - sin(fase)) - 0.5)
    factor_composicion = 1.0 + 0.07 * (1 if sin(fase) < 0 else -1) * abs(sin(fase))
    factor_volumen = 1.0 - 0.05 * (1 if sin(fase) < 0 else -1) * abs(sin(fase))
    return factor_composicion, factor_volumen


def daterange(start: date, days: int):
    for i in range(days):
        yield start + timedelta(days=i)


def rango_seguro(rng: random.Random, lo: int, hi: int) -> int:
    """randint que nunca revienta si el rango pedido (p.ej. dependiente de
    --dias) resulta mas estrecho que [lo, hi] en ejecuciones pequeñas."""
    if hi < lo:
        return lo
    return rng.randint(lo, hi)


# ---------------------------------------------------------------------------
# Purga (solo tablas de dominio de la explotación; NUNCA usuarios/audit_log)
# ---------------------------------------------------------------------------

PURGE_ORDER = [
    ResumenRelevo, AsignacionTurno, Turno,
    MovimientoAnimal, TareaEjecucion, TareaRecurrente,
    LecturaRobotOrdeno,
    AnaliticaTanque,
    Alerta, Incidencia,
    EventoSanitarioRecria, EventoReproductivo,
    TratamientoActivo, EventoSanitario,
    Lactacion,
    BoxRecria,
    Pedido,
    Animal,
    Empleado,
    LecturaMeteo,
]


def purge(db: Session) -> None:
    for model in PURGE_ORDER:
        db.execute(delete(model))
    db.commit()
    print("PURGE completado (zonas, maquinaria y tareas_catalogo se conservan).")


# ---------------------------------------------------------------------------
# Zonas y maquinaria (NO se crean zonas nuevas; solo se enlaza jerarquía
# sobre las 6 zonas reales existentes, y se completa maquinaria si falta)
# ---------------------------------------------------------------------------

def ensure_zonas_jerarquia(db: Session) -> dict[str, Zona]:
    zonas = {z.codigo: z for z in db.scalars(select(Zona)).all()}
    if not zonas:
        raise RuntimeError("No hay zonas en la base de datos. Aplica las migraciones/init.sql antes de sembrar.")
    boxes = zonas.get("boxes_terneros")
    recria = zonas.get("zona_recria")
    if boxes is not None and recria is not None and boxes.zona_padre_id != recria.id:
        boxes.zona_padre_id = recria.id
        boxes.orden = 1
        recria.orden = 0
    db.commit()
    return zonas


def ensure_maquinaria(db: Session, zonas: dict[str, Zona]) -> list[Maquinaria]:
    existentes = list(db.scalars(select(Maquinaria)).all())
    nombres = {m.nombre for m in existentes}
    nave = zonas.get("sala_ordeno")
    extra = [
        ("Bomba de vacío 1", "bomba"),
        ("Bomba de purín", "bomba"),
    ]
    for nombre, tipo in extra:
        if nombre in nombres:
            continue
        m = Maquinaria(
            id=uuid4(), nombre=nombre, tipo=tipo,
            zona_id=nave.id if nave else None, activa=True, estado="operativa",
        )
        db.add(m)
        existentes.append(m)
    db.commit()
    return existentes


# ---------------------------------------------------------------------------
# Catálogo de tareas y tareas recurrentes
# ---------------------------------------------------------------------------

def ensure_tareas_catalogo(db: Session) -> dict[str, TareaCatalogo]:
    catalogo = {c.codigo: c for c in db.scalars(select(TareaCatalogo)).all()}
    for codigo, nombre, descripcion, minutos in TAREAS_CATALOGO_EXTRA:
        if codigo in catalogo:
            continue
        item = TareaCatalogo(
            id=uuid4(), codigo=codigo, nombre=nombre, descripcion=descripcion,
            duracion_estimada_min=minutos, activa=True,
        )
        db.add(item)
        catalogo[codigo] = item
    db.commit()
    return catalogo


def seed_tareas_recurrentes(db: Session, catalogo: dict[str, TareaCatalogo], zonas: dict[str, Zona], hoy: date) -> None:
    nave = zonas.get("sala_ordeno")
    for codigo, expr, descripcion in TAREAS_RECURRENTES_DEF:
        cat = catalogo.get(codigo)
        if cat is None:
            continue
        db.add(TareaRecurrente(
            id=uuid4(), catalogo_id=cat.id, zona_id=nave.id if nave else None,
            frecuencia_expr=expr, descripcion_frecuencia=descripcion,
            activa=True, fecha_inicio=hoy - timedelta(days=365),
        ))
    db.commit()
    print(f"OK tareas_recurrentes: {len(TAREAS_RECURRENTES_DEF)}")


# ---------------------------------------------------------------------------
# Empleados
# ---------------------------------------------------------------------------

def seed_empleados(db: Session, zonas: dict[str, Zona], hoy: date) -> list[Empleado]:
    usuarios_por_username = {u.username: u for u in db.scalars(select(Usuario)).all()}
    empleados: list[Empleado] = []
    for i, (nombre, apellidos, rol, _rol_app, zona_codigo, idioma, cual, username_app) in enumerate(EMPLEADOS_BASE):
        zona = zonas.get(zona_codigo)
        usuario = usuarios_por_username.get(username_app) if username_app else None
        emp = Empleado(
            id=uuid4(), nombre=nombre, apellidos=apellidos, rol=rol,
            zona_principal_id=zona.id if zona else None,
            cualificaciones=cual, telefono=f"6{600000000 + i * 1111:08d}"[:9],
            email=f"{nombre.lower()}.{apellidos.split()[0].lower()}@tools4milk.local",
            activo=(i != len(EMPLEADOS_BASE) - 1),  # el último, inactivo (para probar el filtro)
            fecha_alta=hoy - timedelta(days=365 * 2 + i * 30),
            idioma_preferente=idioma,
            usuario_id=usuario.id if usuario else None,
        )
        db.add(emp)
        empleados.append(emp)
    db.commit()
    print(f"OK empleados: {len(empleados)}")
    return empleados


# ---------------------------------------------------------------------------
# Animales (censo + movimientos)
# ---------------------------------------------------------------------------

@dataclass
class Censo:
    produccion: list[Animal] = field(default_factory=list)
    seca: list[Animal] = field(default_factory=list)
    gestante: list[Animal] = field(default_factory=list)
    recria: list[Animal] = field(default_factory=list)
    baja: list[Animal] = field(default_factory=list)

    @property
    def activos(self) -> list[Animal]:
        return self.produccion + self.seca + self.gestante + self.recria


def seed_animales(db: Session, rng: random.Random, zonas: dict[str, Zona], hoy: date, n_total: int) -> Censo:
    # Distribucion doc 9.4, escalada proporcionalmente si n_total != 300
    escala = n_total / 300.0
    n_produccion = round(180 * escala)
    n_seca = round(35 * escala)
    n_gestante = round(45 * escala)
    n_recria = round(40 * escala)
    n_baja = round(25 * escala)

    nave = zonas.get("sala_ordeno")
    enf = zonas.get("enfermeria")
    recria_zona = zonas.get("zona_recria")
    boxes = zonas.get("boxes_terneros")

    seq = [1]

    def crotal() -> str:
        c = f"ES{1500000000 + seq[0]:010d}"
        seq[0] += 1
        return c

    nombres_ciclo = list(NOMBRES_VACAS)
    rng.shuffle(nombres_ciclo)

    def nombre_para(i: int) -> str | None:
        if i >= len(nombres_ciclo) * 3:
            return None
        return nombres_ciclo[i % len(nombres_ciclo)]

    censo = Censo()
    idx = 0

    # Vacas en produccion: edad >= 22 meses, al menos 1 parto
    n_enfermeria = min(6, max(0, round(n_produccion * 0.03)))
    for i in range(n_produccion):
        edad_meses = rng.randint(24, 90)
        en_enfermeria = i < n_enfermeria
        a = Animal(
            id=uuid4(), crotal_oficial=crotal(), nombre=nombre_para(idx),
            sexo="hembra", fecha_nacimiento=hoy - timedelta(days=30 * edad_meses),
            raza=rng.choice(RAZAS), estado="produccion",
            estado_reproductivo=rng.choice(["vacia", "en_celo", "inseminada", "confirmada_gestante", "parto_reciente"]),
            zona_id=(enf.id if en_enfermeria and enf else (nave.id if nave else None)),
            fecha_entrada=hoy - timedelta(days=30 * edad_meses),
        )
        db.add(a)
        censo.produccion.append(a)
        idx += 1

    for i in range(n_seca):
        edad_meses = rng.randint(30, 96)
        a = Animal(
            id=uuid4(), crotal_oficial=crotal(), nombre=nombre_para(idx),
            sexo="hembra", fecha_nacimiento=hoy - timedelta(days=30 * edad_meses),
            raza=rng.choice(RAZAS), estado="seca", estado_reproductivo="confirmada_gestante",
            zona_id=nave.id if nave else None,
            fecha_entrada=hoy - timedelta(days=30 * edad_meses),
        )
        db.add(a)
        censo.seca.append(a)
        idx += 1

    for i in range(n_gestante):
        edad_meses = rng.randint(15, 30)
        a = Animal(
            id=uuid4(), crotal_oficial=crotal(), nombre=nombre_para(idx),
            sexo="hembra", fecha_nacimiento=hoy - timedelta(days=30 * edad_meses),
            raza=rng.choice(RAZAS), estado="gestante", estado_reproductivo="confirmada_gestante",
            zona_id=recria_zona.id if recria_zona else None,
            fecha_entrada=hoy - timedelta(days=30 * edad_meses),
        )
        db.add(a)
        censo.gestante.append(a)
        idx += 1

    n_boxes_terneros = min(round(n_recria * 0.5), 20)
    for i in range(n_recria):
        en_boxes = i < n_boxes_terneros
        edad_meses = rng.randint(0, 20) if en_boxes else rng.randint(0, 23)
        edad_dias = rng.randint(3, 60) if en_boxes else 30 * edad_meses
        a = Animal(
            id=uuid4(), crotal_oficial=crotal(), nombre=(nombre_para(idx) if not en_boxes else None),
            sexo=rng.choice(["hembra", "hembra", "hembra", "macho"]),
            fecha_nacimiento=hoy - timedelta(days=edad_dias),
            raza=rng.choice(RAZAS), estado="recria",
            zona_id=(boxes.id if en_boxes and boxes else (recria_zona.id if recria_zona else None)),
            fecha_entrada=hoy - timedelta(days=edad_dias),
        )
        db.add(a)
        censo.recria.append(a)
        idx += 1

    motivos_baja = ["venta", "sacrificio sanitario", "muerte natural", "fin de vida productiva"]
    for i in range(n_baja):
        edad_meses = rng.randint(40, 130)
        fecha_baja = hoy - timedelta(days=rng.randint(30, 700))
        a = Animal(
            id=uuid4(), crotal_oficial=crotal(), nombre=nombre_para(idx),
            sexo="hembra", fecha_nacimiento=hoy - timedelta(days=30 * edad_meses),
            raza=rng.choice(RAZAS), estado="baja",
            zona_id=None, fecha_entrada=hoy - timedelta(days=30 * edad_meses),
            fecha_baja=fecha_baja, motivo_baja=rng.choice(motivos_baja),
        )
        db.add(a)
        censo.baja.append(a)
        idx += 1

    db.commit()
    total = len(censo.produccion) + len(censo.seca) + len(censo.gestante) + len(censo.recria)
    print(f"OK animales: {total} activos + {len(censo.baja)} bajas "
          f"(produccion={len(censo.produccion)}, seca={len(censo.seca)}, "
          f"gestante={len(censo.gestante)}, recria={len(censo.recria)})")
    return censo


def seed_movimientos(db: Session, rng: random.Random, censo: Censo, zonas: dict[str, Zona],
                      empleados: list[Empleado], hoy: date, dias: int) -> None:
    zonas_list = list(zonas.values())
    n_movs = 0
    for a in rng.sample(censo.activos, k=min(len(censo.activos), max(1, len(censo.activos) // 2))):
        if a.zona_id is None:
            continue
        n = rng.randint(1, 3)
        origen = a.zona_id
        for _ in range(n):
            destino = rng.choice(zonas_list)
            if destino.id == origen:
                continue
            fecha = datetime.combine(
                hoy - timedelta(days=rng.randint(1, dias)), time(rng.randint(6, 20), 0), tzinfo=timezone.utc,
            )
            db.add(MovimientoAnimal(
                id=uuid4(), animal_id=a.id, zona_origen_id=origen, zona_destino_id=destino.id,
                fecha=fecha, motivo=rng.choice(["reagrupacion", "revision veterinaria", "cambio de lote", "limpieza de zona"]),
                empleado_id=rng.choice(empleados).id if empleados else None,
            ))
            origen = destino.id
            n_movs += 1
    db.commit()
    print(f"OK movimientos_animal: {n_movs}")


# ---------------------------------------------------------------------------
# Lactaciones (con curva de Wood coherente con las lecturas de robot)
# ---------------------------------------------------------------------------

def seed_lactaciones(db: Session, rng: random.Random, censo: Censo, hoy: date) -> dict[UUID, Lactacion]:
    activa_por_animal: dict[UUID, Lactacion] = {}
    n = 0
    for a in censo.produccion + censo.seca:
        edad_meses = max(1, (hoy - a.fecha_nacimiento).days // 30)
        # Coherencia edad<->partos: un ciclo completo (gestacion + lactacion)
        # dura ~13 meses; el primer parto no puede ser antes de los ~22 meses.
        n_partos_max = max(1, min(5, (edad_meses - 22) // 13 + 1))
        n_partos = rng.randint(1, n_partos_max)

        # Se calcula PRIMERO la lactacion mas reciente (numero=n_partos) y
        # despues se camina hacia atras en el tiempo para las historicas,
        # para no depender de una variable que todavia no existe.
        dim_actual = rng.randint(20, 305) if a.estado == "produccion" else 310
        fechas_parto: dict[int, date] = {n_partos: hoy - timedelta(days=dim_actual)}
        for numero in range(n_partos - 1, 0, -1):
            fechas_parto[numero] = fechas_parto[numero + 1] - timedelta(days=rng.randint(370, 410))

        for numero in range(1, n_partos + 1):
            fecha_parto_actual = fechas_parto[numero]
            if numero == n_partos:
                fecha_secado = None if a.estado == "produccion" else fecha_parto_actual + timedelta(days=305)
            else:
                fecha_secado = fecha_parto_actual + timedelta(days=rng.randint(295, 315))
            multipara = numero > 1
            dias_lactacion = (fecha_secado - fecha_parto_actual).days if fecha_secado else (hoy - fecha_parto_actual).days
            produccion_total = sum(wood_curve(d, multipara) for d in range(1, max(2, dias_lactacion))) if dias_lactacion > 0 else 0
            lac = Lactacion(
                id=uuid4(), animal_id=a.id, numero=numero,
                fecha_parto=fecha_parto_actual, fecha_secado=fecha_secado,
                produccion_total_kg=Decimal(str(round(produccion_total, 1))) if produccion_total else None,
                grasa_promedio=Decimal(str(round(rng.uniform(3.6, 4.2), 3))),
                proteina_promedio=Decimal(str(round(rng.uniform(3.2, 3.6), 3))),
                rcs_promedio=rng.randint(90, 260) * 1000,
            )
            db.add(lac)
            n += 1
            if fecha_secado is None:
                activa_por_animal[a.id] = lac
    db.commit()
    print(f"OK lactaciones: {n}")
    return activa_por_animal


# ---------------------------------------------------------------------------
# Eventos reproductivos
# ---------------------------------------------------------------------------

def seed_eventos_reproductivos(db: Session, rng: random.Random, censo: Censo, empleados: list[Empleado], hoy: date, dias: int) -> None:
    n = 0
    veterinarios = [e for e in empleados if e.rol == "veterinario"] or empleados
    for a in censo.activos:
        n_eventos = rng.randint(1, 3)
        for _ in range(n_eventos):
            tipo = rng.choice(["celo", "inseminacion", "diagnostico_gestacion", "parto", "secado"])
            fecha = hoy - timedelta(days=rng.randint(1, dias * 3))
            db.add(EventoReproductivo(
                id=uuid4(), animal_id=a.id, tipo=tipo, fecha=fecha,
                hora=time(rng.randint(6, 18), rng.choice([0, 15, 30, 45])),
                empleado_id=rng.choice(veterinarios).id if veterinarios else None,
                detalles={}, creado_en=utc_now(),
            ))
            n += 1
    db.commit()
    print(f"OK eventos_reproductivos: {n}")


# ---------------------------------------------------------------------------
# Sanidad: eventos, tratamientos (+ episodio anomalo de mastitis)
# ---------------------------------------------------------------------------

@dataclass
class Anomalias:
    mastitis_animales: list[Animal] = field(default_factory=list)
    mastitis_fecha: date | None = None
    averia_maquina: Maquinaria | None = None
    averia_fecha: date | None = None
    alimentacion_fecha: date | None = None


def seed_sanidad(db: Session, rng: random.Random, censo: Censo, empleados: list[Empleado],
                  maquinaria: list[Maquinaria], hoy: date, dias: int) -> Anomalias:
    veterinarios = [e for e in empleados if e.rol == "veterinario"] or empleados
    patologias = ["mastitis", "cojera", "metritis", "cetosis", "desplazamiento_abomaso", "neumonia", "diarrea"]

    n_eventos = 0
    n_tratamientos = 0
    animales_muestra = rng.sample(censo.produccion, k=min(len(censo.produccion), max(4, len(censo.produccion) // 10)))
    for a in animales_muestra:
        pat = rng.choice(patologias)
        inicio = hoy - timedelta(days=rng.randint(1, dias))
        resuelto = rng.random() < 0.8
        evento = EventoSanitario(
            id=uuid4(), animal_id=a.id, tipo_patologia=pat, fecha_inicio=inicio,
            fecha_fin=(inicio + timedelta(days=rng.randint(2, 10))) if resuelto else None,
            tratamiento="Protocolo estandar" if resuelto else None,
            resuelto=resuelto, veterinario_id=rng.choice(veterinarios).id if veterinarios else None,
        )
        db.add(evento)
        n_eventos += 1
        if rng.random() < 0.6:
            farmaco, dosis, via, dias_trat, retirada = rng.choice(FARMACOS)
            # Regla de coherencia (doc 9.3.6): todo tratamiento con farmaco
            # implica un periodo de retirada de leche real y consultable,
            # no solo una nota de texto — se registra en el evento sanitario
            # que motivo el tratamiento (es donde vive la columna en el
            # esquema real), enlazado via evento_sanitario_id.
            if retirada:
                evento.periodo_retirada_hasta = inicio + timedelta(days=retirada)
            db.add(TratamientoActivo(
                id=uuid4(), animal_id=a.id, evento_sanitario_id=evento.id,
                farmaco=farmaco, dosis=dosis, via_administracion=via,
                dias_tratamiento=dias_trat, fecha_inicio=inicio,
                fecha_fin_prevista=inicio + timedelta(days=dias_trat),
                fecha_fin_real=(inicio + timedelta(days=dias_trat)) if resuelto else None,
                activo=not resuelto, checkboxes=[],
                prescrito_por=rng.choice(veterinarios).id if veterinarios else None,
                notas=(f"Periodo de retirada de leche: {retirada} dias." if retirada else None),
            ))
            n_tratamientos += 1

    # --- Episodio anomalo 1: brote de mastitis (trazable en Calidad,
    # Incidencias, Alertas, Tratamientos) ---
    anomalias = Anomalias()
    mastitis_fecha = hoy - timedelta(days=rango_seguro(rng, 10, dias - 5))
    afectadas = rng.sample(censo.produccion, k=min(6, len(censo.produccion)))
    for a in afectadas:
        evento_mastitis = EventoSanitario(
            id=uuid4(), animal_id=a.id, tipo_patologia="mastitis",
            fecha_inicio=mastitis_fecha, fecha_fin=mastitis_fecha + timedelta(days=6),
            tratamiento="Antibioterapia intramamaria", resuelto=True,
            periodo_retirada_hasta=mastitis_fecha + timedelta(days=3),
            veterinario_id=rng.choice(veterinarios).id if veterinarios else None,
        )
        db.add(evento_mastitis)
        n_eventos += 1
        db.add(TratamientoActivo(
            id=uuid4(), animal_id=a.id, evento_sanitario_id=evento_mastitis.id,
            farmaco="Mastijet", dosis="1 cánula/12h",
            via_administracion="intramamaria", dias_tratamiento=4,
            fecha_inicio=mastitis_fecha, fecha_fin_prevista=mastitis_fecha + timedelta(days=4),
            fecha_fin_real=mastitis_fecha + timedelta(days=4), activo=False, checkboxes=[],
            prescrito_por=rng.choice(veterinarios).id if veterinarios else None,
            notas="Periodo de retirada de leche: 3 dias.",
        ))
        n_tratamientos += 1
    anomalias.mastitis_animales = afectadas
    anomalias.mastitis_fecha = mastitis_fecha

    # --- Episodio anomalo 2: averia de robot de ordeño ---
    robots = [m for m in maquinaria if m.tipo == "robot_ordeno"]
    if robots:
        anomalias.averia_maquina = rng.choice(robots)
        anomalias.averia_fecha = hoy - timedelta(days=rango_seguro(rng, 15, dias - 3))

    # --- Episodio anomalo 3: problema de alimentacion ---
    anomalias.alimentacion_fecha = hoy - timedelta(days=rango_seguro(rng, 20, dias - 8))

    db.commit()
    print(f"OK eventos_sanitarios: {n_eventos} (incl. brote mastitis: {len(afectadas)} animales)")
    print(f"OK tratamientos_activos: {n_tratamientos}")
    return anomalias


def seed_eventos_sanitarios_recria(db: Session, rng: random.Random, censo: Censo, empleados: list[Empleado], hoy: date) -> None:
    n = 0
    for a in censo.recria:
        if a.estado != "recria" or (hoy - a.fecha_nacimiento).days > 90:
            continue
        n_controles = rng.randint(1, 4)
        edad_al_nacer = (hoy - a.fecha_nacimiento).days
        for i in range(n_controles):
            edad = max(0, edad_al_nacer - i * 7)
            db.add(EventoSanitarioRecria(
                id=uuid4(), animal_id=a.id, fecha=hoy - timedelta(days=i * 7),
                edad_dias=edad, score_neumonia=rng.choice([0, 0, 0, 1, 2]),
                score_diarrea=rng.choice([0, 0, 0, 1, 2]), score_ombligo=rng.choice([0, 0, 0, 1]),
                peso_kg=Decimal(str(round(38 + edad * 0.7 + rng.uniform(-3, 3), 1))),
                empleado_id=rng.choice(empleados).id if empleados else None,
            ))
            n += 1
    db.commit()
    print(f"OK eventos_sanitarios_recria: {n}")


# ---------------------------------------------------------------------------
# Turnos, asignaciones, tareas y relevos
# ---------------------------------------------------------------------------

def seed_turnos_tareas(db: Session, rng: random.Random, empleados: list[Empleado], zonas: dict[str, Zona],
                        catalogo: dict[str, TareaCatalogo], hoy: date, dias: int) -> tuple[list[Turno], list[TareaEjecucion]]:
    turnos: list[Turno] = []
    ahora = utc_now()
    zonas_list = list(zonas.values())
    catalogo_list = list(catalogo.values())
    empleados_activos = [e for e in empleados if e.activo]

    for d in daterange(hoy - timedelta(days=dias - 1), dias):
        manana = Turno(id=uuid4(), fecha=d, tipo_turno=TipoTurno.MANANA, hora_inicio=time(6, 0), hora_fin=time(14, 0))
        tarde = Turno(id=uuid4(), fecha=d, tipo_turno=TipoTurno.TARDE, hora_inicio=time(14, 0), hora_fin=time(22, 0))
        db.add(manana)
        db.add(tarde)
        turnos.extend([manana, tarde])
    db.flush()

    for turno in turnos:
        es_finde = date(turno.fecha.year, turno.fecha.month, turno.fecha.day).weekday() >= 5
        k = 2 if es_finde else min(3, len(empleados_activos))
        for emp in rng.sample(empleados_activos, k=min(k, len(empleados_activos))):
            db.add(AsignacionTurno(
                id=uuid4(), turno_id=turno.id, empleado_id=emp.id,
                zona_id=emp.zona_principal_id, rol=emp.rol,
            ))
    db.commit()
    print(f"OK turnos: {len(turnos)} (+ asignaciones)")

    # Asignaciones ya committeadas arriba: se cargan una vez por turno (no
    # por tarea) para no lanzar N consultas redundantes por turno.
    asignaciones_por_turno: dict[UUID, list[AsignacionTurno]] = {}
    for row in db.scalars(select(AsignacionTurno)).all():
        asignaciones_por_turno.setdefault(row.turno_id, []).append(row)

    tareas: list[TareaEjecucion] = []
    for turno in turnos:
        n_tareas_turno = rng.randint(4, 8)
        for _ in range(n_tareas_turno):
            cat = rng.choice(catalogo_list)
            zona = rng.choice(zonas_list)
            hora = turno.hora_inicio.hour + rng.randint(0, 6)
            planif = datetime.combine(turno.fecha, time(min(hora, 23), rng.choice([0, 15, 30, 45])), tzinfo=timezone.utc)
            prioridad = rng.choices(
                [PrioridadTarea.BAJA, PrioridadTarea.NORMAL, PrioridadTarea.ALTA, PrioridadTarea.URGENTE],
                weights=[15, 60, 18, 7],
            )[0]

            # La coherencia temporal se decide por el INSTANTE exacto
            # (planif vs ahora), no por el dia del calendario: una tarea
            # planificada para las 22:00 de "hoy" sigue siendo futura si
            # el script se ejecuta a las 14:00, y nunca puede aparecer
            # completada (regla del doc, seccion 9.3.9).
            if planif > ahora:
                estado = EstadoTarea.PENDIENTE
            elif planif < ahora - timedelta(hours=6):
                estado = rng.choices(
                    [EstadoTarea.COMPLETADA, EstadoTarea.VENCIDA, EstadoTarea.CANCELADA],
                    weights=[80, 15, 5],
                )[0]
            else:
                # Ventana reciente (ultimas 6h antes de "ahora"): mezcla de
                # completadas, en curso y pendientes, como en un turno real.
                estado = rng.choices(
                    [EstadoTarea.COMPLETADA, EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO, EstadoTarea.VENCIDA],
                    weights=[45, 35, 10, 10],
                )[0]

            asignaciones_turno = asignaciones_por_turno.get(turno.id, [])
            emp_id = rng.choice(asignaciones_turno).empleado_id if asignaciones_turno else None

            ej = TareaEjecucion(
                id=uuid4(), catalogo_id=cat.id, empleado_id=emp_id, zona_id=zona.id,
                estado=estado, prioridad=prioridad, ts_planificada=planif,
                creado_en=planif - timedelta(hours=rng.randint(1, 12)),
            )
            if estado == EstadoTarea.COMPLETADA:
                ts_inicio = min(planif + timedelta(minutes=rng.randint(-10, 20)), ahora - timedelta(minutes=5))
                ts_fin = min(ts_inicio + timedelta(minutes=rng.randint(10, cat.duracion_estimada_min or 30)), ahora)
                ej.ts_inicio = ts_inicio
                ej.ts_fin = ts_fin
            elif estado == EstadoTarea.EN_CURSO:
                ej.ts_inicio = planif
            db.add(ej)
            tareas.append(ej)
    db.commit()
    print(f"OK tareas_ejecuciones: {len(tareas)}")
    return turnos, tareas


def seed_relevos(db: Session, rng: random.Random, turnos: list[Turno], empleados: list[Empleado], hoy: date) -> None:
    turnos_ordenados = sorted(turnos, key=lambda t: (t.fecha, t.hora_inicio))
    n = 0
    empleados_activos = [e for e in empleados if e.activo]
    for i in range(len(turnos_ordenados) - 1):
        saliente, entrante = turnos_ordenados[i], turnos_ordenados[i + 1]
        if saliente.fecha > hoy:
            continue
        # No generar TODOS los relevos (seria un ruido excesivo); ~70% de las
        # transiciones pasadas quedan registradas.
        if rng.random() > 0.7:
            continue
        db.add(ResumenRelevo(
            id=uuid4(), turno_saliente_id=saliente.id, turno_entrante_id=entrante.id,
            ts_generacion=datetime.combine(saliente.fecha, saliente.hora_fin, tzinfo=timezone.utc),
            incidencias_abiertas=[], tareas_pendientes=[], alertas_pendientes=[],
            notas_saliente=rng.choice([
                "Turno sin incidencias reseñables.",
                "Vigilar RCS del tanque, ligeramente elevado.",
                "Robot 2 con ruido anomalo, revisar en el siguiente mantenimiento.",
                "Ternera nueva en box 3, en observacion.",
                None,
            ]),
            confirmado_por=rng.choice(empleados_activos).id if empleados_activos else None,
            ts_confirmacion=datetime.combine(entrante.fecha, entrante.hora_inicio, tzinfo=timezone.utc),
        ))
        n += 1
    db.commit()
    print(f"OK resumenes_relevo: {n}")


# ---------------------------------------------------------------------------
# Incidencias (+ anomalias) y alertas
# ---------------------------------------------------------------------------

def seed_incidencias(db: Session, rng: random.Random, zonas: dict[str, Zona], empleados: list[Empleado],
                      maquinaria: list[Maquinaria], anomalias: Anomalias, hoy: date, dias: int, n_objetivo: int) -> list[Incidencia]:
    zonas_list = list(zonas.values())
    tipos_pool: list[tuple[TipoIncidencia, NivelSeveridad]] = (
        [(TipoIncidencia.SANIDAD_ANIMAL, NivelSeveridad.MEDIA)] * 5
        + [(TipoIncidencia.SANIDAD_ANIMAL, NivelSeveridad.ALTA)] * 2
        + [(TipoIncidencia.ALIMENTACION, NivelSeveridad.BAJA)] * 4
        + [(TipoIncidencia.ALIMENTACION, NivelSeveridad.MEDIA)] * 2
        + [(TipoIncidencia.AVERIA_MAQUINARIA, NivelSeveridad.MEDIA)] * 4
        + [(TipoIncidencia.AVERIA_MAQUINARIA, NivelSeveridad.ALTA)] * 2
        + [(TipoIncidencia.CALIDAD_LECHE, NivelSeveridad.BAJA)] * 3
        + [(TipoIncidencia.CALIDAD_LECHE, NivelSeveridad.MEDIA)] * 2
        + [(TipoIncidencia.INFRAESTRUCTURA, NivelSeveridad.BAJA)] * 5
        + [(TipoIncidencia.INFRAESTRUCTURA, NivelSeveridad.MEDIA)] * 2
        + [(TipoIncidencia.PEDIDOS, NivelSeveridad.BAJA)] * 3
    )
    titulos = {
        TipoIncidencia.SANIDAD_ANIMAL: ["Cojera detectada en revision", "Sospecha de cetosis", "Retraso en celo", "Animal con fiebre"],
        TipoIncidencia.ALIMENTACION: ["Desviacion en racion TMR", "Retraso en reparto de pienso", "Silo con humedad"],
        TipoIncidencia.AVERIA_MAQUINARIA: ["Ruido anomalo en robot", "Fallo de sensor de flujo", "Bomba de vacio con perdida de presion"],
        TipoIncidencia.CALIDAD_LECHE: ["RCS elevado en tanque", "Desviacion de grasa fuera de rango", "Muestra fuera de plazo"],
        TipoIncidencia.INFRAESTRUCTURA: ["Bebedero atascado", "Puerta de box danada", "Gotera en almacen", "Valla suelta en recria"],
        TipoIncidencia.PEDIDOS: ["Retraso en entrega de pienso", "Falta de material de ordeño"],
    }

    incidencias: list[Incidencia] = []
    empleados_ops = empleados

    for _ in range(n_objetivo):
        tipo, severidad = rng.choice(tipos_pool)
        titulo = rng.choice(titulos[tipo])
        apertura = utc_now() - timedelta(days=rng.randint(0, dias), hours=rng.randint(0, 23))
        estado = rng.choices(["abierta", "en_gestion", "resuelta", "cerrada"], weights=[15, 15, 40, 30])[0]
        cierre = None
        resolucion = None
        if estado in {"resuelta", "cerrada"}:
            horas_resolucion = {"critica": 4, "alta": 10, "media": 36, "baja": 96}[severidad.value]
            cierre = apertura + timedelta(hours=rng.uniform(1, horas_resolucion))
            resolucion = rng.choice([
                "Resuelto tras revision del equipo tecnico.",
                "Solucionado por el personal de turno.",
                "Sustituida la pieza defectuosa.",
                "Aplicado protocolo estandar, sin mas incidencias.",
            ])
        emp = rng.choice(empleados_ops)
        db.add(Incidencia(
            id=uuid4(), tipo=tipo.value, severidad=severidad.value, estado=estado,
            titulo=titulo, descripcion=f"{titulo}. Detectado durante la operativa habitual.",
            zona_id=rng.choice(zonas_list).id, reportado_por=emp.id,
            asignado_a=rng.choice(empleados_ops).id if rng.random() < 0.6 else None,
            ts_apertura=apertura, ts_cierre=cierre, resolucion=resolucion, acciones=[],
        ))

    db.commit()

    # --- Episodio anomalo 1: mastitis -> incidencia critica trazable ---
    if anomalias.mastitis_animales:
        primera = anomalias.mastitis_animales[0]
        apertura = datetime.combine(anomalias.mastitis_fecha, time(7, 30), tzinfo=timezone.utc)
        db.add(Incidencia(
            id=uuid4(), tipo=TipoIncidencia.CALIDAD_LECHE.value, severidad=NivelSeveridad.CRITICA.value,
            estado="resuelta", titulo="Brote de mastitis: RCS critico en tanque",
            descripcion=(
                f"Recuento de celulas somaticas muy por encima del limite tras deteccion de mastitis "
                f"en {len(anomalias.mastitis_animales)} animales. Aislamiento y tratamiento inmediato."
            ),
            zona_id=zonas.get("sala_ordeno").id if zonas.get("sala_ordeno") else None,
            animal_id=primera.id, reportado_por=rng.choice(empleados_ops).id,
            ts_apertura=apertura, ts_cierre=apertura + timedelta(days=6),
            resolucion="Aislamiento de animales afectados, tratamiento antibiotico y descarte de leche durante el periodo de retirada.",
            acciones=[],
        ))
        print("OK incidencia critica trazable: brote de mastitis")

    # --- Episodio anomalo 2: averia de robot ---
    if anomalias.averia_maquina and anomalias.averia_fecha:
        apertura = datetime.combine(anomalias.averia_fecha, time(5, 45), tzinfo=timezone.utc)
        db.add(Incidencia(
            id=uuid4(), tipo=TipoIncidencia.AVERIA_MAQUINARIA.value, severidad=NivelSeveridad.CRITICA.value,
            estado="resuelta", titulo=f"Averia critica en {anomalias.averia_maquina.nombre}",
            descripcion=f"Parada de {anomalias.averia_maquina.nombre} por fallo de sensor de flujo. Ordeño desviado a robots restantes.",
            zona_id=zonas.get("sala_ordeno").id if zonas.get("sala_ordeno") else None,
            maquinaria_id=anomalias.averia_maquina.id, reportado_por=rng.choice(empleados_ops).id,
            ts_apertura=apertura, ts_cierre=apertura + timedelta(hours=18),
            resolucion="Sustituido el sensor de flujo defectuoso y recalibrado el robot.",
            acciones=[],
        ))
        print("OK incidencia critica trazable: averia de robot")

    # --- Episodio anomalo 3: problema de alimentacion ---
    if anomalias.alimentacion_fecha:
        apertura = datetime.combine(anomalias.alimentacion_fecha, time(6, 30), tzinfo=timezone.utc)
        db.add(Incidencia(
            id=uuid4(), tipo=TipoIncidencia.ALIMENTACION.value, severidad=NivelSeveridad.ALTA.value,
            estado="resuelta", titulo="Desviacion severa en racion TMR",
            descripcion="Error en la mezcla de racion unifeed: proporcion de concentrado muy por debajo de lo previsto.",
            zona_id=zonas.get("general").id if zonas.get("general") else None,
            reportado_por=rng.choice(empleados_ops).id,
            ts_apertura=apertura, ts_cierre=apertura + timedelta(hours=8),
            resolucion="Corregida la formulacion y recalibrado el carro mezclador.",
            acciones=[],
        ))
        print("OK incidencia trazable: problema de alimentacion")

    db.commit()
    incidencias = list(db.scalars(select(Incidencia)).all())
    print(f"OK incidencias: {len(incidencias)} en total")
    return incidencias


def seed_alertas(db: Session, rng: random.Random, censo: Censo, zonas: dict[str, Zona], anomalias: Anomalias, dias: int) -> None:
    zonas_list = list(zonas.values())
    plantillas = [
        (NivelAlerta.ALTA, "RCS individual fuera de rango"),
        (NivelAlerta.MEDIA, "Tarea de lavado de robot pendiente"),
        (NivelAlerta.ALTA, "Tratamiento activo sin registrar"),
        (NivelAlerta.BAJA, "Recordatorio de protocolo de vacunacion"),
        (NivelAlerta.MEDIA, "Desviacion de racion TMR > 5%"),
        (NivelAlerta.BAJA, "Revision de bebederos pendiente"),
        (NivelAlerta.MEDIA, "Produccion por debajo de la media del lote"),
    ]
    n = 0
    for nivel, titulo in plantillas:
        for _ in range(rng.randint(2, 5)):
            animal = rng.choice(censo.activos) if rng.random() < 0.6 else None
            db.add(Alerta(
                id=uuid4(), nivel=nivel, titulo=titulo, mensaje=f"{titulo}.",
                animal_id=animal.id if animal else None, zona_id=rng.choice(zonas_list).id,
                activa=rng.random() < 0.4, pantalla_tv=True, tablet=True,
                ts_generacion=utc_now() - timedelta(days=rng.randint(0, dias), hours=rng.randint(0, 23)),
            ))
            n += 1
    for a in anomalias.mastitis_animales:
        db.add(Alerta(
            id=uuid4(), nivel=NivelAlerta.ALTA, titulo="RCS critico por brote de mastitis",
            mensaje="Animal afectado por el brote de mastitis detectado en el tanque.",
            animal_id=a.id, activa=False,
            pantalla_tv=True, tablet=True,
            ts_generacion=datetime.combine(anomalias.mastitis_fecha, time(7, 45), tzinfo=timezone.utc),
        ))
        n += 1
    db.commit()
    print(f"OK alertas: {n}")


# ---------------------------------------------------------------------------
# Calidad de tanque (+ anomalias de mastitis/alimentacion)
# ---------------------------------------------------------------------------

def seed_analiticas_tanque(db: Session, rng: random.Random, anomalias: Anomalias, hoy: date, dias: int, n_vacas_produccion: int) -> None:
    n = 0
    for d in daterange(hoy - timedelta(days=dias - 1), dias):
        factor_comp, factor_vol = variacion_estacional(d)
        volumen_base = n_vacas_produccion * 27.5 * factor_vol
        grasa = 3.85 * factor_comp
        proteina = 3.32 * factor_comp
        rcs = rng.randint(120, 260)
        urea = round(rng.uniform(20, 30), 2)

        en_mastitis = anomalias.mastitis_fecha is not None and 0 <= (d - anomalias.mastitis_fecha).days < 6
        if en_mastitis:
            rcs = rng.randint(380, 480)
        en_alimentacion = anomalias.alimentacion_fecha is not None and 0 <= (d - anomalias.alimentacion_fecha).days < 3
        if en_alimentacion:
            proteina = round(proteina * 0.88, 3)
            urea = round(urea * 0.7, 2)
        en_averia = anomalias.averia_fecha is not None and d == anomalias.averia_fecha
        if en_averia:
            volumen_base *= 0.82

        db.add(AnaliticaTanque(
            id=uuid4(), fecha=d, lote=f"L-{d.strftime('%Y%m%d')}",
            volumen_l=Decimal(str(round(volumen_base, 1))),
            grasa_pct=Decimal(str(round(grasa, 3))),
            proteina_pct=Decimal(str(round(proteina, 3))),
            lactosa_pct=Decimal(str(round(rng.uniform(4.6, 4.9), 3))),
            rcs_x1000=rcs, bacteriologia_ufc_ml=rng.randint(10, 45),
            urea_mg_dl=Decimal(str(urea)), temperatura_c=Decimal(str(round(rng.uniform(3.5, 4.5), 1))),
            inhibidores=False, laboratorio="Laboratorio Interprofesional Galego do Leite",
        ))
        n += 1
    db.commit()
    print(f"OK analiticas_tanque: {n} (incl. picos de RCS por mastitis y caida de volumen por averia)")


# ---------------------------------------------------------------------------
# Lecturas de robot de ordeño (volumen alto -> insercion masiva)
# ---------------------------------------------------------------------------

def seed_lecturas_robot(db: Session, rng: random.Random, censo: Censo, activa_por_animal: dict[UUID, Lactacion],
                         maquinaria: list[Maquinaria], anomalias: Anomalias, hoy: date, dias: int) -> None:
    robots = [m for m in maquinaria if m.tipo == "robot_ordeno"]
    if not robots:
        print("SKIP lecturas_robot_ordeno (no hay robots de ordeño)")
        return

    filas: list[dict] = []
    # LecturaRobotOrdeno tiene PK compuesta (ts, robot_id): con timestamps
    # puramente aleatorios, ~150-200 lecturas/dia para un mismo robot chocan
    # con altisima probabilidad (paradoja del cumpleaños sobre 1440 minutos).
    # Se espacian deterministamente cada 5 minutos por (robot, dia) para
    # garantizar unicidad exacta sin perder aleatoriedad en el resto de campos.
    contador_ts: dict[tuple[UUID, date], int] = {}

    for a in censo.produccion:
        lactacion = activa_por_animal.get(a.id)
        multipara = bool(lactacion and lactacion.numero > 1)
        dim_hoy = (hoy - lactacion.fecha_parto).days if lactacion else rng.randint(20, 200)
        robot = rng.choice(robots)
        for d in daterange(hoy - timedelta(days=dias - 1), dias):
            dim = max(1, dim_hoy - (hoy - d).days)
            produccion_diaria = wood_curve(dim, multipara)

            en_averia = (
                anomalias.averia_maquina is not None and robot.id == anomalias.averia_maquina.id
                and anomalias.averia_fecha is not None and d == anomalias.averia_fecha
            )
            en_mastitis = (
                a in anomalias.mastitis_animales and anomalias.mastitis_fecha is not None
                and 0 <= (d - anomalias.mastitis_fecha).days < 6
            )
            n_ordeños = 2 if rng.random() < 0.7 else 3
            for _ in range(n_ordeños):
                produccion_ordeño = (produccion_diaria / n_ordeños) * rng.uniform(0.85, 1.15)
                intentos_fallidos = 0
                alerta_robot = False
                if en_averia:
                    produccion_ordeño *= rng.uniform(0.1, 0.4)
                    intentos_fallidos = rng.randint(2, 5)
                    alerta_robot = True
                scc = rng.randint(80, 250) * 1000
                if en_mastitis:
                    scc = rng.randint(400, 900) * 1000
                    produccion_ordeño *= 0.75

                clave = (robot.id, d)
                orden = contador_ts.get(clave, 0)
                contador_ts[clave] = orden + 1
                ts = datetime.combine(d, time(0, 0), tzinfo=timezone.utc) + timedelta(minutes=5 * orden)

                filas.append({
                    "ts": ts,
                    "robot_id": robot.id, "animal_id": a.id,
                    "lactacion_id": lactacion.id if lactacion else None,
                    "produccion_kg": Decimal(str(round(max(0.3, produccion_ordeño), 2))),
                    "conductividad": Decimal(str(round(rng.uniform(4.0, 6.5), 2))),
                    "flujo_max": Decimal(str(round(rng.uniform(1.8, 3.2), 2))),
                    "scc": scc, "duracion_min": Decimal(str(round(rng.uniform(4.5, 8.5), 1))),
                    "intentos_fallidos": intentos_fallidos, "alerta_robot": alerta_robot,
                })

    # Insercion masiva por lotes para no penalizar el rendimiento con ~40k filas.
    lote = 5000
    for i in range(0, len(filas), lote):
        db.execute(LecturaRobotOrdeno.__table__.insert(), filas[i:i + lote])
    db.commit()
    print(f"OK lecturas_robot_ordeno: {len(filas)}")


# ---------------------------------------------------------------------------
# Boxes de recria, pedidos, meteorologia
# ---------------------------------------------------------------------------

def seed_boxes(db: Session, censo: Censo, hoy: date) -> None:
    terneros_en_boxes = [a for a in censo.recria if a.zona_id is not None]
    n_boxes = max(20, len(terneros_en_boxes))
    for n in range(1, n_boxes + 1):
        ternero = terneros_en_boxes[n - 1] if n - 1 < len(terneros_en_boxes) else None
        db.add(BoxRecria(
            id=uuid4(), box_numero=n, ternero_id=ternero.id if ternero else None,
            fecha_entrada=ternero.fecha_entrada if ternero else None,
            activo=True, alertas_box=[],
        ))
    db.commit()
    print(f"OK boxes_recria: {n_boxes}")


def seed_pedidos(db: Session, rng: random.Random, empleados: list[Empleado], dias: int, n_objetivo: int) -> None:
    insumos = [
        ("Pienso de arranque terneros", "kg", "Nutrega"),
        ("Concentrado produccion", "kg", "Nutrega"),
        ("Pajuelas de semen Frisona", "ud", "Xenetica Fontao"),
        ("Selladores de pezones", "garrafa", "DeLaval"),
        ("Guantes de palpacion", "caja", "Agrocenter"),
        ("Desinfectante de camas", "kg", "Agrocenter"),
        ("Filtros de leche", "caja", "DeLaval"),
        ("Antibioticos intramamarios", "caja", "Distribuciones Veterinarias Lugo"),
    ]
    estados = ["solicitado", "aprobado", "en_transito", "recibido", "recibido", "cancelado"]
    for _ in range(n_objetivo):
        insumo, unidad, proveedor = rng.choice(insumos)
        estado = rng.choice(estados)
        solicitud = utc_now() - timedelta(days=rng.randint(0, dias))
        coste_est = Decimal(str(round(rng.uniform(80, 1200), 2)))
        db.add(Pedido(
            id=uuid4(), insumo=insumo, cantidad=Decimal(str(rng.randint(5, 1000))), unidad=unidad,
            estado=estado, solicitante_id=rng.choice(empleados).id if empleados else None,
            ts_solicitud=solicitud,
            ts_aprobacion=(solicitud + timedelta(hours=rng.randint(2, 48))) if estado != "solicitado" else None,
            ts_recepcion=(solicitud + timedelta(days=rng.randint(1, 10))) if estado == "recibido" else None,
            proveedor=proveedor, coste_estimado=coste_est,
            coste_real=(coste_est * Decimal(str(round(rng.uniform(0.9, 1.1), 2)))) if estado == "recibido" else None,
        ))
    db.commit()
    print(f"OK pedidos: {n_objetivo}")


def seed_meteo(db: Session, rng: random.Random, hoy: date, dias: int) -> None:
    n = 0
    for d in daterange(hoy - timedelta(days=dias - 1), dias):
        _, factor_vol = variacion_estacional(d)
        temp_base = 16 - (factor_vol - 1) * 80  # mas frio cuando el factor de volumen baja (invierno)
        for hora in (6, 12, 18):
            db.add(LecturaMeteo(
                ts=datetime.combine(d, time(hora, 0), tzinfo=timezone.utc),
                estacion_id=ESTACION_ID,
                temperatura_c=Decimal(str(round(temp_base + rng.uniform(-3, 3), 1))),
                humedad_relativa=Decimal(str(round(rng.uniform(60, 92), 1))),
                precipitacion_mm=None,
                prob_precipitacion_pct=Decimal(str(rng.choice([0, 10, 20, 30, 50, 70]))),
                viento_km_h=Decimal(str(round(rng.uniform(3, 28), 1))),
            ))
            n += 1
    db.commit()
    print(f"OK lecturas_meteorologia: {n}")


# ---------------------------------------------------------------------------
# Estado / orquestacion
# ---------------------------------------------------------------------------

def print_status(db: Session) -> None:
    pares = [
        ("zonas", Zona), ("maquinaria", Maquinaria), ("tareas_catalogo", TareaCatalogo),
        ("tareas_recurrentes", TareaRecurrente), ("empleados", Empleado), ("animales", Animal),
        ("movimientos_animal", MovimientoAnimal), ("lactaciones", Lactacion),
        ("eventos_reproductivos", EventoReproductivo), ("eventos_sanitarios", EventoSanitario),
        ("eventos_sanitarios_recria", EventoSanitarioRecria), ("tratamientos_activos", TratamientoActivo),
        ("incidencias", Incidencia), ("alertas", Alerta), ("analiticas_tanque", AnaliticaTanque),
        ("lecturas_robot_ordeno", LecturaRobotOrdeno), ("tareas_ejecuciones", TareaEjecucion),
        ("turnos", Turno), ("asignaciones_turno", AsignacionTurno), ("resumenes_relevo", ResumenRelevo),
        ("pedidos", Pedido), ("boxes_recria", BoxRecria), ("lecturas_meteorologia", LecturaMeteo),
    ]
    print("Recuentos actuales:")
    for nombre, model in pares:
        print(f"  {nombre:<26} {db.scalar(select(func.count()).select_from(model)) or 0}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generador de dataset realista de explotacion completa (T11).")
    parser.add_argument("--status", action="store_true", help="Solo mostrar recuentos, no sembrar.")
    parser.add_argument("--purge", action="store_true", help="Borrar las tablas de dominio y regenerar desde cero.")
    parser.add_argument("--dry-run", action="store_true", help="No escribe nada; solo valida configuracion.")
    parser.add_argument("--animales", type=int, default=300, help="Numero de animales activos objetivo (default 300).")
    parser.add_argument("--dias", type=int, default=90, help="Dias de historico a generar (default 90).")
    parser.add_argument("--incidencias", type=int, default=120, help="Numero de incidencias base a generar.")
    parser.add_argument("--pedidos", type=int, default=40, help="Numero de pedidos a generar.")
    parser.add_argument("--seed", type=int, default=42, help="Semilla RNG para reproducibilidad.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.status:
            print_status(db)
            return

        if args.dry_run:
            print(f"Dry-run OK: animales={args.animales} dias={args.dias} seed={args.seed}. Nada escrito.")
            return

        if not args.purge:
            existentes = db.scalar(select(func.count()).select_from(Animal)) or 0
            if existentes > 0:
                print(
                    f"Ya hay {existentes} animales en la base de datos. "
                    "Usa --purge para regenerar el dataset completo desde cero, "
                    "o --status para ver los recuentos actuales."
                )
                return

        rng = make_rng(args.seed)
        hoy = utc_now().date()

        if args.purge:
            purge(db)

        zonas = ensure_zonas_jerarquia(db)
        maquinaria = ensure_maquinaria(db, zonas)
        catalogo = ensure_tareas_catalogo(db)
        seed_tareas_recurrentes(db, catalogo, zonas, hoy)

        empleados = seed_empleados(db, zonas, hoy)
        censo = seed_animales(db, rng, zonas, hoy, args.animales)
        seed_movimientos(db, rng, censo, zonas, empleados, hoy, args.dias)

        activa_por_animal = seed_lactaciones(db, rng, censo, hoy)
        seed_eventos_reproductivos(db, rng, censo, empleados, hoy, args.dias)
        anomalias = seed_sanidad(db, rng, censo, empleados, maquinaria, hoy, args.dias)
        seed_eventos_sanitarios_recria(db, rng, censo, empleados, hoy)

        turnos, _tareas = seed_turnos_tareas(db, rng, empleados, zonas, catalogo, hoy, args.dias)
        seed_relevos(db, rng, turnos, empleados, hoy)

        seed_incidencias(db, rng, zonas, empleados, maquinaria, anomalias, hoy, args.dias, args.incidencias)
        seed_alertas(db, rng, censo, zonas, anomalias, args.dias)

        seed_analiticas_tanque(db, rng, anomalias, hoy, args.dias, len(censo.produccion))
        seed_lecturas_robot(db, rng, censo, activa_por_animal, maquinaria, anomalias, hoy, args.dias)

        seed_boxes(db, censo, hoy)
        seed_pedidos(db, rng, empleados, args.dias, args.pedidos)
        seed_meteo(db, rng, hoy, args.dias)

        print("\nListo. Estado final:")
        print_status(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
