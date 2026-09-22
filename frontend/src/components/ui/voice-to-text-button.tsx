"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";

type RecorderState = "idle" | "recording" | "transcribing";

type VoiceToTextButtonProps = {
  /** Se llama con el texto transcrito; quien use el botón decide si
   * reemplaza o añade al contenido existente del campo. */
  onTranscribed: (text: string) => void;
  disabled?: boolean;
};

const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Botón de dictado: graba audio con MediaRecorder y lo envía al backend
 * para transcribirlo (T14 ampliado — no se guarda el audio, solo el texto
 * resultante). No requiere elegir un formato "universal": Whisper acepta
 * tanto el webm/opus de Chrome/Android como el mp4 de Safari/iOS
 * directamente, así que no hace falta transcodificar en el cliente. */
export function VoiceToTextButton({ onTranscribed, disabled }: VoiceToTextButtonProps) {
  const { i18n } = useTranslation();
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este dispositivo no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const extension = recorder.mimeType?.includes("mp4") ? "m4a" : "webm";
          const { texto } = await api.transcribeAudio(blob, `nota-de-voz.${extension}`, i18n.language);
          if (texto) onTranscribed(texto);
          else setError("No se ha detectado ningún texto en el audio.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Error al transcribir el audio");
        } finally {
          setState("idle");
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled || state === "transcribing"}
        onClick={state === "recording" ? stopRecording : startRecording}
        title={state === "recording" ? "Detener grabación" : "Dictar por voz"}
        className={`tablet-touch inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          state === "recording"
            ? "animate-pulse border-state-critica/40 bg-state-critica/10 text-state-critica"
            : "border-app-border bg-white text-app-dim hover:border-brand/40 hover:text-brand"
        }`}
      >
        {state === "transcribing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "recording" ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
        {state === "recording" ? "Detener" : state === "transcribing" ? "Transcribiendo…" : "Dictar"}
      </button>
      {error && <span className="text-[11px] font-semibold text-state-critica">{error}</span>}
    </div>
  );
}
