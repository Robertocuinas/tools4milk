"""Tests de la recomendacion de trabajadores (worker_matching_service).

Corren contra PostgreSQL real con las fixtures de conftest.py (transaccion
revertida al final). Cada test crea sus propios catalogos/zonas con codigos
unicos para no depender de los datos que ya existan en la base de test.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from app.models.tools4milk import AsignacionTurno, Empleado, TareaCatalogo, TareaEjecucion, Turno, Zona
from app.repositories import employees_repository
from app.services import worker_matching_service as matching


def _suffix() -> str:
    return uuid.uuid4().hex[:8]


def _catalogo(db, cualificacion: str | None) -> TareaCatalogo:
    item = TareaCatalogo(
        id=uuid.uuid4(),
        codigo=f"test-match-{_suffix()}",
        nombre="Tarea test matching",
        cualificacion_requerida=cualificacion,
        duracion_estimada_min=30,
        activa=True,
    )
    db.add(item)
    db.flush()
    return item


def _zona(db) -> Zona:
    suffix = _suffix()
    item = Zona(id=uuid.uuid4(), nombre=f"Zona test {suffix}", codigo=f"zt-{suffix}")
    db.add(item)
    db.flush()
    return item


def _empleado(db, nombre: str, cualificaciones: list[str], *, activo: bool = True, rol: str = "auxiliar", zona=None) -> Empleado:
    item = Empleado(
        id=uuid.uuid4(),
        nombre=nombre,
        apellidos="Test",
        rol=rol,
        cualificaciones=cualificaciones,
        activo=activo,
        fecha_alta=date(2024, 1, 1),
        zona_principal_id=zona.id if zona else None,
    )
    db.add(item)
    db.flush()
    return item


def _completadas(db, catalogo: TareaCatalogo, empleado: Empleado, n: int) -> None:
    base = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
    for i in range(n):
        db.add(
            TareaEjecucion(
                id=uuid.uuid4(),
                catalogo_id=catalogo.id,
                empleado_id=empleado.id,
                estado="completada",
                ts_planificada=base + timedelta(days=i),
                creado_en=base,
            )
        )
    db.flush()


def _ids(result) -> list[str]:
    return [c["empleado_id"] for c in result["candidates"]]


def test_normalizacion_y_coincidencia_de_tokens():
    assert matching.tokenize("Ordeño, VMS/TMR") == ["ordeno", "vms", "tmr"]
    assert matching.tokens_match("veterinaria", "veterinario")
    assert matching.tokens_match("mecanica", "mecanico")
    assert not matching.tokens_match("vms", "tmr")
    assert not matching.tokens_match("recria", "ordeno")


def test_cualificacion_coincidente_queda_primera(db):
    token = f"quesería{_suffix()}"
    catalogo = _catalogo(db, token.upper())  # distinta capitalizacion y tildes
    sin = _empleado(db, "Aaron", ["otra"])
    con = _empleado(db, "Zoe", [token.replace("í", "i")])

    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id))
    first = result["candidates"][0]
    assert first["empleado_id"] == str(con.id)
    assert first["is_recommended"] is True
    reason = first["reasons"][0]
    assert reason["code"] == "qualification"
    assert reason["value"] == token.replace("í", "i")
    assert reason["points"] == 50.0
    ids = _ids(result)
    assert ids.index(str(con.id)) < ids.index(str(sin.id))
    otro = next(c for c in result["candidates"] if c["empleado_id"] == str(sin.id))
    assert otro["is_recommended"] is False
    assert any(r["code"] == "missing_qualification" for r in otro["reasons"])


def test_cualificacion_por_rol(db):
    token = f"veterinaria {_suffix()}"
    catalogo = _catalogo(db, token.split()[0])
    vet = _empleado(db, "Vera", [], rol="veterinario")
    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id))
    candidato = next(c for c in result["candidates"] if c["empleado_id"] == str(vet.id))
    assert any(r["code"] == "role" for r in candidato["reasons"])
    assert candidato["score"] >= 50


def test_experiencia_desempata(db):
    token = f"tok{_suffix()}"
    catalogo = _catalogo(db, token)
    novato = _empleado(db, "Aaron", [token])
    veterano = _empleado(db, "Zoe", [token])
    _completadas(db, catalogo, veterano, 3)

    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id))
    assert _ids(result)[:2] == [str(veterano.id), str(novato.id)]
    exp = next(r for r in result["candidates"][0]["reasons"] if r["code"] == "experience")
    assert exp["count"] == 3


def test_tareas_distintas_recomiendan_distinto(db):
    tok_a, tok_b = f"a{_suffix()}", f"b{_suffix()}"
    cat_a = _catalogo(db, tok_a)
    cat_b = _catalogo(db, tok_b)
    emp_a = _empleado(db, "Ana", [tok_a])
    emp_b = _empleado(db, "Bea", [tok_b])

    rec_a = matching.recommend_employees(db, catalogo_id=str(cat_a.id))
    rec_b = matching.recommend_employees(db, catalogo_id=str(cat_b.id))
    assert rec_a["candidates"][0]["empleado_id"] == str(emp_a.id)
    assert rec_b["candidates"][0]["empleado_id"] == str(emp_b.id)


def test_inactivos_excluidos(db):
    token = f"tok{_suffix()}"
    catalogo = _catalogo(db, token)
    inactivo = _empleado(db, "Ines", [token], activo=False)
    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id))
    assert str(inactivo.id) not in _ids(result)


def test_determinismo_y_desempate_por_nombre(db):
    catalogo = _catalogo(db, None)
    zona = _zona(db)
    b = _empleado(db, "Beatriz", [], zona=zona)
    a = _empleado(db, "Alba", [], zona=zona)

    first = matching.recommend_employees(db, catalogo_id=str(catalogo.id), zona_id=str(zona.id))
    second = matching.recommend_employees(db, catalogo_id=str(catalogo.id), zona_id=str(zona.id))
    assert first == second
    # Misma puntuacion (solo zona): se ordena por nombre.
    assert _ids(first)[:2] == [str(a.id), str(b.id)]
    assert first["candidates"][0]["is_recommended"] is True


def test_turno_y_carga_de_trabajo(db):
    token = f"tok{_suffix()}"
    catalogo = _catalogo(db, token)
    en_turno = _empleado(db, "Zoe", [token])
    fuera = _empleado(db, "Aaron", [token])
    # Turno de noche que cruza medianoche: 22:00 del dia 1 a 06:00 del dia 2.
    turno = Turno(id=uuid.uuid4(), fecha=date(2030, 3, 1), tipo_turno="noche", hora_inicio=time(22), hora_fin=time(6))
    db.add(turno)
    db.flush()
    db.add(AsignacionTurno(id=uuid.uuid4(), turno_id=turno.id, empleado_id=en_turno.id))
    db.flush()

    assert en_turno.id in employees_repository.get_on_shift(db, datetime(2030, 3, 2, 3, 0))
    assert en_turno.id not in employees_repository.get_on_shift(db, datetime(2030, 3, 2, 7, 0))

    # 03:00 hora local del dia 2 (sin zona horaria = hora de la explotacion).
    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id), ts_planificada="2030-03-02T03:00:00")
    assert _ids(result)[:2] == [str(en_turno.id), str(fuera.id)]

    # Carga de trabajo abierta ese dia penaliza (sin bloquear).
    for h in (1, 2):
        db.add(
            TareaEjecucion(
                id=uuid.uuid4(),
                catalogo_id=catalogo.id,
                empleado_id=en_turno.id,
                estado="pendiente",
                ts_planificada=datetime(2030, 3, 2, h, 30, tzinfo=matching.FARM_TZ),
                creado_en=datetime(2030, 1, 1, tzinfo=timezone.utc),
            )
        )
    db.flush()
    result = matching.recommend_employees(db, catalogo_id=str(catalogo.id), ts_planificada="2030-03-02T03:00:00")
    cand = next(c for c in result["candidates"] if c["empleado_id"] == str(en_turno.id))
    assert any(r["code"] == "workload" and r["count"] == 2 for r in cand["reasons"])
    assert any(r["code"] == "on_shift" and r["value"] == "noche" for r in cand["reasons"])


def test_endpoint_http(client, auth_headers, db):
    token = f"tok{_suffix()}"
    catalogo = _catalogo(db, token)
    emp = _empleado(db, "Zoe", [token])
    db.commit()

    response = client.get(
        "/api/v1/tasks/recommended-employees",
        headers=auth_headers,
        params={"catalogo_id": str(catalogo.id)},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["cualificacion_requerida"] == token
    assert body["candidates"][0]["empleado_id"] == str(emp.id)
    assert body["candidates"][0]["is_recommended"] is True

    # Por id de ejecucion: toma el catalogo de la propia tarea.
    task = TareaEjecucion(
        id=uuid.uuid4(),
        catalogo_id=catalogo.id,
        estado="pendiente",
        ts_planificada=datetime(2030, 5, 1, 8, tzinfo=timezone.utc),
        creado_en=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )
    db.add(task)
    db.commit()
    response = client.get(
        "/api/v1/tasks/recommended-employees", headers=auth_headers, params={"task_id": str(task.id)}
    )
    assert response.status_code == 200
    assert response.json()["catalogo_id"] == str(catalogo.id)

    # Sin parametros no falla: devuelve la lista completa sin recomendacion forzada.
    response = client.get("/api/v1/tasks/recommended-employees", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json()["candidates"], list)
