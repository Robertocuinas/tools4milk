# Modelos Vosk (dictado por voz, T14 ampliado)

Este directorio se monta en el contenedor backend en `/app/vosk_models` (ver
`docker-compose.yml`). Los modelos en sí **no van en git** — son binarios de
decenas de MB.

## Cómo activar un idioma

1. Descargar el modelo "small" del idioma deseado desde
   <https://alphacephei.com/vosk/models> (por ejemplo,
   `vosk-model-small-es-0.42.zip` para español).
2. Descomprimirlo aquí, de forma que quede
   `backend/vosk_models/vosk-model-small-es-0.42/` (con `am/`, `graph/`,
   `ivector/`, etc. dentro).
3. Añadir la ruta al `.env` (o a las variables de entorno del despliegue):

   ```
   VOSK_MODEL_PATHS={"es": "/app/vosk_models/vosk-model-small-es-0.42"}
   ```

   Para varios idiomas, un único JSON con todas las entradas:

   ```
   VOSK_MODEL_PATHS={"es": "/app/vosk_models/vosk-model-small-es-0.42", "fr": "/app/vosk_models/vosk-model-small-fr-0.22"}
   ```

## Si un idioma no tiene modelo Vosk

Vosk no publica modelo "small" oficial para todos los idiomas (por ejemplo,
gallego no tiene uno dedicado). Para cualquier idioma sin entrada en
`VOSK_MODEL_PATHS`, la transcripción cae automáticamente a la API de OpenAI
Whisper (requiere `OPENAI_API_KEY`) — no hace falta configurar nada más para
que ese idioma siga funcionando.
