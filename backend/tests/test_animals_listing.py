from datetime import date
import uuid

from app.models.tools4milk import Animal, Lactacion, TratamientoActivo


def test_animals_list_search_sort_active_metrics_and_pagination(client, db, auth_headers):
    animal_a = Animal(
        id=uuid.uuid4(), crotal_oficial="LIST-A", nombre="Alondra", sexo="hembra",
        fecha_nacimiento=date(2021, 1, 1), estado="produccion", fecha_entrada=date(2021, 1, 1),
    )
    animal_b = Animal(
        id=uuid.uuid4(), crotal_oficial="LIST-B", nombre="Brisa", sexo="hembra",
        fecha_nacimiento=date(2020, 1, 1), estado="recria", fecha_entrada=date(2020, 1, 1),
    )
    animal_c = Animal(
        id=uuid.uuid4(), crotal_oficial="LIST-C", nombre="Castaña", sexo="hembra",
        fecha_nacimiento=date(2019, 1, 1), estado="produccion", fecha_entrada=date(2019, 1, 1),
    )
    db.add_all([animal_a, animal_b, animal_c])
    db.flush()
    db.add_all([
        # Latest active lactation is used; the much larger historical yield is ignored.
        Lactacion(id=uuid.uuid4(), animal_id=animal_a.id, numero=1, fecha_parto=date(2023, 1, 1), fecha_secado=date(2023, 11, 1), produccion_total_kg=30500),
        Lactacion(id=uuid.uuid4(), animal_id=animal_a.id, numero=2, fecha_parto=date(2024, 1, 1), fecha_secado=None, produccion_total_kg=3050),
        Lactacion(id=uuid.uuid4(), animal_id=animal_b.id, numero=1, fecha_parto=date(2024, 1, 1), fecha_secado=None, produccion_total_kg=6100),
        TratamientoActivo(id=uuid.uuid4(), animal_id=animal_a.id, farmaco="A", dias_tratamiento=3, fecha_inicio=date(2025, 1, 1), fecha_fin_prevista=date(2025, 1, 4), activo=True, checkboxes=[]),
        TratamientoActivo(id=uuid.uuid4(), animal_id=animal_a.id, farmaco="B", dias_tratamiento=3, fecha_inicio=date(2025, 1, 1), fecha_fin_prevista=date(2025, 1, 4), activo=True, checkboxes=[]),
        # Historical treatment row must not count.
        TratamientoActivo(id=uuid.uuid4(), animal_id=animal_a.id, farmaco="C", dias_tratamiento=3, fecha_inicio=date(2024, 1, 1), fecha_fin_prevista=date(2024, 1, 4), activo=False, checkboxes=[]),
    ])
    db.flush()

    response = client.get("/api/v1/animals?search=LIST-&limit=3", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert [row["crotal_oficial"] for row in rows[:3]] == ["LIST-B", "LIST-A", "LIST-C"]
    row_a = next(row for row in rows if row["id"] == str(animal_a.id))
    assert row_a["produccion_promedio"] == 10
    assert row_a["tratamientos_activos"] == 2
    assert "tratamientos_activos" in rows[0]

    by_name = client.get("/api/v1/animals?search=Alond", headers=auth_headers).json()
    assert [row["id"] for row in by_name] == [str(animal_a.id)]
    by_code = client.get("/api/v1/animals?search=LIST-C", headers=auth_headers).json()
    assert [row["id"] for row in by_code] == [str(animal_c.id)]

    sorted_by_name = client.get("/api/v1/animals?search=LIST-&sort=name&direction=asc", headers=auth_headers).json()
    assert [row["crotal_oficial"] for row in sorted_by_name] == ["LIST-A", "LIST-B", "LIST-C"]
    state_and_page = client.get("/api/v1/animals?estado=produccion&sort=code&skip=1&limit=1", headers=auth_headers).json()
    assert len(state_and_page) == 1
    assert state_and_page[0]["estado"] == "produccion"
    assert state_and_page[0]["crotal_oficial"] == "LIST-C"


def test_animals_list_rejects_unsupported_sort(client, auth_headers):
    response = client.get("/api/v1/animals?sort=unknown", headers=auth_headers)
    assert response.status_code == 422
