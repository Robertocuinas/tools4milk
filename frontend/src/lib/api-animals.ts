import { request } from "@/lib/api";
import type { AnimalGenealogy, AnimalGenealogyUpdate, AnimalWithGenealogy } from "@/lib/types-animals";

// Cliente de la ficha de animal. Separado de api.ts (fichero compartido).

export const animalsApi = {
  genealogy(animalId: string) {
    return request<AnimalGenealogy>(`/animals/${encodeURIComponent(animalId)}/genealogy`);
  },

  updateGenealogy(animalId: string, body: AnimalGenealogyUpdate) {
    return request<AnimalWithGenealogy>(`/animals/${encodeURIComponent(animalId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};
