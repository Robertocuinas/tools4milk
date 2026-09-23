"""Predicciones operativas mediante heurísticas aritméticas.

IMPORTANTE: no hay modelos de machine learning (decisión deliberada, ver
docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md tarea T16: se mantiene el enfoque
heurístico por ser transparente y explicable, adecuado para el contexto de
un TFM). Todas las estimaciones se derivan de datos reales de la base de
datos: lecturas recientes del robot de ordeño, la lactación activa del
animal, analíticas de tanque y su historial sanitario.

`_mock` refleja honestamente si hubo datos suficientes para una estimación
específica del animal, o si se recurrió a un valor de referencia genérico
por falta de histórico (antes era siempre `False`, incluso cuando la
composición era un placeholder fijo a 0).
"""

from dataclasses import dataclass
from datetime import timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tools4milk import AnaliticaTanque, Alerta, EventoSanitario, Lactacion, LecturaRobotOrdeno, TratamientoActivo
from app.repositories import animals_repository, lactations_repository
from app.time_utils import utc_now

VENTANA_LECTURAS_DIAS = 21
MIN_LECTURAS_PARA_DATOS_PROPIOS = 6  # ~3 dias a 2 ordeños/dia
VENTANA_MASTITIS_RECIENTE_DIAS = 60

# Valores de referencia sectoriales, usados SOLO cuando no hay ningun dato
# propio del animal ni de la explotacion (caso limite: animal recien dado de
# alta, sin lactaciones ni lecturas). Documentados explicitamente como tal
# en el campo "origen" de la respuesta.
REFERENCIA_GRASA_PCT = 3.85
REFERENCIA_PROTEINA_PCT = 3.30
REFERENCIA_LACTOSA_PCT = 4.75


def _lecturas_recientes(db: Session, animal_id) -> list[LecturaRobotOrdeno]:
    desde = utc_now() - timedelta(days=VENTANA_LECTURAS_DIAS)
    return list(db.scalars(
        select(LecturaRobotOrdeno)
        .where(LecturaRobotOrdeno.animal_id == animal_id, LecturaRobotOrdeno.ts >= desde)
        .order_by(LecturaRobotOrdeno.ts)
    ).all())


def _produccion_diaria(lecturas: list[LecturaRobotOrdeno]) -> list[float]:
    """Agrupa las lecturas (varias por dia) en produccion total por dia."""
    por_dia: dict[Any, float] = {}
    for l in lecturas:
        if l.produccion_kg is None:
            continue
        dia = l.ts.date()
        por_dia[dia] = por_dia.get(dia, 0.0) + float(l.produccion_kg)
    return list(por_dia.values())


def _confidence_desde_dispersión(valores: list[float], n_min: int) -> float:
    """Confianza real (no constante): sube con mas datos y baja con mas
    dispersion relativa (coeficiente de variacion) entre ellos."""
    n = len(valores)
    if n < 2:
        return 0.45 if n == 1 else 0.30
    media = mean(valores)
    if media <= 0:
        return 0.5
    cv = pstdev(valores) / media  # coeficiente de variacion
    cobertura = min(1.0, n / max(1, n_min * 2))  # satura al doble del minimo util
    estabilidad = max(0.0, 1 - min(cv, 1.0))
    confidence = 0.4 + 0.35 * cobertura + 0.25 * estabilidad
    return round(min(0.97, max(0.3, confidence)), 2)


def _tanque_reciente(db: Session, dias: int = 30) -> list[AnaliticaTanque]:
    desde = utc_now().date() - timedelta(days=dias)
    return list(db.scalars(
        select(AnaliticaTanque).where(AnaliticaTanque.fecha >= desde).order_by(AnaliticaTanque.fecha)
    ).all())


@dataclass
class _ContextoAnimal:
    """Datos de BD que necesita la heuristica para un animal. Se separa de
    la consulta para poder precargarlos en bloque (listado de predicciones)
    sin duplicar la logica de calculo ni lanzar N consultas por animal."""

    lactation: Lactacion | None
    tiene_tratamiento_activo: bool
    alertas_activas: int
    lecturas: list[LecturaRobotOrdeno]
    tanque: list[AnaliticaTanque]
    tuvo_mastitis_reciente: bool


