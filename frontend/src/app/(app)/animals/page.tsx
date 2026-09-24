"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, VenusAndMars } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/common/Pagination";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { CowIcon } from "@/components/ui/cow-icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api } from "@/lib/api";
import { enumLabel } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";
import type { Animal } from "@/lib/types";

type EstadoFilter = Animal["estado"] | "todos";
type SortKey = "name" | "code" | "production" | "state";
type SortDirection = "asc" | "desc";

const estadoStyles: Record<Animal["estado"], string> = {
  produccion: "bg-state-ok/15 text-state-ok",
  recria: "bg-state-info/15 text-state-info",
  seca: "bg-state-atencion/15 text-state-atencion",
  gestante: "bg-state-atencion/15 text-state-atencion",
  baja: "bg-state-neutral/10 text-state-neutral",
};

function EstadoBadge({ estado }: { estado: Animal["estado"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${estadoStyles[estado]}`}>
      {enumLabel("animalStatus", estado)}
    </span>
  );
}

export default function AnimalsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [sort, setSort] = useState<SortKey>("production");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);
  const pageSize = DEFAULT_PAGE_SIZE;

  const animalsQuery = useQuery({
    queryKey: ["animals", estadoFilter, debouncedSearch, sort, direction, page],
    queryFn: () =>
      api.animals({
        skip: getSkip(page, pageSize),
        limit: pageSize + 1,
        ...(estadoFilter !== "todos" ? { estado: estadoFilter } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        sort,
        direction,
      }),
    staleTime: 60_000,
  });

  const allAnimalsQuery = useQuery({
    queryKey: ["animals-all-counts"],
    queryFn: () => api.animals({ limit: 500, sort: "production", direction: "desc" }),
    staleTime: 60_000,
  });

  const fetched = animalsQuery.data ?? [];
  const allAnimals = allAnimalsQuery.data ?? [];
  const hasNext = fetched.length > pageSize;
  const pageItems = fetched.slice(0, pageSize);

  const counts: Record<EstadoFilter, number> = {
    todos: allAnimals.length,
    produccion: allAnimals.filter((animal) => animal.estado === "produccion").length,
    recria: allAnimals.filter((animal) => animal.estado === "recria").length,
    seca: allAnimals.filter((animal) => animal.estado === "seca").length,
    gestante: allAnimals.filter((animal) => animal.estado === "gestante").length,
    baja: allAnimals.filter((animal) => animal.estado === "baja").length,
  };

  const estadoTabs: { key: EstadoFilter; label: string }[] = (
    ["todos", "produccion", "recria", "seca", "gestante", "baja"] as EstadoFilter[]
  ).map((key) => ({
    key,
    label: key === "todos" ? t("common.all") : enumLabel("animalStatus", key),
  }));

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: t("quality.col.name", { defaultValue: "Nombre" }) },
    { key: "code", label: t("quality.col.code", { defaultValue: "Código" }) },
    { key: "production", label: t("quality.col.production", { defaultValue: "Producción media" }) },
    { key: "state", label: t("common.status", { defaultValue: "Estado" }) },
  ];

  function selectSort(key: SortKey) {
    setPage(1);
    if (key === sort) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDirection(key === "production" ? "desc" : "asc");
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("animals.eyebrow")} title={t("nav.animals")} EyebrowIcon={VenusAndMars}>
        <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text">
          {t("animals.count", { count: counts.todos || pageItems.length })}
        </span>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {!allAnimalsQuery.isLoading && (
          <BentoGrid>
            {estadoTabs.map(({ key, label }) => (
              <BentoTile key={key} footprint={key === "produccion" ? "2x1" : "1x1"}>
                <KpiCard label={label} value={counts[key]} tone={key === "baja" ? "muted" : key === "produccion" ? "success" : "default"} featured={key === "produccion"} />
              </BentoTile>
            ))}
          </BentoGrid>
        )}

        <div className="space-y-3">
          <div className="relative max-w-xl">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-dim" />
            <input
              type="search"
              aria-label={t("animals.searchPlaceholder")}
              placeholder={t("animals.searchPlaceholder")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-[10px] border border-app-border bg-white ps-9 pe-4 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {estadoTabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setEstadoFilter(key);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold transition ${estadoFilter === key ? "bg-brand/10 text-brand-dark" : "border border-app-border bg-white text-app-dim hover:bg-app-bg"}`}
              >
                {label}<span className="rounded-full bg-app-bg/60 px-1.5 text-[11px] font-bold">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        {animalsQuery.isLoading && (
          <div className="h-56 animate-pulse rounded-[10px] bg-app-surface2" />
        )}

        {animalsQuery.isError && (
          <div className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
            {t("animals.loadError")}
          </div>
        )}

        {!animalsQuery.isLoading && pageItems.length === 0 && (
          <EmptyState
            Icon={CowIcon}
            title={t("animals.emptyTitle")}
            description={debouncedSearch ? t("animals.emptySearch", { search: debouncedSearch }) : t("animals.emptyStatus")}
          />
        )}

        {!animalsQuery.isLoading && pageItems.length > 0 && (
          <div className="overflow-x-auto rounded-[10px] border border-app-border bg-white">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="border-b border-app-border bg-app-bg/60 text-xs font-extrabold uppercase tracking-wide text-app-dim">
                <tr>
                  {columns.slice(0, 2).map(({ key, label }) => (
                    <th key={key} scope="col" aria-sort={sort === key ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 text-start">
                      <button type="button" onClick={() => selectSort(key)} className="hover:text-brand-dark">
                        {label}{sort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col" aria-sort={sort === "production" ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 text-end">
                    <button type="button" onClick={() => selectSort("production")} className="hover:text-brand-dark">
                      {columns[2].label} ({t("quality.unitLitresDay", { defaultValue: "L/día" })}{sort === "production" ? (direction === "asc" ? " ↑" : " ↓") : ""})
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">{t("dashboard.activeTreatments", { defaultValue: "Tratamientos activos" })}</th>
                  <th scope="col" aria-sort={sort === "state" ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 text-start">
                    <button type="button" onClick={() => selectSort("state")} className="hover:text-brand-dark">
                      {columns[3].label}{sort === "state" ? (direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {pageItems.map((animal) => (
                  <tr key={animal.id} className="transition hover:bg-app-bg/50">
                    <td className="px-4 py-3 font-semibold text-app-text">
                      <Link href={`/animals/${animal.id}`} className="rounded-sm hover:text-brand-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                        {animal.nombre || t("animals.noName")}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-brand-dark">{animal.crotal_oficial}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-app-text">
                      {animal.produccion_promedio == null ? "—" : animal.produccion_promedio.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-app-text">{animal.tratamientos_activos ?? 0}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={animal.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!animalsQuery.isLoading && pageItems.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            currentCount={pageItems.length}
            hasNext={hasNext}
            isLoading={animalsQuery.isFetching}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
