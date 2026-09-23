import { request } from "@/lib/api";
import type { ExtractionResponse } from "@/lib/types-extraction";

export const extractionApi = {
  suggest(contexto: "incidencia" | "pedido", texto: string) {
    return request<ExtractionResponse>("/extracciones", {
      method: "POST",
      body: JSON.stringify({ contexto, texto }),
    });
  },
};
