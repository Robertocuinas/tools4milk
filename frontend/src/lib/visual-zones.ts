import i18n from "@/lib/i18n";
import type { Task, VisualZoneKey, Zone } from "@/lib/types";

// Las etiquetas en español (`title`, `description`, `label`) se mantienen por
// compatibilidad con consumidores que aun no usan i18n; las claves
// `*Key` apuntan al namespace "visualZones" de los locales.
export const VISUAL_ZONE_GROUPS: Record<VisualZoneKey, {
  title: string;
  titleKey: string;
  description: string;
  descriptionKey: string;
  codes: string[];
  subzones: { key: string; label: string; labelKey: string; codes: string[]; description?: string; descriptionKey?: string }[];
}> = {
  recria: {
    title: "Recria",
    titleKey: "visualZones.recria.title",
    description: "Boxes de terneros y zona de recria.",
    descriptionKey: "visualZones.recria.description",
    codes: ["boxes_terneros", "zona_recria", "recria"],
    subzones: [
      { key: "boxes", label: "Boxes de terneros", labelKey: "visualZones.subzones.boxes.label", codes: ["boxes_terneros"], description: "Animales provisionales por numero de box.", descriptionKey: "visualZones.subzones.boxes.description" },
      { key: "zona_recria", label: "Zona de recria", labelKey: "visualZones.subzones.zona_recria.label", codes: ["zona_recria", "recria"], description: "Terneras y novillas con ficha completa.", descriptionKey: "visualZones.subzones.zona_recria.description" },
    ],
  },
  nave: {
    title: "Nave",
    titleKey: "visualZones.nave.title",
    description: "Patio de alimentacion, enfermeria y maquinaria.",
    descriptionKey: "visualZones.nave.description",
    codes: ["patio_alimentacion", "enfermeria", "maquinaria", "robots", "sala_ordeno", "silos", "almacen", "oficina", "general"],
    subzones: [
      { key: "patio", label: "Patio de alimentacion", labelKey: "visualZones.subzones.patio.label", codes: ["patio_alimentacion", "silos", "almacen"], description: "Racion, bebederos, silos y pedidos de alimentacion.", descriptionKey: "visualZones.subzones.patio.description" },
      { key: "enfermeria", label: "Enfermeria", labelKey: "visualZones.subzones.enfermeria.label", codes: ["enfermeria"], description: "Tratamientos, retirada y revisiones sanitarias.", descriptionKey: "visualZones.subzones.enfermeria.description" },
      { key: "maquinaria", label: "Maquinaria", labelKey: "visualZones.subzones.maquinaria.label", codes: ["maquinaria", "robots", "sala_ordeno", "general", "oficina"], description: "Averias, mantenimientos y estado de equipos.", descriptionKey: "visualZones.subzones.maquinaria.description" },
    ],
  },
};

export const VISUAL_ZONE_LIST = Object.entries(VISUAL_ZONE_GROUPS).map(([key, value]) => ({
  key: key as VisualZoneKey,
  ...value,
}));

/** Traduce una etiqueta de zona visual al idioma activo, con la etiqueta en
 * español como respaldo. Debe llamarse desde un componente que use
 * useTranslation() para re-renderizar al cambiar de idioma. */
export function visualZoneText(key: string | undefined, fallback: string) {
  return key ? i18n.t(key, { defaultValue: fallback }) : fallback;
}

export function idsForZoneCodes(zones: Zone[], codes: string[]) {
  const wanted = new Set(codes);
  return new Set(zones.filter((zone) => wanted.has(zone.codigo)).map((zone) => zone.id));
}

export function displayZoneName(zone?: Pick<Zone, "codigo" | "nombre"> | null) {
  if (!zone) return null;
  for (const visualZone of VISUAL_ZONE_LIST) {
    for (const subzone of visualZone.subzones) {
      if (subzone.codes.includes(zone.codigo)) return visualZoneText(subzone.labelKey, subzone.label);
    }
  }
  return zone.nombre;
}

export function visualZoneOptions(zones: Zone[]) {
  return VISUAL_ZONE_LIST.flatMap((visualZone) =>
    visualZone.subzones.flatMap((subzone) => {
      const zone = zones.find((candidate) => subzone.codes.includes(candidate.codigo));
      return zone ? [{ id: zone.id, nombre: visualZoneText(subzone.labelKey, subzone.label), codigo: zone.codigo }] : [];
    }),
  );
}

export function visualZoneSummaries<T extends { zona_id?: string | null }>(zones: Zone[], items: T[]) {
  return VISUAL_ZONE_LIST.map((visualZone) => {
    const ids = idsForZoneCodes(zones, visualZone.codes);
    return {
      ...visualZone,
      ids,
      items: items.filter((item) => item.zona_id && ids.has(item.zona_id)),
    };
  });
}

export function taskZoneName(task: Task, zoneLookup?: Map<string, string>) {
  if (task.zona_id && zoneLookup?.has(task.zona_id)) return zoneLookup.get(task.zona_id);
  return task.tarea_catalogo?.zona_aplicable ?? null;
}
