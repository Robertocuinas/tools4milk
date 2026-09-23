"""Crear incidencia contextual desde la ficha de animal.

Verifica que POST /incidents acepta y persiste animal_id (y zona_id), que la
incidencia aparece al filtrar por el animal, que un animal inexistente se
rechaza con 422 (antes: descarte silencioso o 500 por FK) y que el
veterinario puede crear incidencias igual que declara role-capabilities.ts.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.models.tools4milk import Animal, Incidencia, Zona


def _seed_animal(db) -> Animal:
    return db.execute(select(Animal).where(Animal.crotal_oficial == "animal-001")).scalar_one()


def test_create_incident_for_animal_persists_animal_and_zone(client, db, auth_headers):
    animal = _seed_animal(db)
    zona = db.execute(select(Zona).limit(1)).scalar_one()

    response = client.post(
        "/api/v1/incidents",
        headers=auth_headers,
        json={
            "tipo": "sanidad_animal",
            "titulo": "Cojera pata trasera",
            "descripcion": "Cojera detectada en ordeño de la mañana",
            "prioridad": "alta",
            "animal_id": str(animal.id),
            "zona_id": str(zona.id),
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["animal_id"] == str(animal.id)
    assert body["zona_id"] == str(zona.id)
    assert body["titulo"] == "Cojera pata trasera"
    assert body["prioridad"] == "alta"
    assert body["estado"] == "abierta"

    persisted = db.get(Incidencia, uuid.UUID(body["id"]))
    assert persisted is not None and persisted.animal_id == animal.id

    listed = client.get(f"/api/v1/incidents?animal_id={animal.id}", headers=auth_headers).json()
    assert body["id"] in {item["id"] for item in listed}


def test_create_incident_unknown_animal_is_rejected(client, auth_headers):
    for bad in (str(uuid.uuid4()), "CROTAL-QUE-NO-EXISTE"):
        response = client.post(
            "/api/v1/incidents",
            headers=auth_headers,
            json={"tipo": "sanidad_animal", "descripcion": "x", "prioridad": "media", "animal_id": bad},
        )
        assert response.status_code == 422, bad


def test_create_incident_without_animal_still_works(client, auth_headers):
    response = client.post(
        "/api/v1/incidents",
        headers=auth_headers,
        json={"tipo": "infraestructura", "descripcion": "Puerta rota", "prioridad": "baja", "animal_id": None},
    )
    assert response.status_code == 201
    assert response.json()["animal_id"] is None


def test_veterinario_can_create_incident_for_animal(client, db, role_headers):
    animal = _seed_animal(db)
    headers = role_headers("dr.incidencias", "veterinario")

    response = client.post(
        "/api/v1/incidents",
        headers=headers,
        json={"tipo": "sanidad_animal", "descripcion": "Fiebre", "prioridad": "media", "animal_id": str(animal.id)},
    )

    assert response.status_code == 201, response.text
    assert response.json()["animal_id"] == str(animal.id)
