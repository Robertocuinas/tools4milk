"""
Modelos ORM para las tablas reales del esquema Tools4Milk (init.sql).
Coexisten con los modelos core_* durante la migración incremental.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM as PGEnum, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import EstadoTarea, EstadoAnimal, EstadoIncidencia, NivelAlerta, NivelSeveridad, PrioridadTarea, TipoTurno, TipoIncidencia


POSTGRES_JSON = JSONB().with_variant(JSON(), "sqlite")
POSTGRES_TEXT_ARRAY = ARRAY(Text).with_variant(JSON(), "sqlite")
ROL_EMPLEADO = PGEnum("encargado", "auxiliar", "veterinario", "mecanico", name="rol_empleado", create_type=False).with_variant(String(40), "sqlite")
TIPO_MAQUINARIA = PGEnum("robot_ordeno", "carro_mezclador", "amamantadora", "bomba", "otro", name="tipo_maquinaria", create_type=False).with_variant(String(40), "sqlite")
SEXO_ANIMAL = PGEnum("hembra", "macho", name="sexo_animal", create_type=False).with_variant(String(20), "sqlite")
ESTADO_REPRODUCTIVO = PGEnum("vacia", "en_celo", "inseminada", "confirmada_gestante", "parto_reciente", name="estado_reproductivo", create_type=False).with_variant(String(40), "sqlite")
TIPO_PATOLOGIA = PGEnum("mastitis", "cojera", "metritis", "cetosis", "desplazamiento_abomaso", "neumonia", "diarrea", "otra", name="tipo_patologia", create_type=False).with_variant(String(50), "sqlite")
ESTADO_PEDIDO = PGEnum("solicitado", "aprobado", "en_transito", "recibido", "cancelado", name="estado_pedido", create_type=False).with_variant(String(20), "sqlite")
TIPO_EVENTO_REPRO = PGEnum("celo", "inseminacion", "diagnostico_gestacion", "aborto", "parto", "secado", name="tipo_evento_repro", create_type=False).with_variant(String(50), "sqlite")


# ---------------------------------------------------------------------------
# Zonas
# ---------------------------------------------------------------------------

class Zona(Base):
    __tablename__ = "zonas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    tiene_pantalla_tv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tiene_tablet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Jerarquia de zonas (T10.3): permite agrupar p.ej. "Boxes externos" y
    # "Zona general de recria" bajo una zona raiz "Recria", en vez de la
    # agrupacion hardcodeada que hoy vive en el frontend (TV_VISUAL_ZONES en
    # tv/page.tsx y lib/visual-zones.ts).
    zona_padre_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id", ondelete="SET NULL"))
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ---------------------------------------------------------------------------
# Empleados
# ---------------------------------------------------------------------------

class Empleado(Base):
    __tablename__ = "empleados"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellidos: Mapped[str] = mapped_column(String(150), nullable=False)
    rol: Mapped[str] = mapped_column(ROL_EMPLEADO, nullable=False)
    zona_principal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id", ondelete="SET NULL"))
    cualificaciones: Mapped[list[str] | None] = mapped_column(POSTGRES_TEXT_ARRAY, default=list)
    telefono: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(150))
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fecha_alta: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_baja: Mapped[date | None] = mapped_column(Date)
    # T10.2: idioma preferente del trabajador (codigo corto, p.ej. "es",
    # "gl", "en", "fr") y vinculo opcional con su cuenta de la aplicacion.
    # usuario_id cierra el TODO "Phase 13" de frontend/profile/page.tsx,
    # donde el "modo trabajador" es hoy puramente local/visual sin ningun
    # vinculo real usuario<->empleado en el backend.
    idioma_preferente: Mapped[str] = mapped_column(String(5), nullable=False, default="es")
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), unique=True)


# ---------------------------------------------------------------------------
# Maquinaria
# ---------------------------------------------------------------------------

class Maquinaria(Base):
    __tablename__ = "maquinaria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo: Mapped[str] = mapped_column(TIPO_MAQUINARIA, nullable=False)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id", ondelete="SET NULL"))
    marca: Mapped[str | None] = mapped_column(String(100))
    modelo: Mapped[str | None] = mapped_column(String(100))
    numero_serie: Mapped[str | None] = mapped_column(String(100), unique=True)
    fecha_instalacion: Mapped[date | None] = mapped_column(Date)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    estado: Mapped[str] = mapped_column(String(40), nullable=False, default="operativa")
    notas: Mapped[str | None] = mapped_column(Text)

    zona: Mapped[Zona | None] = relationship("Zona", foreign_keys=[zona_id])


# ---------------------------------------------------------------------------
# Animales
# ---------------------------------------------------------------------------

class Animal(Base):
    __tablename__ = "animales"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crotal_oficial: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    nombre: Mapped[str | None] = mapped_column(String(80))
    sexo: Mapped[str] = mapped_column(SEXO_ANIMAL, nullable=False, default="hembra")
    fecha_nacimiento: Mapped[date] = mapped_column(Date, nullable=False)
    raza: Mapped[str | None] = mapped_column(String(80))
    estado: Mapped[EstadoAnimal] = mapped_column(
        Enum(EstadoAnimal, name="estado_animal", values_callable=lambda x: [e.value for e in x]).with_variant(String(30), "sqlite"),
        nullable=False,
        default=EstadoAnimal.RECRIA,
        index=True,
    )
    estado_reproductivo: Mapped[str | None] = mapped_column(ESTADO_REPRODUCTIVO, index=True)
    madre_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"))
    # Genealogía paterna (migración 0016). padre_id solo para sementales
    # registrados en la explotación; padre_crotal/padre_nombre para el caso
    # habitual de un toro externo (inseminación artificial).
    padre_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("animales.id", ondelete="SET NULL")
    )
    padre_crotal: Mapped[str | None] = mapped_column(String(40))
    padre_nombre: Mapped[str | None] = mapped_column(String(120))
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id", ondelete="SET NULL"), index=True)
    fecha_entrada: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_baja: Mapped[date | None] = mapped_column(Date)
    motivo_baja: Mapped[str | None] = mapped_column(String(200))
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Movimientos de animal (T10.4)
# ---------------------------------------------------------------------------
# Historial de cambios de ubicacion. animales.zona_id solo guarda la posicion
# ACTUAL; esta tabla registra el historial completo (de que zona a que zona,
# cuando, por que y quien lo hizo), que hoy no existe en ningun sitio.

class MovimientoAnimal(Base):
    __tablename__ = "movimientos_animal"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id", ondelete="CASCADE"), nullable=False, index=True)
    zona_origen_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"))
    zona_destino_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(120))
    empleado_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Lactaciones
# ---------------------------------------------------------------------------

class Lactacion(Base):
    __tablename__ = "lactaciones"
    __table_args__ = (UniqueConstraint("animal_id", "numero"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    numero: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    fecha_parto: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fecha_secado: Mapped[date | None] = mapped_column(Date)
    produccion_total_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    grasa_promedio: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    proteina_promedio: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    rcs_promedio: Mapped[int | None] = mapped_column(Integer)
    notas: Mapped[str | None] = mapped_column(Text)

    animal: Mapped[Animal] = relationship("Animal", foreign_keys=[animal_id])


# ---------------------------------------------------------------------------
# Analiticas de tanque (T10.1)
# ---------------------------------------------------------------------------
# Calidad de leche de TANQUE/entrega a industria (lactosa, bacteriologia,
# urea, temperatura, volumen, lote): un control distinto y complementario a
# `lactaciones` (que guarda promedios POR LACTACION, no series diarias) y a
# `lecturas_robot_ordeno` (que guarda POR ORDEÑO individual). Ninguna de las
# dos permite hoy representar el control de calidad de tanque que pide el
# modulo Calidad. Conviven todas: son mediciones de fuentes distintas.

class AnaliticaTanque(Base):
    __tablename__ = "analiticas_tanque"
    __table_args__ = (UniqueConstraint("fecha", "lote"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    lote: Mapped[str | None] = mapped_column(String(40))
    volumen_l: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    grasa_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    proteina_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    lactosa_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    rcs_x1000: Mapped[int | None] = mapped_column(Integer)
    bacteriologia_ufc_ml: Mapped[int | None] = mapped_column(Integer)
    urea_mg_dl: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    temperatura_c: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    punto_criscopico: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    inhibidores: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    laboratorio: Mapped[str | None] = mapped_column(String(150))
    observaciones: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Tratamientos activos
# ---------------------------------------------------------------------------

class TratamientoActivo(Base):
    __tablename__ = "tratamientos_activos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    evento_sanitario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("eventos_sanitarios.id"))
    farmaco: Mapped[str] = mapped_column(String(200), nullable=False)
    dosis: Mapped[str | None] = mapped_column(String(100))
    via_administracion: Mapped[str | None] = mapped_column(String(80))
    dias_tratamiento: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin_prevista: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin_real: Mapped[date | None] = mapped_column(Date)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    checkboxes: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    prescrito_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    notas: Mapped[str | None] = mapped_column(Text)

    animal: Mapped[Animal] = relationship("Animal", foreign_keys=[animal_id])
    # Auditoria post-implementacion (hallazgo 3.4): sin esta relacion,
    # treatments_service.py no podia acceder a periodo_retirada_hasta y
    # servia siempre null un dato real de seguridad alimentaria (cuando la
    # leche de un animal tratado vuelve a ser apta).
    evento_sanitario: Mapped["EventoSanitario | None"] = relationship(
        "EventoSanitario", foreign_keys=[evento_sanitario_id]
    )


# ---------------------------------------------------------------------------
# Eventos sanitarios
# ---------------------------------------------------------------------------

class EventoSanitario(Base):
    __tablename__ = "eventos_sanitarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    tipo_patologia: Mapped[str] = mapped_column(TIPO_PATOLOGIA, nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    tratamiento: Mapped[str | None] = mapped_column(Text)
    farmaco: Mapped[str | None] = mapped_column(String(200))
    dosis: Mapped[str | None] = mapped_column(String(100))
    via_administracion: Mapped[str | None] = mapped_column(String(80))
    periodo_retirada_hasta: Mapped[date | None] = mapped_column(Date)
    resuelto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    coste: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    veterinario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Incidencias
# ---------------------------------------------------------------------------

class Incidencia(Base):
    __tablename__ = "incidencias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo: Mapped[TipoIncidencia] = mapped_column(
        Enum(TipoIncidencia, name="tipo_incidencia", values_callable=lambda x: [e.value for e in x]).with_variant(String(50), "sqlite"),
        nullable=False,
        default=TipoIncidencia.INFRAESTRUCTURA,
        index=True,
    )
    subtipo: Mapped[str | None] = mapped_column(String(80))
    severidad: Mapped[NivelSeveridad] = mapped_column(
        Enum(NivelSeveridad, name="nivel_severidad", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
        default=NivelSeveridad.MEDIA,
    )
    estado: Mapped[EstadoIncidencia] = mapped_column(
        Enum(EstadoIncidencia, name="estado_incidencia", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
        default=EstadoIncidencia.ABIERTA,
        index=True,
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"), index=True)
    maquinaria_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("maquinaria.id"))
    animal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), index=True)
    reportado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    asignado_a: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    ts_apertura: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ts_cierre: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    foto_url: Mapped[str | None] = mapped_column(Text)
    acciones: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    resolucion: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Alertas umbrales
# ---------------------------------------------------------------------------

class AlertaUmbral(Base):
    __tablename__ = "alertas_umbrales"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    metrica: Mapped[str] = mapped_column(String(100), nullable=False)
    operador: Mapped[str] = mapped_column(String(10), nullable=False)
    valor_umbral: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unidad: Mapped[str | None] = mapped_column(String(30))
    # Auditoria post-implementacion (hallazgo 3.5): estaba mapeada como
    # String(20) pero la columna real en BD es el enum nativo nivel_alerta
    # (ver database/init.sql) — cualquier escritura ORM enviaba texto a una
    # columna enum. Alinear con Alerta.nivel, que ya estaba bien tipado.
    nivel_alerta: Mapped[NivelAlerta] = mapped_column(
        Enum(NivelAlerta, name="nivel_alerta", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
    )
    push_whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pantalla_tv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tablet: Mapped[bool] = mapped_column(Boolean, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Alertas
# ---------------------------------------------------------------------------

class Alerta(Base):
    __tablename__ = "alertas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    umbral_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("alertas_umbrales.id"))
    nivel: Mapped[NivelAlerta] = mapped_column(
        Enum(NivelAlerta, name="nivel_alerta", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    mensaje: Mapped[str | None] = mapped_column(Text)
    origen_tabla: Mapped[str | None] = mapped_column(String(100))
    origen_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    animal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), index=True)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"))
    push_whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pantalla_tv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tablet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ts_generacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ts_resolucion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resuelta_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))


# ---------------------------------------------------------------------------
# Tareas catálogo
# ---------------------------------------------------------------------------

class TareaCatalogo(Base):
    __tablename__ = "tareas_catalogo"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    cualificacion_requerida: Mapped[str | None] = mapped_column(Text)
    duracion_estimada_min: Mapped[int | None] = mapped_column(Integer)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ---------------------------------------------------------------------------
# Tareas recurrentes
# ---------------------------------------------------------------------------

class TareaRecurrente(Base):
    __tablename__ = "tareas_recurrentes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalogo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tareas_catalogo.id"), nullable=False)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"))
    maquinaria_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("maquinaria.id"))
    frecuencia_expr: Mapped[str] = mapped_column(String(100), nullable=False)
    descripcion_frecuencia: Mapped[str | None] = mapped_column(Text)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    notas: Mapped[str | None] = mapped_column(Text)

    catalogo: Mapped[TareaCatalogo] = relationship("TareaCatalogo", foreign_keys=[catalogo_id])


# ---------------------------------------------------------------------------
# Tareas ejecuciones
# ---------------------------------------------------------------------------

class TareaEjecucion(Base):
    __tablename__ = "tareas_ejecuciones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalogo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tareas_catalogo.id"), nullable=False)
    recurrente_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tareas_recurrentes.id"))
    empleado_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"), index=True)
    maquinaria_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("maquinaria.id"))
    estado: Mapped[EstadoTarea] = mapped_column(
        Enum(EstadoTarea, name="estado_tarea", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
        default=EstadoTarea.PENDIENTE,
        index=True,
    )
    prioridad: Mapped[PrioridadTarea] = mapped_column(
        Enum(PrioridadTarea, name="prioridad_tarea", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
        default=PrioridadTarea.NORMAL,
        index=True,
    )
    ts_planificada: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ts_inicio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ts_fin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    catalogo: Mapped[TareaCatalogo] = relationship("TareaCatalogo", foreign_keys=[catalogo_id])
    empleado: Mapped[Empleado | None] = relationship("Empleado", foreign_keys=[empleado_id])


# ---------------------------------------------------------------------------
# Turnos y asignaciones
# ---------------------------------------------------------------------------

class Turno(Base):
    __tablename__ = "turnos"
    __table_args__ = (UniqueConstraint("fecha", "tipo_turno"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    tipo_turno: Mapped[TipoTurno] = mapped_column(
        Enum(TipoTurno, name="tipo_turno", values_callable=lambda x: [e.value for e in x]).with_variant(String(20), "sqlite"),
        nullable=False,
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text)


class AsignacionTurno(Base):
    __tablename__ = "asignaciones_turno"
    __table_args__ = (UniqueConstraint("turno_id", "empleado_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turno_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("turnos.id", ondelete="CASCADE"), nullable=False)
    empleado_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"), nullable=False)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zonas.id"))
    rol: Mapped[str | None] = mapped_column(String(80))


class ConfiguracionSistema(Base):
    """Configuración global persistente de la explotación."""
    __tablename__ = "configuracion_sistema"
    __table_args__ = (CheckConstraint("id = 1", name="ck_configuracion_sistema_singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    turno_noche_habilitado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ---------------------------------------------------------------------------
# Pedidos
# ---------------------------------------------------------------------------

class Pedido(Base):
    __tablename__ = "pedidos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    insumo: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unidad: Mapped[str | None] = mapped_column(String(30))
    estado: Mapped[str] = mapped_column(ESTADO_PEDIDO, nullable=False, default="solicitado", index=True)
    solicitante_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    ts_solicitud: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ts_aprobacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ts_recepcion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    proveedor: Mapped[str | None] = mapped_column(String(150))
    coste_estimado: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    coste_real: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tabla_afectada: Mapped[str] = mapped_column(String(100), nullable=False)
    operacion: Mapped[str] = mapped_column(String(6), nullable=False)
    registro_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    datos_anteriores: Mapped[dict | None] = mapped_column(POSTGRES_JSON)
    datos_nuevos: Mapped[dict | None] = mapped_column(POSTGRES_JSON)
    usuario_bd: Mapped[str] = mapped_column(String(100), nullable=False)
    hash_sha256: Mapped[str] = mapped_column(Text, nullable=False)


# ---------------------------------------------------------------------------
# Lecturas meteorología
# ---------------------------------------------------------------------------

class LecturaMeteo(Base):
    __tablename__ = "lecturas_meteorologia"

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    estacion_id: Mapped[str] = mapped_column(String(20), primary_key=True, nullable=False)
    temperatura_c: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    humedad_relativa: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    # Precipitación acumulada real en mm (normalmente null en la predicción AEMET municipal).
    precipitacion_mm: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    # Probabilidad de precipitación en % (lo que devuelve la predicción diaria de AEMET).
    prob_precipitacion_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    viento_km_h: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    direccion_viento: Mapped[int | None] = mapped_column(SmallInteger)
    radiacion_wm2: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    # indice_thermo_humedad es GENERATED ALWAYS AS STORED en PostgreSQL — solo lectura


# ---------------------------------------------------------------------------
# Lecturas robot de ordeño (series temporales, PK compuesta)
# ---------------------------------------------------------------------------

class LecturaRobotOrdeno(Base):
    __tablename__ = "lecturas_robot_ordeno"
    __table_args__ = (PrimaryKeyConstraint("ts", "robot_id"),)

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    robot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("maquinaria.id"), nullable=False)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False)
    lactacion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lactaciones.id"))
    produccion_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    conductividad: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    flujo_max: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    scc: Mapped[int | None] = mapped_column(Integer)
    duracion_min: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    intentos_fallidos: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    alerta_robot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


# ---------------------------------------------------------------------------
# Lecturas carro mezclador (series temporales, PK compuesta)
# ---------------------------------------------------------------------------

class LecturaCarroMezclador(Base):
    __tablename__ = "lecturas_carro_mezclador"
    __table_args__ = (PrimaryKeyConstraint("ts", "mezcla_id", "ingrediente"),)

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mezcla_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ingrediente: Mapped[str] = mapped_column(String(100), nullable=False)
    peso_objetivo: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    peso_real: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    # desviacion_pct es GENERATED ALWAYS AS STORED en PostgreSQL — solo lectura
    operario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))


# ---------------------------------------------------------------------------
# Eventos reproductivos
# ---------------------------------------------------------------------------

class EventoReproductivo(Base):
    __tablename__ = "eventos_reproductivos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(TIPO_EVENTO_REPRO, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    hora: Mapped[time | None] = mapped_column(Time)
    empleado_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    detalles: Mapped[dict] = mapped_column(POSTGRES_JSON, nullable=False, default=dict)
    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ---------------------------------------------------------------------------
# Eventos sanitarios de recría
# ---------------------------------------------------------------------------

class EventoSanitarioRecria(Base):
    __tablename__ = "eventos_sanitarios_recria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    edad_dias: Mapped[int | None] = mapped_column(Integer)
    score_neumonia: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_diarrea: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_ombligo: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    peso_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    tratamiento: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)
    empleado_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))


# ---------------------------------------------------------------------------
# Genómica
# ---------------------------------------------------------------------------

class Genomica(Base):
    __tablename__ = "genomica"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), nullable=False, index=True)
    fecha_extraccion: Mapped[date] = mapped_column(Date, nullable=False)
    tipo_muestra: Mapped[str | None] = mapped_column(String(60))
    laboratorio: Mapped[str | None] = mapped_column(String(150))
    referencia_lab: Mapped[str | None] = mapped_column(String(100))
    fecha_resultado: Mapped[date | None] = mapped_column(Date)
    resultados_ref: Mapped[str | None] = mapped_column(Text)
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Boxes de recría
# ---------------------------------------------------------------------------

class BoxRecria(Base):
    __tablename__ = "boxes_recria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    box_numero: Mapped[int] = mapped_column(SmallInteger, nullable=False, unique=True)
    ternero_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("animales.id"), index=True)
    fecha_entrada: Mapped[date | None] = mapped_column(Date)
    fecha_salida: Mapped[date | None] = mapped_column(Date)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    alertas_box: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    notas: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Resúmenes de relevo
# ---------------------------------------------------------------------------

class ResumenRelevo(Base):
    __tablename__ = "resumenes_relevo"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turno_saliente_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("turnos.id"), nullable=False)
    turno_entrante_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("turnos.id"), nullable=False)
    ts_generacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    incidencias_abiertas: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    tareas_pendientes: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    alertas_pendientes: Mapped[list] = mapped_column(POSTGRES_JSON, nullable=False, default=list)
    notas_saliente: Mapped[str | None] = mapped_column(Text)
    confirmado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    ts_confirmacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Adjuntos (T7: fotos de incidencias, extensible a otras entidades)
# ---------------------------------------------------------------------------

class Adjunto(Base):
    __tablename__ = "adjuntos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entidad_tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tipo_media: Mapped[str] = mapped_column(String(20), nullable=False)
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    ancho_px: Mapped[int | None] = mapped_column(Integer)
    alto_px: Mapped[int | None] = mapped_column(Integer)
    duracion_seg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    hash_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    subido_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("empleados.id"))
    ts_subida: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    eliminado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
