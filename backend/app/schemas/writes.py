"""Validated write contracts; only declared fields reach repositories."""
from datetime import date, datetime, time
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.enums import EstadoAnimal, EstadoIncidencia, EstadoPedido, EstadoReproductivo, NivelSeveridad, PrioridadTarea, RolEmpleado, SexoAnimal, TipoIncidencia, TipoMaquinaria, TipoTurno

ShortText = Annotated[str, Field(max_length=255)]
LongText = Annotated[str, Field(max_length=10000)]
Positive = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class WriteModel(BaseModel):
    # Ignore response-only fields from legacy forms; never pass them to ORM.
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)


class AnimalWrite(WriteModel):
    crotal_oficial: Annotated[str, Field(min_length=1, max_length=40)] | None = None
    nombre: ShortText | None = None
    raza: ShortText | None = None
    sexo: SexoAnimal | None = None
    estado: EstadoAnimal | None = None
    estado_reproductivo: EstadoReproductivo | None = None
    fecha_nacimiento: date | None = None
    fecha_entrada: date | None = None
    fecha_baja: date | None = None
    motivo_baja: LongText | None = None
    motivo_movimiento: LongText | None = None
    notas: LongText | None = None
    zona_id: ShortText | None = None
    madre_id: ShortText | None = None
    padre_id: ShortText | None = None
    padre_crotal: ShortText | None = None
    padre_nombre: ShortText | None = None


class AnimalCreate(AnimalWrite):
    crotal_oficial: Annotated[str, Field(min_length=1, max_length=40)]


class EmployeeWrite(WriteModel):
    nombre: ShortText | None = None
    apellidos: ShortText | None = None
    rol: RolEmpleado | None = None
    role: RolEmpleado | None = None
    usuario_id: ShortText | None = None
    cualificaciones: Annotated[list[str], Field(max_length=100)] | None = None
    telefono: ShortText | None = None
    email: ShortText | None = None
    activo: bool | None = None
    idioma_preferente: Literal["es", "gl", "en", "fr", "ar"] | None = None


class EmployeeCreate(EmployeeWrite):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]


class ZoneWrite(WriteModel):
    nombre: ShortText | None = None
    codigo: ShortText | None = None
    descripcion: LongText | None = None
    orden: int | None = None
    activa: bool | None = None
    tiene_pantalla_tv: bool | None = None
    tiene_tablet: bool | None = None
    zona_padre_id: ShortText | None = None


class ZoneCreate(ZoneWrite):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]
    codigo: Annotated[str, Field(min_length=1, max_length=40)]


class IncidentWrite(WriteModel):
    tipo: TipoIncidencia | None = None
    titulo: ShortText | None = None
    subtipo: ShortText | None = None
    descripcion: LongText | None = None
    prioridad: NivelSeveridad | None = None
    severidad: NivelSeveridad | None = None
    estado: EstadoIncidencia | None = None
    animal_id: ShortText | None = None
    zona_id: ShortText | None = None
    maquinaria_id: ShortText | None = None
    reportado_por: ShortText | None = None
    asignado_a: ShortText | None = None
    fecha_resolucion: datetime | None = None
    resolucion: LongText | None = None
    acciones: list[dict[str, Any]] | None = None


class MachineryWrite(WriteModel):
    nombre: ShortText | None = None
    tipo: TipoMaquinaria | None = None
    zona_id: ShortText | None = None
    marca: ShortText | None = None
    modelo: ShortText | None = None
    numero_serie: ShortText | None = None
    estado: Literal["operativa", "revision_programada", "averiada", "mantenimiento", "fuera_servicio"] | None = None
    activa: bool | None = None
    notas: LongText | None = None
    observaciones: LongText | None = None


class MachineryCreate(MachineryWrite):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]


class CatalogWrite(WriteModel):
    codigo: ShortText | None = None
    nombre: ShortText | None = None
    descripcion: LongText | None = None
    rol_requerido: ShortText | None = None
    cualificacion_requerida: ShortText | None = None
    duracion_estimada: Annotated[int, Field(ge=1, le=1440)] | None = None
    activa: bool | None = None


