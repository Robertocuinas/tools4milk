from datetime import date


def test_farm_settings_persist_and_are_readable_by_authenticated_users(client, auth_headers, role_headers):
    updated = client.put(
        "/api/v1/farm-settings",
        headers=auth_headers,
        json={"turno_noche_habilitado": False},
    )
    assert updated.status_code == 200
    assert updated.json() == {"turno_noche_habilitado": False}

    operator_headers = role_headers("settings-reader", "operario")
    reread = client.get("/api/v1/farm-settings", headers=operator_headers)
    assert reread.status_code == 200
    assert reread.json() == {"turno_noche_habilitado": False}


def test_only_settings_managers_can_change_farm_settings(client, role_headers):
    operator_headers = role_headers("settings-writer", "operario")
    response = client.put(
        "/api/v1/farm-settings",
        headers=operator_headers,
        json={"turno_noche_habilitado": False},
    )
    assert response.status_code == 403


def test_disabling_night_shift_preserves_existing_history_and_rejects_new_night_turns(client, auth_headers):
    enabled = client.put(
        "/api/v1/farm-settings",
        headers=auth_headers,
        json={"turno_noche_habilitado": True},
    )
    assert enabled.status_code == 200

    night_turn = {
        "fecha": date(2026, 10, 4).isoformat(),
        "tipo_turno": "noche",
        "hora_inicio": "22:00",
        "hora_fin": "06:00",
    }
    created = client.post("/api/v1/turnos", headers=auth_headers, json=night_turn)
    assert created.status_code == 200

    client.put(
        "/api/v1/farm-settings",
        headers=auth_headers,
        json={"turno_noche_habilitado": False},
    )
    historical = client.get(
        f"/api/v1/turnos?fecha={night_turn['fecha']}&tipo_turno=noche",
        headers=auth_headers,
    )
    assert historical.status_code == 200
    assert historical.json()["total"] == 1

    retry = client.post("/api/v1/turnos", headers=auth_headers, json=night_turn)
    assert retry.status_code == 200
    assert retry.json()["id"] == created.json()["id"]

    rejected = client.post(
        "/api/v1/turnos",
        headers=auth_headers,
        json={**night_turn, "fecha": date(2026, 10, 5).isoformat()},
    )
    assert rejected.status_code == 409
    assert "deshabilitado" in rejected.json()["detail"]
