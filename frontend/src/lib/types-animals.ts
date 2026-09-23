import type { Animal } from "@/lib/types";

// Tipos de la ficha de animal (genealogía). Viven aquí y no en types.ts
// para no tocar ese fichero compartido.

export type GenealogyRelation =
  | "madre"
  | "padre"
  | "abuela_materna"
  | "abuelo_materno"
  | "abuela_paterna"
  | "abuelo_paterno";

/** Ascendiente devuelto por GET /animals/{id}/genealogy. `registrado`
 * indica si existe como animal en la explotación (entonces `id` enlaza a
 * su ficha); un toro externo de IA llega con id=null. */
export type GenealogyRelative = {
  id: string | null;
  nombre: string | null;
  crotal: string | null;
  relacion: GenealogyRelation;
  registrado: boolean;
  sexo?: string | null;
  raza?: string | null;
  fecha_nacimiento?: string | null;
};

export type AnimalGenealogy = {
  animal_id: string;
} & Record<GenealogyRelation, GenealogyRelative | null>;

/** Campos de genealogía añadidos (migración 0016) a la respuesta de
 * GET/POST/PUT /animals. Todos opcionales para no romper el tipo Animal. */
export type AnimalGenealogyFields = {
  madre_id?: string | null;
  padre_id?: string | null;
  padre_crotal?: string | null;
  padre_nombre?: string | null;
};

export type AnimalWithGenealogy = Animal & AnimalGenealogyFields;
