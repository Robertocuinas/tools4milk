"use client";

import { useCallback, useMemo, useState } from "react";
import {
  filterRows,
  nextSort,
  sortRows,
  type SortAccessors,
  type SortDirection,
  type SortState,
} from "./table-logic";

type Options<T, K extends string> = {
  rows: readonly T[];
  accessors: SortAccessors<T, K>;
  initialSort: SortState<K>;
  /** Campos de texto en los que busca el buscador. */
  searchFields: (row: T) => (string | null | undefined)[];
  /** Direccion con la que empieza cada columna al pulsarla por primera vez. */
  firstDirection?: Partial<Record<K, SortDirection>>;
  tiebreak?: (a: T, b: T) => number;
  /** Tamaño de pagina para paginar en cliente (sin valor: sin paginar). */
  pageSize?: number;
};

/** Estado de busqueda + ordenacion de una tabla en cliente. Las opciones
 * `accessors`, `searchFields` y `tiebreak` deben ser estables (definidas a
 * nivel de modulo o memoizadas). */
export function useFilteredSorted<T, K extends string>({
  rows,
  accessors,
  initialSort,
  searchFields,
  firstDirection,
  tiebreak,
  pageSize,
}: Options<T, K>) {
  const [query, setQueryState] = useState("");
  const [sort, setSort] = useState<SortState<K>>(initialSort);
  const [page, setPage] = useState(1);

  // Cambiar busqueda u orden vuelve a la primera pagina.
  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(1);
  }, []);

  const toggleSort = useCallback(
    (key: K) => {
      setSort((current) => nextSort(current, key, firstDirection?.[key]));
      setPage(1);
    },
    [firstDirection],
  );

  const visibleRows = useMemo(
    () => sortRows(filterRows(rows, query, searchFields), accessors, sort, tiebreak),
    [rows, query, searchFields, accessors, sort, tiebreak],
  );

  const pageRows = useMemo(
    () => (pageSize ? visibleRows.slice((page - 1) * pageSize, page * pageSize) : visibleRows),
    [visibleRows, page, pageSize],
  );
  const hasNext = pageSize ? page * pageSize < visibleRows.length : false;

  return { query, setQuery, sort, toggleSort, visibleRows, page, setPage, pageRows, hasNext };
}
