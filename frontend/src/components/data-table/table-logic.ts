// Logica pura (sin React) de filtrado y ordenacion de tablas, para poder
// reutilizarla y comprobarla aislada.

export type SortDirection = "asc" | "desc";

export type SortState<K extends string> = {
  key: K;
  direction: SortDirection;
};

export type SortValue = number | string | null | undefined;
export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/** Minusculas y sin tildes, para que "maría" encuentre "Maria". */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtra por coincidencia parcial en cualquiera de los campos indicados. */
export function filterRows<T>(
  rows: readonly T[],
  query: string,
  fields: (row: T) => (string | null | undefined)[],
): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...rows];
  return rows.filter((row) => fields(row).some((field) => normalizeSearch(field).includes(needle)));
}

/** Compara dos valores; los vacios (null/undefined/NaN) van SIEMPRE al
 * final, en ambas direcciones, para no mezclar "sin dato" con extremos. */
export function compareValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const aEmpty = a == null || (typeof a === "number" && Number.isNaN(a));
  const bEmpty = b == null || (typeof b === "number" && Number.isNaN(b));
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

/** Ordenacion estable; `tiebreak` decide a igualdad del criterio principal. */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  accessors: SortAccessors<T, K>,
  sort: SortState<K>,
  tiebreak?: (a: T, b: T) => number,
): T[] {
  const accessor = accessors[sort.key];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compareValues(accessor(a.row), accessor(b.row), sort.direction);
      if (primary !== 0) return primary;
      const secondary = tiebreak ? tiebreak(a.row, b.row) : 0;
      return secondary !== 0 ? secondary : a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Siguiente estado al pulsar una cabecera: misma columna invierte la
 * direccion; columna nueva empieza por su direccion preferida. */
export function nextSort<K extends string>(
  current: SortState<K>,
  key: K,
  firstDirection: SortDirection = "asc",
): SortState<K> {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: firstDirection };
}
