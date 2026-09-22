"""
Enumeraciones para tipos específicos de PostgreSQL.
"""

from enum import Enum


class EstadoTarea(str, Enum):
    """Estados de tareas (tareas_ejecuciones.estado)."""
    PENDIENTE = "pendiente"
    EN_CURSO = "en_curso"
    COMPLETADA = "completada"
    VENCIDA = "vencida"
    CANCELADA = "cancelada"


class PrioridadTarea(str, Enum):
    """Prioridad de tareas (tareas_ejecuciones.prioridad).

    Independiente del estado: antes "urgente" se derivaba de estado==VENCIDA,
    lo que hacia imposible marcar una tarea como urgente sin que ya estuviera
    retrasada. Ver docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md, tarea T9.
    """
    BAJA = "baja"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"


class EstadoAnimal(str, Enum):
    """Estados de animales (animales.estado)."""
    PRODUCCION = "produccion"
    SECA = "seca"
    RECRIA = "recria"
    GESTANTE = "gestante"
    BAJA = "baja"


class EstadoPedido(str, Enum):
    """Estados de pedidos (pedidos.estado)."""
    SOLICITADO = "solicitado"
    APROBADO = "aprobado"
    EN_TRANSITO = "en_transito"
    RECIBIDO = "recibido"
    CANCELADO = "cancelado"


class EstadoIncidencia(str, Enum):
    """Estados de incidencias (incidencias.estado)."""
    ABIERTA = "abierta"
    EN_GESTION = "en_gestion"
    RESUELTA = "resuelta"
    CERRADA = "cerrada"


class TipoIncidencia(str, Enum):
    """Tipos de incidencia (incidencias.tipo)."""
    AVERIA_MAQUINARIA = "averia_maquinaria"
    INFRAESTRUCTURA = "infraestructura"
    SANIDAD_ANIMAL = "sanidad_animal"
    CALIDAD_LECHE = "calidad_leche"
    ALIMENTACION = "alimentacion"
    PEDIDOS = "pedidos"


class NivelSeveridad(str, Enum):
    """Niveles de severidad de incidencias (incidencias.severidad).

    CRITICA añadida en T8: el frontend ya filtraba por prioridad=="critica"
    en varios sitios (panel TV de incidencias criticas, KPIs de dashboard),
    pero el backend nunca podia emitir ese valor. Ver docs/ESPECIFICACION_
    MEJORAS_TOOLS4MILK.md, tarea T8.
    """
    BAJA = "baja"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class NivelAlerta(str, Enum):
    """Niveles de alerta (alertas.nivel)."""
    BAJA = "baja"
    MEDIA = "media"
    ALTA = "alta"


class TipoTurno(str, Enum):
    """Tipos de turno (turnos.tipo_turno).

    NOCHE añadida en T10: explotaciones con ordeño robotizado operan 24h y
    necesitan cubrir el turno nocturno. Ver docs/ESPECIFICACION_MEJORAS_
    TOOLS4MILK.md, tarea T10.
    """
    MANANA = "manana"
    TARDE = "tarde"
    NOCHE = "noche"