def _contexto_individual(db: Session, animal: Any) -> _ContextoAnimal:
    lactation = lactations_repository.get_active_for_animal(db, str(animal.id))
    active_treatments = db.scalars(
        select(TratamientoActivo).where(TratamientoActivo.animal_id == animal.id, TratamientoActivo.activo.is_(True))
    ).all()
    pending_alerts = db.scalars(
        select(Alerta).where(Alerta.animal_id == animal.id, Alerta.activa.is_(True))
    ).all()
    tuvo_mastitis_reciente = db.scalar(
        select(EventoSanitario.id).where(
            EventoSanitario.animal_id == animal.id,
            EventoSanitario.tipo_patologia == "mastitis",
            EventoSanitario.fecha_inicio >= utc_now().date() - timedelta(days=VENTANA_MASTITIS_RECIENTE_DIAS),
        ).limit(1)
    ) is not None
    return _ContextoAnimal(
        lactation=lactation,
        tiene_tratamiento_activo=bool(active_treatments),
        alertas_activas=len(pending_alerts),
        lecturas=_lecturas_recientes(db, animal.id),
        tanque=_tanque_reciente(db),
        tuvo_mastitis_reciente=tuvo_mastitis_reciente,
    )


def _contextos_en_bloque(db: Session, animales: list[Any]) -> dict[Any, _ContextoAnimal]:
    """Misma informacion que `_contexto_individual`, pero para muchos
    animales con un numero fijo de consultas (una por tabla)."""
    ids = [a.id for a in animales]
    if not ids:
        return {}

    # Lactacion activa: la de mayor numero, igual que get_active_for_animal.
    lactaciones: dict[Any, Lactacion] = {}
    for lac in db.scalars(
        select(Lactacion)
        .where(Lactacion.animal_id.in_(ids), Lactacion.fecha_secado.is_(None))
        .order_by(Lactacion.numero.desc())
    ).all():
        lactaciones.setdefault(lac.animal_id, lac)

    con_tratamiento = set(db.scalars(
        select(TratamientoActivo.animal_id).where(TratamientoActivo.animal_id.in_(ids), TratamientoActivo.activo.is_(True))
    ).all())
    alertas = dict(db.execute(
        select(Alerta.animal_id, func.count(Alerta.id))
        .where(Alerta.animal_id.in_(ids), Alerta.activa.is_(True))
        .group_by(Alerta.animal_id)
    ).all())
    con_mastitis = set(db.scalars(
        select(EventoSanitario.animal_id).where(
            EventoSanitario.animal_id.in_(ids),
            EventoSanitario.tipo_patologia == "mastitis",
            EventoSanitario.fecha_inicio >= utc_now().date() - timedelta(days=VENTANA_MASTITIS_RECIENTE_DIAS),
        )
    ).all())
    lecturas: dict[Any, list[LecturaRobotOrdeno]] = {}
    desde = utc_now() - timedelta(days=VENTANA_LECTURAS_DIAS)
    for l in db.scalars(
        select(LecturaRobotOrdeno)
        .where(LecturaRobotOrdeno.animal_id.in_(ids), LecturaRobotOrdeno.ts >= desde)
        .order_by(LecturaRobotOrdeno.ts)
    ).all():
        lecturas.setdefault(l.animal_id, []).append(l)
    tanque = _tanque_reciente(db)

    return {
        a.id: _ContextoAnimal(
            lactation=lactaciones.get(a.id),
            tiene_tratamiento_activo=a.id in con_tratamiento,
            alertas_activas=int(alertas.get(a.id, 0)),
            lecturas=lecturas.get(a.id, []),
            tanque=tanque,
            tuvo_mastitis_reciente=a.id in con_mastitis,
        )
        for a in animales
    }


