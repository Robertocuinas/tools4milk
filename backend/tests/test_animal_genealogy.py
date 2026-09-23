"""Genealogia de la ficha de animal (migracion 0016 + GET /animals/{id}/genealogy).

Cubre: padre registrado vs. toro externo (IA), abuelos materno/paterno,
estado vacio sin datos inventados, validaciones de create/update y que el
contrato existente de GET /animals/{id} solo gana campos.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.models.tools4milk import Animal


def _animal(db, crotal: str, sexo: str = "hembra", **extra) -> Animal:
    item = Animal(
        id=uuid.uuid4(),
        crotal_oficial=crotal,
        nombre=extra.pop("nombre", f"Animal {crotal}"),
        sexo=sexo,
        fecha_nacimiento=extra.pop("fecha_nacimiento", date(2018, 3, 1)),
        raza="frisona",
        estado="produccion" if sexo == "hembra" else "recria",
        fecha_entrada=date(2019, 1, 1),
        **extra,
    )
    db.add(item)
    db.flush()
    return item


def test_genealogy_empty_when_no_data(client, db, auth_headers):
    cria = _animal(db, "GEN-EMPTY-01")
    db.commit()

    response = client.get(f"/api/v1/animals/{cria.id}/genealogy", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["animal_id"] == str(cria.id)
    for key in ("madre", "padre", "abuela_materna", "abuelo_materno", "abuela_paterna", "abuelo_paterno"):
        assert data[key] is None


def test_genealogy_full_tree_with_external_sires(client, db, auth_headers):
    abuela_m = _animal(db, "GEN-ABM-01", nombre="Abuela")
    toro_semental = _animal(db, "GEN-TORO-01", sexo="macho", nombre="Semental casa")
    madre = _animal(
        db, "GEN-MAD-01", nombre="Madre",
        madre_id=abuela_m.id, padre_crotal="ES-IA-777", padre_nombre="Toro IA abuelo",
    )
    cria = _animal(db, "GEN-CRIA-01", madre_id=madre.id, padre_id=toro_semental.id)
    db.commit()

    data = client.get(f"/api/v1/animals/{cria.id}/genealogy", headers=auth_headers).json()

    assert data["madre"] == {
        "id": str(madre.id), "nombre": "Madre", "crotal": "GEN-MAD-01", "relacion": "madre",
        "registrado": True, "sexo": "hembra", "raza": "frisona", "fecha_nacimiento": "2018-03-01",
    }
    assert data["padre"]["id"] == str(toro_semental.id)
    assert data["padre"]["registrado"] is True
    assert data["padre"]["relacion"] == "padre"
    assert data["abuela_materna"]["id"] == str(abuela_m.id)
    # El padre de la madre es un toro externo: sin id, solo crotal/nombre reales.
    assert data["abuelo_materno"] == {
        "id": None, "nombre": "Toro IA abuelo", "crotal": "ES-IA-777", "relacion": "abuelo_materno",
        "registrado": False, "sexo": "macho", "raza": None, "fecha_nacimiento": None,
    }
    # El semental registrado no tiene padres conocidos: nada inventado.
    assert data["abuela_paterna"] is None
    assert data["abuelo_paterno"] is None


def test_create_and_update_animal_with_external_sire(client, db, auth_headers):
    madre = _animal(db, "GEN-MAD-02")
    db.commit()

    created = client.post(
        "/api/v1/animals",
        headers=auth_headers,
        json={
            "crotal_oficial": "GEN-NEW-02",
            "fecha_nacimiento": "2025-02-01",
            "madre_id": str(madre.id),
            "padre_crotal": "ES-IA-123",
            "padre_nombre": "Toro IA",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["madre_id"] == str(madre.id)
    assert body["padre_id"] is None
    assert body["padre_crotal"] == "ES-IA-123"
    assert body["padre_nombre"] == "Toro IA"
    # Campos previos del contrato siguen presentes.
    assert {"id", "crotal_oficial", "nombre", "sexo", "raza", "fecha_nacimiento", "fecha_entrada", "estado"} <= set(body)

    genealogy = client.get(f"/api/v1/animals/{body['id']}/genealogy", headers=auth_headers).json()
    assert genealogy["padre"]["registrado"] is False
    assert genealogy["padre"]["crotal"] == "ES-IA-123"

    # Borrar el dato del padre externo con cadena vacia.
    updated = client.put(
        f"/api/v1/animals/{body['id']}",
        headers=auth_headers,
        json={"padre_crotal": "", "padre_nombre": None},
    )
    assert updated.status_code == 200
    assert updated.json()["padre_crotal"] is None
    assert updated.json()["padre_nombre"] is None
    assert updated.json()["madre_id"] == str(madre.id)  # PUT parcial: no toca madre


def test_genealogy_validation_errors(client, db, auth_headers):
    hembra = _animal(db, "GEN-VAL-H")
    macho = _animal(db, "GEN-VAL-M", sexo="macho")
    cria = _animal(db, "GEN-VAL-C")
    db.commit()

    cases = [
        {"madre_id": str(macho.id)},          # madre debe ser hembra
        {"padre_id": str(hembra.id)},         # padre debe ser macho
        {"madre_id": str(cria.id)},           # no puede ser su propia madre
        {"padre_id": str(uuid.uuid4())},      # padre inexistente
        {"madre_id": "no-es-un-uuid"},
    ]
    for payload in cases:
        response = client.put(f"/api/v1/animals/{cria.id}", headers=auth_headers, json=payload)
        assert response.status_code == 422, payload

    db.refresh(cria)
    assert cria.madre_id is None and cria.padre_id is None


def test_genealogy_unknown_animal_404(client, auth_headers):
    response = client.get(f"/api/v1/animals/{uuid.uuid4()}/genealogy", headers=auth_headers)
    assert response.status_code == 404
