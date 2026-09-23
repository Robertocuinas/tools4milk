"""Extraccion determinista y explicable para dictados operativos.

No llama a modelos externos ni persiste datos. Las reglas solo devuelven una
sugerencia cuando encuentran una evidencia concreta en la transcripcion; una
coincidencia entre varios valores posibles se representa como ``None``.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from app.schemas.extraction import (
    DateSuggestion,
    IncidentExtraction,
    NumberSuggestion,
    OrderExtraction,
    OrderProductExtraction,
    TextSuggestion,
)


@dataclass(frozen=True)
class ZoneCandidate:
    id: str
    nombre: str
    codigo: str


_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "averia_maquinaria": ("averia", "averiado", "averiada", "fallo", "rota", "roto", "robot", "bomba"),
    "infraestructura": ("infraestructura", "puerta", "valla", "techo", "suelo", "tuberia", "bebedero"),
    "sanidad_animal": ("cojera", "mastitis", "enferma", "enfermo", "fiebre", "herida", "diarrea"),
    "calidad_leche": ("calidad de leche", "tanque", "celulas somaticas", "conductividad"),
    "alimentacion": ("alimentacion", "pienso", "racion", "silo", "forraje", "comedero"),
    "pedidos": ("pedido", "proveedor", "sin stock", "faltan existencias"),
}

_NUMBER_WORDS = {
    "un": 1,
    "una": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
    "once": 11,
    "doce": 12,
}
_NUMBER_PATTERN = r"\d+(?:[,.]\d+)?|" + "|".join(_NUMBER_WORDS)
_UNIT_PATTERN = r"unidades?|uds?\.?|kg|kilos?|litros?|l|sacos?|cajas?|bolsas?|palets?|pacas?|botellas?"
_PRODUCT_WITH_UNIT = re.compile(
    rf"\b(?P<quantity>{_NUMBER_PATTERN})\s+(?P<unit>{_UNIT_PATTERN})\s+de\s+"
    rf"(?P<item>.+?)(?=(?:,|;|\.|\s+y\s+(?:{_NUMBER_PATTERN})\b|$))",
    re.IGNORECASE,
)
_PRODUCT_INHERITED_UNIT = re.compile(
    rf"(?:^|,|\by\b)\s*(?P<quantity>{_NUMBER_PATTERN})\s+de\s+"
    rf"(?P<item>.+?)(?=(?:,|;|\.|\s+y\s+(?:{_NUMBER_PATTERN})\b|$))",
    re.IGNORECASE,
)
_ISO_DATE = re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b")
_DAY_MONTH_DATE = re.compile(
    r"\b(\d{1,2})\s+de\s+"
    r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)"
    r"(?:\s+de\s+(20\d{2}))?\b",
    re.IGNORECASE,
)
_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}
_WEEKDAYS = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}


def _normalise(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", value.lower()).strip()


def _empty_text() -> TextSuggestion:
    return TextSuggestion()


def _empty_number() -> NumberSuggestion:
    return NumberSuggestion()


def _contains_phrase(text: str, phrase: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text))


def _suggest_zone(text: str, zones: Iterable[ZoneCandidate]) -> TextSuggestion:
    matches: list[tuple[ZoneCandidate, str]] = []
    for zone in zones:
        nombre = _normalise(zone.nombre)
        codigo = _normalise(zone.codigo)
        # Un codigo de una o dos letras da demasiados falsos positivos en
        # lenguaje natural. Los nombres completos no tienen esa limitacion.
        evidence = nombre if nombre and _contains_phrase(text, nombre) else None
        # Cuando quien dicta dice solo el elemento distintivo de un nombre
        # compuesto ("recría" en vez de "Boxes de recría"), se considera
        # candidato, no una selección preferente. Si hay otra zona con ese
        # mismo término el resultado queda deliberadamente ambiguo.
        if evidence is None:
            meaningful_tokens = [
                token for token in nombre.split()
                if len(token) >= 4 and token not in {"zona", "sala", "para", "con"}
            ]
            token = next((item for item in meaningful_tokens if _contains_phrase(text, item)), None)
            if token:
                evidence = token
        if evidence is None and len(codigo) >= 3 and _contains_phrase(text, codigo):
            evidence = codigo
        if evidence:
            matches.append((zone, evidence))

    unique_ids = {zone.id for zone, _ in matches}
    if len(unique_ids) != 1:
        return _empty_text()
    zone, evidence = matches[0]
    return TextSuggestion(value=zone.id, confidence="alta", evidence=[evidence])


def _suggest_type(text: str) -> TextSuggestion:
    matches = [(kind, keyword) for kind, keywords in _TYPE_KEYWORDS.items() for keyword in keywords if _contains_phrase(text, keyword)]
    matched_types = {kind for kind, _ in matches}
    if len(matched_types) != 1:
        return _empty_text()
    kind = next(iter(matched_types))
    return TextSuggestion(value=kind, confidence="alta", evidence=[word for value, word in matches if value == kind])


def _suggest_priority(text: str) -> TextSuggestion:
    explicit = {
        "critica": ("critica", "critico", "emergencia"),
        "alta": ("alta prioridad", "importante"),
        "media": ("media prioridad",),
        "baja": ("baja prioridad", "no urgente"),
    }
    matches = [(priority, marker) for priority, markers in explicit.items() for marker in markers if _contains_phrase(text, marker)]
    priorities = {priority for priority, _ in matches}
    if len(priorities) == 1:
        priority = next(iter(priorities))
        return TextSuggestion(value=priority, confidence="alta", evidence=[marker for value, marker in matches if value == priority])
    if len(priorities) > 1:
        return _empty_text()
    if _contains_phrase(text, "urgente") or _contains_phrase(text, "cuanto antes"):
        return TextSuggestion(value="alta", confidence="media", evidence=["urgente" if _contains_phrase(text, "urgente") else "cuanto antes"])
    return _empty_text()


def _suggest_title(original_text: str, type_suggestion: TextSuggestion) -> TextSuggestion:
    # No se inventa un resumen: se toma una frase literal, solo al haber una
    # categoria inequívoca que justifique usar el dictado como titulo.
    if type_suggestion.value is None:
        return _empty_text()
    title = re.split(r"[.;]", original_text, maxsplit=1)[0].strip()
    title = re.sub(r"^(?:hay|tenemos|se ha detectado|incidencia|problema)\s+", "", title, flags=re.IGNORECASE).strip()
    if not title:
        return _empty_text()
    title = title[:200].rstrip()
    return TextSuggestion(value=title, confidence="media", evidence=[title])


def extract_incident(text: str, zones: Iterable[ZoneCandidate]) -> IncidentExtraction:
    normalized = _normalise(text)
    tipo = _suggest_type(normalized)
    return IncidentExtraction(
        zona_id=_suggest_zone(normalized, zones),
        tipo=tipo,
        prioridad=_suggest_priority(normalized),
        titulo=_suggest_title(text, tipo),
        descripcion=text,
    )


def _quantity(value: str) -> float:
    normalized = _normalise(value)
    if normalized in _NUMBER_WORDS:
        return float(_NUMBER_WORDS[normalized])
    return float(normalized.replace(",", "."))


def _clean_product(value: str) -> str:
    value = re.sub(
        r"\s+(?:(?:para|con)\s+)?(?:y\s+)?(?:entrega|fecha)\b.*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\s+para\s+(?:hoy|manana|pasado\s+manana|el\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b.*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return value.strip(" ,:.-")


def _extract_products(text: str) -> list[OrderProductExtraction]:
    products: list[OrderProductExtraction] = []
    covered_spans: list[tuple[int, int]] = []
    last_unit: str | None = None
    for match in _PRODUCT_WITH_UNIT.finditer(text):
        item = _clean_product(match.group("item"))
        if not item:
            continue
        quantity = _quantity(match.group("quantity"))
        unit = _normalise(match.group("unit"))
        products.append(
            OrderProductExtraction(
                insumo=TextSuggestion(value=item, confidence="alta", evidence=[match.group(0).strip()]),
                cantidad=NumberSuggestion(value=quantity, confidence="alta", evidence=[match.group("quantity")]),
                unidad=TextSuggestion(value=unit, confidence="alta", evidence=[match.group("unit")]),
            )
        )
        covered_spans.append(match.span())
        last_unit = unit

    if last_unit:
        for match in _PRODUCT_INHERITED_UNIT.finditer(text):
            if any(start <= match.start() < end for start, end in covered_spans):
                continue
            item = _clean_product(match.group("item"))
            if not item:
                continue
            products.append(
                OrderProductExtraction(
                    insumo=TextSuggestion(value=item, confidence="media", evidence=[match.group(0).strip()]),
                    cantidad=NumberSuggestion(value=_quantity(match.group("quantity")), confidence="alta", evidence=[match.group("quantity")]),
                    unidad=TextSuggestion(value=last_unit, confidence="media", evidence=["unidad heredada del producto anterior"]),
                )
            )
    return products


def _suggest_named_party(text: str, patterns: tuple[str, ...]) -> TextSuggestion:
    matches: list[str] = []
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = match.group("party").strip(" .,:;")
            if value:
                matches.append(value)
    normalized_values = {_normalise(value) for value in matches}
    if len(normalized_values) != 1:
        return _empty_text()
    return TextSuggestion(value=matches[0], confidence="media", evidence=[matches[0]])


def _suggest_date(text: str, reference_date: date) -> DateSuggestion:
    candidates: list[tuple[date, str]] = []
    for year, month, day in _ISO_DATE.findall(text):
        try:
            candidates.append((date(int(year), int(month), int(day)), f"{year}-{month}-{day}"))
        except ValueError:
            pass
    for day, month_name, year in _DAY_MONTH_DATE.findall(text):
        try:
            candidates.append((date(int(year) if year else reference_date.year, _MONTHS[_normalise(month_name)], int(day)), f"{day} de {month_name}"))
        except ValueError:
            pass
    if _contains_phrase(text, "pasado manana"):
        candidates.append((reference_date + timedelta(days=2), "pasado mañana"))
    elif _contains_phrase(text, "manana"):
        candidates.append((reference_date + timedelta(days=1), "mañana"))
    elif _contains_phrase(text, "hoy"):
        candidates.append((reference_date, "hoy"))
    for weekday, weekday_number in _WEEKDAYS.items():
        if _contains_phrase(text, weekday):
            days = (weekday_number - reference_date.weekday()) % 7
            candidates.append((reference_date + timedelta(days=days or 7), weekday))

    dates = {value for value, _ in candidates}
    if len(dates) != 1:
        return DateSuggestion()
    value = next(iter(dates))
    return DateSuggestion(value=value, confidence="media", evidence=[evidence for candidate, evidence in candidates if candidate == value])


def extract_order(text: str, reference_date: date | None = None) -> OrderExtraction:
    """Extrae datos de un pedido sin asumir que una fecha sea recepcion real."""
    normalized = _normalise(text)
    return OrderExtraction(
        proveedor=_suggest_named_party(normalized, (r"\b(?:proveedor|a proveedor)\s+(?P<party>[^,;.:]+)",)),
        productos=_extract_products(normalized),
        cliente=_suggest_named_party(normalized, (r"\bpedido\s+para\s+(?P<party>[^,;:]+)",)),
        fecha_mencionada=_suggest_date(normalized, reference_date or date.today()),
        observaciones=TextSuggestion(value=text, confidence="alta", evidence=["transcripción íntegra"]),
    )