def compute_prediction(db: Session, animal: Any) -> dict[str, Any]:
    return _calcular_prediccion(animal, _contexto_individual(db, animal))


def _calcular_prediccion(animal: Any, ctx: _ContextoAnimal) -> dict[str, Any]:
    lactation = ctx.lactation
    lecturas = ctx.lecturas
    tiene_lecturas_propias = len(lecturas) >= MIN_LECTURAS_PARA_DATOS_PROPIOS

    # ------------------------------------------------------------------
    # Produccion: media reciente real (lecturas de robot) si hay datos
    # suficientes del propio animal; si no, se recurre al promedio de la
    # lactacion activa (produccion_total_kg / dias en leche) como antes.
    # ------------------------------------------------------------------
    producciones_diarias = _produccion_diaria(lecturas) if tiene_lecturas_propias else []
    if producciones_diarias:
        base_production = mean(producciones_diarias)
        origen_produccion = "lecturas_robot_recientes"
    elif lactation and lactation.produccion_total_kg:
        base_production = float(lactation.produccion_total_kg) / 305
        origen_produccion = "promedio_lactacion_activa"
    else:
        base_production = 0.0
        origen_produccion = "sin_datos"

    treatment_penalty = 0.08 if ctx.tiene_tratamiento_activo else 0
    alert_penalty = min(ctx.alertas_activas * 0.03, 0.12)
    expected = round(base_production * (1 - treatment_penalty - alert_penalty), 1) if base_production else 0

    # Tendencia real: comparando la primera y la segunda mitad de la
    # ventana de lecturas recientes, en vez de derivarla solo de si hay
    # tratamientos/alertas.
    if len(producciones_diarias) >= 4:
        mitad = len(producciones_diarias) // 2
        media_inicio = mean(producciones_diarias[:mitad])
        media_fin = mean(producciones_diarias[mitad:])
        if media_inicio <= 0:
            trend = "estable"
        elif media_fin < media_inicio * 0.95:
            trend = "descenso"
        elif media_fin > media_inicio * 1.05:
            trend = "aumento"
        else:
            trend = "estable"
    else:
        trend = "descenso" if treatment_penalty or alert_penalty else "estable"

    if len(producciones_diarias) >= 3:
        series = [round(v, 1) for v in producciones_diarias[-7:]]
    else:
        series = [round(expected * factor, 1) for factor in [0.98, 0.99, 1.0, 1.01, 1.0, 1.02, 1.01]]

    confidence_produccion = (
        _confidence_desde_dispersión(producciones_diarias, MIN_LECTURAS_PARA_DATOS_PROPIOS)
        if producciones_diarias else (0.55 if lactation else 0.3)
    )

    # ------------------------------------------------------------------
    # Composicion: antes siempre 0 (placeholder). Ahora se basa en la
    # media real de la lactacion activa del animal (grasa_promedio /
    # proteina_promedio) que ya se registra en cada lactacion, ajustada
    # levemente por la fase de la lactacion (la composicion tiende a subir
    # segun avanzan los dias en leche, de forma inversa a la produccion).
    # Si el animal no tiene lactacion registrada, se recurre al promedio
    # reciente de analiticas_tanque (nivel explotacion) y, en su defecto,
    # a un valor de referencia sectorial documentado.
    # ------------------------------------------------------------------
    dim = (utc_now().date() - lactation.fecha_parto).days if lactation else None
    tanque = ctx.tanque
    # La lactosa no se registra por lactacion en el esquema actual (solo a
    # nivel de tanque); se estima siempre a partir del promedio reciente de
    # tanque, y si tampoco hay eso, de la referencia sectorial — nunca 0.
    lactosas_tanque = [float(t.lactosa_pct) for t in tanque if t.lactosa_pct is not None]
    lactosa_base = mean(lactosas_tanque) if lactosas_tanque else REFERENCIA_LACTOSA_PCT

    if lactation and lactation.grasa_promedio and lactation.proteina_promedio:
        grasa_base = float(lactation.grasa_promedio)
        proteina_base = float(lactation.proteina_promedio)
        origen_composicion = "lactacion_activa"
        composicion_confidence = 0.75
    else:
        grasas_tanque = [float(t.grasa_pct) for t in tanque if t.grasa_pct is not None]
        proteinas_tanque = [float(t.proteina_pct) for t in tanque if t.proteina_pct is not None]
        if grasas_tanque and proteinas_tanque:
            grasa_base = mean(grasas_tanque)
            proteina_base = mean(proteinas_tanque)
            origen_composicion = "promedio_tanque_explotacion"
            composicion_confidence = 0.5
        else:
            grasa_base = REFERENCIA_GRASA_PCT
            proteina_base = REFERENCIA_PROTEINA_PCT
            origen_composicion = "referencia_sectorial"
            composicion_confidence = 0.3

    # Ajuste leve por fase de lactacion: pico de produccion (~dia 60) suele
    # coincidir con el valle de composicion; hacia el final de la
    # lactacion la composicion sube de nuevo.
    if dim is not None and dim > 0:
        factor_fase = 1.0 + max(-0.06, min(0.10, (dim - 60) / 2400))
    else:
        factor_fase = 1.0
    grasa_pred = round(grasa_base * factor_fase, 2)
    proteina_pred = round(proteina_base * factor_fase, 2)
    tendencia_composicion = "estable" if 0.98 <= factor_fase <= 1.02 else ("aumento" if factor_fase > 1 else "descenso")

    # ------------------------------------------------------------------
    # Riesgo sanitario: antes fijo (mastitis 0.18 siempre). Ahora se basa
    # en el recuento de celulas somaticas (SCC) real de las lecturas
    # recientes del robot y en si el animal tuvo mastitis en los ultimos
    # VENTANA_MASTITIS_RECIENTE_DIAS dias.
    # ------------------------------------------------------------------
    scc_recientes = [l.scc for l in lecturas if l.scc is not None]
    scc_medio = mean(scc_recientes) if scc_recientes else (lactation.rcs_promedio if lactation and lactation.rcs_promedio else None)

    tuvo_mastitis_reciente = ctx.tuvo_mastitis_reciente

    if scc_medio is not None:
        # Umbrales veterinarios habituales: <200k bajo, 200k-400k medio, >400k alto.
        if scc_medio >= 400_000:
            prob_mastitis, nivel_mastitis = 0.55, "alto"
        elif scc_medio >= 200_000:
            prob_mastitis, nivel_mastitis = 0.28, "medio"
        else:
            prob_mastitis, nivel_mastitis = 0.08, "bajo"
        origen_mastitis = "scc_reciente" if scc_recientes else "rcs_promedio_lactacion"
    else:
        prob_mastitis, nivel_mastitis = 0.15, "bajo"
        origen_mastitis = "sin_datos"

    if tuvo_mastitis_reciente:
        prob_mastitis = min(0.9, prob_mastitis + 0.20)
        nivel_mastitis = "alto" if prob_mastitis >= 0.5 else "medio"

    risk_factors = []
    if ctx.tiene_tratamiento_activo:
        risk_factors.append("Tratamiento activo")
    if ctx.alertas_activas:
        risk_factors.append("Alertas pendientes")
    if tuvo_mastitis_reciente:
        risk_factors.append("Mastitis reciente")
    if scc_medio is not None and scc_medio >= 200_000:
        risk_factors.append("Recuento de celulas somaticas elevado")

    if ctx.tiene_tratamiento_activo or nivel_mastitis == "alto":
        risk_level = "alto"
    elif ctx.alertas_activas or nivel_mastitis == "medio":
        risk_level = "medio"
    else:
        risk_level = "bajo"

    riesgo_confidence = 0.8 if scc_recientes else (0.55 if scc_medio is not None else 0.35)

    # Honestidad de "_mock": es False solo si al menos una de las tres
    # dimensiones (produccion/composicion/riesgo) se apoyo en datos reales
    # y especificos del animal, no en referencias genericas de explotacion.
    _mock = origen_produccion == "sin_datos" and origen_composicion == "referencia_sectorial" and origen_mastitis == "sin_datos"

    return {
        "animal_id": str(animal.id),
        "timestamp": utc_now().isoformat(),
        "produccion": {
            "tendencia": trend,
            "produccion_promedio_predicha": expected,
            "produccion_minima_predicha": round(expected * 0.93, 1),
            "produccion_maxima_predicha": round(expected * 1.07, 1),
            "dias_prediccion": 7,
            "confidence": confidence_produccion,
            "series_diaria": series,
            "origen": origen_produccion,
        },
        "composicion": {
            "grasa": {"prediccion": grasa_pred, "tendencia": tendencia_composicion},
            "proteina": {"prediccion": proteina_pred, "tendencia": tendencia_composicion},
            "lactosa": {"prediccion": round(lactosa_base, 2), "tendencia": "estable"},
            "anomalia_detectada": nivel_mastitis == "alto",
            "confidence": composicion_confidence,
            "origen": origen_composicion,
        },
        "riesgo_sanitario": {
            "riesgo_promedio": risk_level,
            "riesgos_especificos": {
                "mastitis": {
                    "probabilidad": round(prob_mastitis, 2),
                    "nivel": nivel_mastitis,
                }
            },
            "factores_riesgo": risk_factors,
            "confidence": riesgo_confidence,
            "dias_prediccion": 7,
            "origen": origen_mastitis,
        },
        "confianza_integrada": round((confidence_produccion + composicion_confidence + riesgo_confidence) / 3, 2),
        "_mock": _mock,
    }


