"use client";

import { useQuery } from "@tanstack/react-query";
import { Beef, Search, VenusAndMars } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/common/Pagination";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";
import type { Animal } from "@/lib/types";

type EstadoFilter = Animal["estado"] | "todos";

const estadoStyles: Record<Animal["estado"], string> = {
  produccion: "bg-state-ok/15 text-state-ok",
  recria: "bg-state-info/15 text-state-info",
  seca: "bg-state-atencion/15 text-state-atencion",
  gestante: "bg-state-atencion/15 text-state-atencion",
  baja: "bg-state-neutral/10 text-state-neutral",
};

function EstadoBadge({ estado }: { estado: Animal["estado"] }) {
  useTranslation();
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${estadoStyles[estado]}`}>
      {enumLabel("animalStatus", estado)}
    </span>
  );
}

function AnimalCard({ animal }: { animal: Animal }) {
  const { t, i18n } = useTranslation();
  const nacimiento = new Date(animal.fecha_nacimiento);
  const ageYears = Math.max(
    0,
    Math.floor((Date.now() - nacimiento.getTime()) / (365.25 * 24 * 3600 * 1000)),
  );

  return (
    <Link
      href={`/animals/${animal.id}`}
      className="block rounded-[10px] border border-app-border bg-white px-4 py-4 shadow-card transition hover:border-brand/30 hover:shadow-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-brand-dark">{animal.crotal_oficial}</span>
            <EstadoBadge estado={animal.estado} />
          </div>
          <h2 className="mt-2 font-heading text-base font-bold text-app-text">
            {animal.nombre ?? t("animals.noName")}
          </h2>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-app-dim">
            {animal.raza && <span>{animal.raza}</span>}
            <span>{t("animals.years", { count: ageYears })}</span>
            {animal.estado_reproductivo && (
              <span className="capitalize">
                {t(`animals.reproductiveStatus.${animal.estado_reproductivo}`, {
                  defaultValue: animal.estado_reproductivo.replace(/_/g, " "),
                })}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-end text-xs text-app-dim">
          <div>{t("animals.entry")}</div>
          <div className="font-bold text-app-text">
            {new Date(animal.fecha_entrada).toLocaleDateString(dateLocale(i18n.language), {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function AnimalsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);
  const pageSize = DEFAULT_PAGE_SIZE;

  const animalsQuery = useQuery({
    queryKey: ["animals", estadoFilter, page],
    queryFn: () =>
      api.animals({
        skip: getSkip(page, pageSize),
        limit: pageSize + 1,
        ...(estadoFilter !== "todos" ? { estado: estadoFilter } : {}),
      }),
    staleTime: 60_000,
  });

  const allAnimalsQuery = useQuery({
    queryKey: ["animals-all-counts"],
    queryFn: () => api.animals({ limit: 500 }),
    staleTime: 60_000,
  });

  const fetched = animalsQuery.data ?? [];
  const allAnimals = allAnimalsQuery.data ?? [];
  const hasNext = fetched.length > pageSize;
  const pageItems = fetched.slice(0, pageSize);
  const matchesSearch = (animal: Animal) => {
    const needle = debouncedSearch.toLowerCase();
    return (
      !needle ||
      animal.crotal_oficial.toLowerCase().includes(needle) ||
      (animal.nombre ?? "").toLowerCase().includes(needle)
    );
  };
  const globalFiltered = allAnimals
    .filter((animal) => estadoFilter === "todos" || animal.estado === estadoFilter)
    .filter(matchesSearch);
  const filtered = debouncedSearch ? globalFiltered : pageItems.filter(matchesSearch);

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

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-dim" />
            <input
              type="text"
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
                className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold transition ${
                  estadoFilter === key
                    ? "bg-brand/10 text-brand-dark"
                    : "border border-app-border bg-white text-app-dim hover:bg-app-bg"
                }`}
              >
                {label}
                <span className="rounded-full bg-app-bg/60 px-1.5 text-[11px] font-bold">
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {animalsQuery.isLoading && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[10px] bg-app-surface2" />
            ))}
          </div>
        )}

        {animalsQuery.isError && (
          <div className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
            {t("animals.loadError")}
          </div>
        )}

        {!animalsQuery.isLoading && !allAnimalsQuery.isLoading && filtered.length === 0 && (
          <EmptyState
            Icon={Beef}
            title={t("animals.emptyTitle")}
            description={search ? t("animals.emptySearch", { search }) : t("animals.emptyStatus")}
          />
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} />
          ))}
        </div>

        {!animalsQuery.isLoading && pageItems.length > 0 && !debouncedSearch && (
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
