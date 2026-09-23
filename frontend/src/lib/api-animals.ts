import { request } from "@/lib/api";
import type { AnimalGenealogy } from "@/lib/types-animals";

// Cliente de la ficha de animal. Separado de api.ts (fichero compartido).

export const animalsApi = {
  genealogy(animalId: string) {
    return request<AnimalGenealogy>(`/animals/${encodeURIComponent(animalId)}/genealogy`);
  },
};
