export type Suggestion<T> = {
  value: T | null;
  confidence: "alta" | "media" | null;
  evidence: string[];
  requires_review: true;
};

export type ExtractionResponse = {
  texto: string;
  contexto: "incidencia" | "pedido";
  requires_confirmation: true;
  incidencia: {
    zona_id: Suggestion<string>;
    tipo: Suggestion<string>;
    prioridad: Suggestion<string>;
    titulo: Suggestion<string>;
    descripcion: string;
  } | null;
  pedido: {
    proveedor: Suggestion<string>;
    productos: Array<{
      insumo: Suggestion<string>;
      cantidad: Suggestion<number>;
      unidad: Suggestion<string>;
    }>;
    cliente: Suggestion<string>;
    fecha_mencionada: Suggestion<string>;
    observaciones: Suggestion<string>;
  } | null;
};
