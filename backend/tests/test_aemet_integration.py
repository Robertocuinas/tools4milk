"""
Tests para integracion AEMET API

Cubre:
- Sincronizacion de datos
- Endpoints de meteorologia
- Correlaciones clima-produccion
- Manejo de errores
"""

import pytest
from sqlalchemy import select

from app.models.tools4milk import LecturaMeteo
from app.services.aemet_client import aemet_client
from app.time_utils import utc_now


class TestAEMETClient:
    """Tests del cliente AEMET"""

    @pytest.mark.asyncio
    async def test_sincronizar_datos_generados(self, db):
        """Test sincronizacion con datos generados (sin API)"""
        resumen = await aemet_client.sincronizar_datos(db)

        assert resumen["registros_insertados"] > 0
        assert "registros_actualizados" in resumen
        assert "timestamp" in resumen

        stmt = select(LecturaMeteo)
        registros = db.execute(stmt).scalars().all()
        assert len(registros) > 0

    @pytest.mark.asyncio
    async def test_datos_generados_tienen_estructura(self, db):
        """Test que datos generados tienen estructura correcta"""
        await aemet_client.sincronizar_datos(db)

        stmt = select(LecturaMeteo).limit(1)
        registro = db.execute(stmt).scalar_one_or_none()

        assert registro is not None
        assert registro.ts is not None
        assert registro.estacion_id == "villalba_lugo"
        assert registro.temperatura_c is not None
        assert registro.precipitacion_mm is None
        assert 0 <= registro.prob_precipitacion_pct <= 100

    @pytest.mark.asyncio
    async def test_sync_updates_existing_readings_without_duplicates(self, db):
        first = await aemet_client.sincronizar_datos(db)
        records = aemet_client._generated_records()
        records[0]["temperatura_c"] = 23
        second = aemet_client._upsert_records(db, records, mode="generated")
        assert first["registros_insertados"] == 7
        assert second["registros_insertados"] == 0
        assert second["registros_actualizados"] == 7
        row = db.scalar(select(LecturaMeteo).where(
            LecturaMeteo.ts == records[0]["ts"],
            LecturaMeteo.estacion_id == records[0]["estacion_id"],
        ))
        assert row.temperatura_c == 23


class TestWeatherEndpoints:
    """Tests de endpoints de meteorologia"""

    def test_obtener_clima_actual(self, client, db, auth_headers):
        """Test endpoint /weather/current"""
        dato = LecturaMeteo(
            ts=utc_now(),
            temperatura_c=18.5,
            humedad_relativa=65,
            precipitacion_mm=0,
            viento_km_h=4.5,
            estacion_id="test_current_weather",
        )
        db.add(dato)
        db.commit()

        response = client.get("/api/v1/weather/current", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["temperatura"] == 18.5
        assert data["humedad"] == 65
        assert "ubicacion" in data
        assert data["ubicacion"] == "Villalba, Lugo"

    def test_obtener_prediccion_7dias(self, client, db, auth_headers):
        """Test endpoint /weather/forecast"""
        response = client.get("/api/v1/weather/forecast", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "ubicacion" in data
        assert "dias" in data or data["dias"] == []

    def test_obtener_historico_clima(self, client, db, auth_headers):
        """Test endpoint /weather/historical"""
        response = client.get("/api/v1/weather/historical?dias_atras=30", headers=auth_headers)

        assert response.status_code in [200, 404]

    def test_sincronizar_aemet(self, client, db, auth_headers):
        """Test endpoint /weather/sync"""
        response = client.post("/api/v1/weather/sync", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"

    def test_impacto_clima_produccion(self, client, db, auth_headers):
        """Test endpoint /weather/correlation/impact"""
        response = client.get("/api/v1/weather/correlation/impact?dias_adelante=7", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "ubicacion" in data
        assert "impactos_predichos" in data
