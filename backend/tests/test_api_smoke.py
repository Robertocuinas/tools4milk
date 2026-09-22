def test_static_routes_do_not_collide_with_id_routes(client, auth_headers):
    animals_count = client.get("/api/v1/animals/active-count", headers=auth_headers)
    assert animals_count.status_code == 200
    assert isinstance(animals_count.json(), int)
    assert animals_count.json() >= 0

    quality_summary = client.get("/api/v1/lactations/quality/summary", headers=auth_headers)
    assert quality_summary.status_code == 200
    assert quality_summary.json()["lactaciones_activas"] >= 1

    critical_alerts = client.get("/api/v1/alerts/critical", headers=auth_headers)
    assert critical_alerts.status_code == 200
    assert critical_alerts.json()["total"] == 0


def test_alerts_smoke_flow(client, auth_headers):
    payload = {
        "animal_id": "animal-smoke",
        "tipo_alerta": "produccion_baja",
        "severidad": "alta",
        "descripcion": "Produccion por debajo del umbral",
        "recomendacion": "Revisar alimentacion y estado sanitario",
        "confianza_prediccion": 80,
    }

    created = client.post("/api/v1/alerts", json=payload, headers=auth_headers)
    assert created.status_code == 201
    alert_id = created.json()["id"]

    listed = client.get("/api/v1/alerts", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    detailed = client.get(f"/api/v1/alerts/detail/{alert_id}", headers=auth_headers)
    assert detailed.status_code == 200
    assert detailed.json()["id"] == alert_id

    updated = client.patch(
        f"/api/v1/alerts/{alert_id}",
        json={"estado": "revisada", "notas_operario": "Revisada en test"},
        headers=auth_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["estado"] == "revisada"


def test_frontend_core_requires_authentication(client):
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 403


def test_role_restrictions_for_sensitive_mutations(client, operario_headers):
    response = client.post(
        "/api/v1/employees",
        json={"nombre": "Sin permiso", "role": "operario"},
        headers=operario_headers,
    )
    assert response.status_code == 403


def test_orders_require_admin_or_alimentacion_role(client, auth_headers, role_headers):
    # T15: pedidos.py solo exigia get_current_user; ahora crear/editar pedidos
    # requiere admin o alimentacion (ver frontend/src/lib/role-capabilities.ts:
    # manage_orders/create_order). operario NO tiene esa capacidad.
    operario = role_headers("marcos.vazquez", "operario")
    denied = client.post(
        "/api/v1/pedidos",
        json={"insumo": "Guantes", "cantidad": 1},
        headers=operario,
    )
    assert denied.status_code == 403

    alimentacion = role_headers("laura.fernandez", "alimentacion")
    allowed = client.post(
        "/api/v1/pedidos",
        json={"insumo": "Guantes", "cantidad": 1},
        headers=alimentacion,
    )
    assert allowed.status_code == 200

    admin_allowed = client.post(
        "/api/v1/pedidos",
        json={"insumo": "Guantes admin", "cantidad": 1},
        headers=auth_headers,
    )
    assert admin_allowed.status_code == 200


def test_shifts_require_admin_role(client, auth_headers, role_headers):
    # T15: shifts.py solo exigia get_current_user; crear turnos y asignaciones
    # es admin-only (ninguna otra capacidad en role-capabilities.ts concede
    # manage_shifts/create_shift).
    alimentacion = role_headers("laura.fernandez", "alimentacion")
    denied = client.post(
        "/api/v1/turnos",
        json={"fecha": "2026-06-01", "tipo_turno": "manana", "hora_inicio": "06:00", "hora_fin": "14:00"},
        headers=alimentacion,
    )
    assert denied.status_code == 403

    allowed = client.post(
        "/api/v1/turnos",
        json={"fecha": "2026-06-01", "tipo_turno": "manana", "hora_inicio": "06:00", "hora_fin": "14:00"},
        headers=auth_headers,
    )
    assert allowed.status_code == 200


def test_handovers_require_admin_or_operario_role(client, auth_headers, role_headers):
    # T15: handovers.py solo exigia get_current_user; crear un resumen de
    # relevo requiere admin u operario (ver create_handover en
    # role-capabilities.ts: veterinario y alimentacion solo pueden verlos).
    turnos = client.post(
        "/api/v1/turnos",
        json={"fecha": "2026-06-02", "tipo_turno": "manana", "hora_inicio": "06:00", "hora_fin": "14:00"},
        headers=auth_headers,
    ).json()
    turno_saliente = turnos["id"]
    turno_entrante = client.post(
        "/api/v1/turnos",
        json={"fecha": "2026-06-02", "tipo_turno": "tarde", "hora_inicio": "14:00", "hora_fin": "22:00"},
        headers=auth_headers,
    ).json()["id"]

    veterinario = role_headers("dr.mendez", "veterinario")
    denied = client.post(
        "/api/v1/resumenes-relevo",
        json={"turno_saliente_id": turno_saliente, "turno_entrante_id": turno_entrante},
        headers=veterinario,
    )
    assert denied.status_code == 403

    operario = role_headers("marcos.vazquez", "operario")
    allowed = client.post(
        "/api/v1/resumenes-relevo",
        json={"turno_saliente_id": turno_saliente, "turno_entrante_id": turno_entrante},
        headers=operario,
    )
    assert allowed.status_code == 200


def test_task_catalog_mutations_require_task_manager_role(client, auth_headers, role_headers):
    # T15: POST/PUT/DELETE /tareas-catalogo no comprobaban rol (hueco senalado
    # explicitamente en docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md).
    veterinario = role_headers("dr.mendez", "veterinario")
    denied = client.post(
        "/api/v1/tareas-catalogo",
        json={"nombre": "Tarea sin permiso"},
        headers=veterinario,
    )
    assert denied.status_code == 403

    created = client.post(
        "/api/v1/tareas-catalogo",
        json={"nombre": "Tarea de catalogo T15"},
        headers=auth_headers,
    )
    assert created.status_code == 201
