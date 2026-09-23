from datetime import date

from sqlalchemy import func, select

from app.models.tools4milk import Incidencia, Pedido
from app.services.natural_language_extraction import ZoneCandidate, extract_incident, extract_order


ZONES = [
    ZoneCandidate(id="recria-id", nombre="Recría", codigo="REC"),
    ZoneCandidate(id="ordeno-id", nombre="Sala de ordeño", codigo="ORD"),
]


def test_extract_incident_returns_only_evidenced_editable_suggestions():
    text = "Hay una vaca con cojera en la zona de recría, parece importante y debería revisarse hoy."

    extraction = extract_incident(text, ZONES)

    assert extraction.descripcion == text
    assert extraction.zona_id.value == "recria-id"
    assert extraction.zona_id.evidence == ["recria"]
    assert extraction.tipo.value == "sanidad_animal"
    assert extraction.prioridad.value == "alta"
    assert extraction.titulo.value == "una vaca con cojera en la zona de recría, parece importante y debería revisarse hoy"
    assert extraction.zona_id.requires_review is True
    assert extraction.tipo.requires_review is True


def test_extract_incident_leaves_ambiguous_zone_and_type_empty():
    zones = [
        ZoneCandidate(id="recria-general", nombre="Recría", codigo="REC"),
        ZoneCandidate(id="recria-boxes", nombre="Boxes de recría", codigo="BOXREC"),
    ]

    extraction = extract_incident("Hay una cojera y un robot roto en recría", zones)

    assert extraction.zona_id.value is None
    assert extraction.tipo.value is None
    assert extraction.titulo.value is None


def test_extract_incident_fallback_preserves_text_without_inventing_fields():
    text = "Por favor, revisad esto cuando podáis"

    extraction = extract_incident(text, ZONES)

    assert extraction.descripcion == text
    assert extraction.zona_id.value is None
    assert extraction.tipo.value is None
    assert extraction.prioridad.value is None
    assert extraction.titulo.value is None


def test_extract_order_finds_multiple_products_and_a_relative_date():
    text = "Pedido para restaurante X: seis unidades de queso curado, cuatro de semicurado y entrega el viernes."

    extraction = extract_order(text, reference_date=date(2026, 9, 23))

    assert extraction.cliente.value == "restaurante x"
    assert [(product.insumo.value, product.cantidad.value, product.unidad.value) for product in extraction.productos] == [
        ("queso curado", 6.0, "unidades"),
        ("semicurado", 4.0, "unidades"),
    ]
    assert extraction.fecha_mencionada.value == date(2026, 9, 25)
    assert extraction.observaciones.value == text


def test_extract_order_fallback_is_empty_except_for_preserved_observations():
    text = "Necesitamos revisar el inventario pronto"

    extraction = extract_order(text, reference_date=date(2026, 9, 23))

    assert extraction.proveedor.value is None
    assert extraction.cliente.value is None
    assert extraction.productos == []
    assert extraction.fecha_mencionada.value is None
    assert extraction.observaciones.value == text


def test_extraction_endpoint_requires_authentication(client):
    response = client.post("/api/v1/extracciones", json={"contexto": "incidencia", "texto": "Cojera en recría"})

    assert response.status_code == 403
    assert response.json()["code"] == "AUTH_MISSING_CREDENTIALS"


def test_extraction_endpoint_returns_suggestions_without_creating_data(client, auth_headers, db):
    before_incidents = db.scalar(select(func.count()).select_from(Incidencia))
    before_orders = db.scalar(select(func.count()).select_from(Pedido))

    response = client.post(
        "/api/v1/extracciones",
        headers=auth_headers,
        json={"contexto": "pedido", "texto": "Pedido de dos sacos de pienso para mañana"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requires_confirmation"] is True
    assert body["pedido"]["productos"][0]["insumo"]["value"] == "pienso"
    assert body["pedido"]["productos"][0]["cantidad"]["value"] == 2.0
    assert db.scalar(select(func.count()).select_from(Incidencia)) == before_incidents
    assert db.scalar(select(func.count()).select_from(Pedido)) == before_orders