class CatalogCreate(CatalogWrite):
    nombre: Annotated[str, Field(min_length=1, max_length=120)]


class TaskWrite(WriteModel):
    tarea_catalogo_id: ShortText | None = None
    tarea_catalogo: dict[str, Any] | None = None
    nombre: ShortText | None = None
    descripcion: LongText | None = None
    zona_id: ShortText | None = None
    empleado_id: ShortText | None = None
    ejecutado_por: ShortText | None = None
    estado: Literal["pendiente", "en_curso", "completada", "vencida", "cancelada", "programada", "retrasada", "ejecutada"] | None = None
    prioridad: PrioridadTarea | None = None
    es_urgente: bool | None = None
    fecha_programada: datetime | None = None
    fecha_ejecucion: datetime | None = None
    notas: LongText | None = None
    observaciones: LongText | None = None


class ShiftCreate(WriteModel):
    fecha: date
    tipo_turno: TipoTurno
    hora_inicio: time
    hora_fin: time
    notas: LongText | None = None


class AssignmentCreate(WriteModel):
    turno_id: ShortText
    empleado_id: ShortText
    zona_id: ShortText | None = None
    rol: ShortText | None = None


class HandoverCreate(WriteModel):
    turno_saliente_id: ShortText
    turno_entrante_id: ShortText
    notas_saliente: LongText | None = None
    tareas_pendientes: list[dict[str, Any]] | None = None
    incidencias_abiertas: list[dict[str, Any]] | None = None
    alertas_pendientes: list[dict[str, Any]] | None = None
    confirmado_por: ShortText | None = None
    ts_generacion: datetime | None = None
    ts_confirmacion: datetime | None = None


class OrderWrite(WriteModel):
    insumo: ShortText | None = None
    descripcion: LongText | None = None
    cantidad: Positive | None = None
    unidad: ShortText | None = None
    estado: EstadoPedido | None = None
    solicitante_id: ShortText | None = None
    proveedor: ShortText | None = None
    coste_estimado: Positive | None = None
    coste_real: Positive | None = None
    notas: LongText | None = None
    ts_solicitud: datetime | None = None
    ts_aprobacion: datetime | None = None
    ts_recepcion: datetime | None = None


class OrderCreate(OrderWrite):
    insumo: Annotated[str, Field(min_length=1, max_length=255)]
    cantidad: Positive
    unidad: Annotated[str, Field(min_length=1, max_length=40)]


class OrderStatusWrite(WriteModel):
    estado: EstadoPedido


class LactationWrite(WriteModel):
    animal_id: ShortText | None = None
    numero: Annotated[int, Field(ge=1, le=30)] | None = None
    numero_lactacion: Annotated[int, Field(ge=1, le=30)] | None = None
    fecha_inicio: date | None = None
    fecha_parto: date | None = None
    fecha_fin: date | None = None
    fecha_secado: date | None = None
    produccion_total: Positive | None = None
    produccion_promedio: Positive | None = None
    activa: bool | None = None
    notas: LongText | None = None


class LactationCreate(LactationWrite):
    animal_id: ShortText


class TreatmentWrite(WriteModel):
    animal_id: ShortText | None = None
    medicamento: ShortText | None = None
    farmaco: ShortText | None = None
    dosis: ShortText | None = None
    via_administracion: ShortText | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    activo: bool | None = None
    veterinario: ShortText | None = None
    observaciones: LongText | None = None
    motivo: LongText | None = None


class TreatmentCreate(TreatmentWrite):
    animal_id: ShortText


class TankCreate(WriteModel):
    fecha: date | None = None
    lote: ShortText | None = None
    volumen_l: Positive
    grasa_pct: Annotated[float, Field(ge=0, le=100)] | None = None
    proteina_pct: Annotated[float, Field(ge=0, le=100)] | None = None
    lactosa_pct: Annotated[float, Field(ge=0, le=100)] | None = None
    rcs_x1000: Positive | None = None
    bacteriologia_ufc_ml: Positive | None = None
    urea_mg_dl: Positive | None = None
    temperatura_c: float | None = None
    punto_criscopico: float | None = None
    inhibidores: bool | None = None
    laboratorio: ShortText | None = None
    observaciones: LongText | None = None
