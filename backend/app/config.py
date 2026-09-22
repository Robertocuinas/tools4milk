from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./tfm_mvp.db"
    database_echo: bool = False
    environment: str = "development"
    debug: bool | str = True

    secret_key: str = "tools4milk-dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    aemet_api_key: str = ""
    aemet_municipio_id: str = "27065"
    aemet_estacion_id: str = ""

    app_url: str = "http://localhost:8000"

    initial_demo_password: str = "testpass123"

    admin_secret: str = ""

    # T7: backend de almacenamiento de adjuntos. "local" guarda en un volumen
    # del contenedor (solo valido con volumen persistente garantizado; en un
    # PaaS con filesystem efimero -Azure App Service/Container Apps sin
    # Azure Files, Railway, etc.- los ficheros se pierden en cada
    # redespliegue). "azure_blob" usa Azure Blob Storage y sobrevive a
    # redespliegues sin depender del disco del contenedor.
    storage_backend: str = "local"
    storage_local_path: str = "/app/media/adjuntos"
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "adjuntos"

    # T14 (ampliado): transcripcion de voz a texto para notas rapidas en
    # tareas, relevos e incidencias. El audio nunca se guarda — se envia a
    # OpenAI Whisper y se descarta tras obtener el texto.
    openai_api_key: str = ""
    whisper_model: str = "whisper-1"

    cors_origins: list[str] | str = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
    ]


settings = Settings()