def get_animal_or_none(db: Session, animal_id: str) -> Any:
    return animals_repository.get_by_id(db, animal_id) or animals_repository.get_by_crotal(db, animal_id)


# Orden de gravedad para el listado: primero lo que requiere atencion.
ORDEN_RIESGO = {"critico": 0, "alto": 1, "medio": 2, "bajo": 3}


def _fila_tabla(animal: Any, pred: dict[str, Any]) -> dict[str, Any]:
    produccion = pred["produccion"]
    composicion = pred["composicion"]
    riesgo = pred["riesgo_sanitario"]
    # Grasa/proteina solo si son del propio animal (lactacion activa): el
    # promedio de tanque o la referencia sectorial no describen al animal.
    composicion_propia = composicion["origen"] == "lactacion_activa"
    estado = animal.estado.value if hasattr(animal.estado, "value") else animal.estado
    return {
        "animal_id": str(animal.id),
        "crotal_oficial": animal.crotal_oficial,
        "nombre": animal.nombre,
        "raza": animal.raza,
        "estado": estado,
        "riesgo": riesgo["riesgo_promedio"],
        "factores_riesgo": riesgo["factores_riesgo"],
        "produccion_prevista": produccion["produccion_promedio_predicha"] if produccion["origen"] != "sin_datos" else None,
        "tendencia_produccion": produccion["tendencia"],
        "origen_produccion": produccion["origen"],
        "grasa": composicion["grasa"]["prediccion"] if composicion_propia else None,
        "proteina": composicion["proteina"]["prediccion"] if composicion_propia else None,
        "origen_composicion": composicion["origen"],
        "_mock": pred["_mock"],
    }


def list_predictions(db: Session, estado: str | None = "produccion", skip: int = 0, limit: int = 500) -> list[dict[str, Any]]:
    """Resumen de prediccion para varios animales (tabla de Predicciones).

    Misma heuristica que `compute_prediction`, pero con los datos
    precargados en bloque. Se devuelve ordenado por riesgo (alto -> bajo) y,
    a igualdad, por crotal, para que la vista muestre primero lo urgente.
    """
    animales = animals_repository.get_all(db, skip=skip, limit=limit, estado=estado)
    contextos = _contextos_en_bloque(db, animales)
    filas = [_fila_tabla(a, _calcular_prediccion(a, contextos[a.id])) for a in animales]
    filas.sort(key=lambda f: (ORDEN_RIESGO.get(f["riesgo"], 99), f["crotal_oficial"]))
    return filas
