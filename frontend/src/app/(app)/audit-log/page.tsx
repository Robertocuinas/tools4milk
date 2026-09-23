"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Database,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import type { AuditLogEntry, AuditOperation } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string | null, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(dateLocale(lang), {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const operationStyles: Record<AuditOperation, { badge: string }> = {
  INSERT: { badge: "bg-state-ok/10 text-state-ok" },
  UPDATE: { badge: "bg-state-info/10 text-state-info" },
  DELETE: { badge: "bg-state-critica/10 text-state-critica" },
};

// ── Row component ─────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const op = operationStyles[entry.operacion] ?? { badge: "bg-app-bg text-app-dim" };

  return (
    <div className="border-b border-app-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-3 text-start transition hover:bg-app-bg"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${op.badge}`}>
          {enumLabel("auditOperation", entry.operacion)}
        </span>
        <span className="min-w-[120px] font-mono text-xs font-semibold text-brand-dark">
          {entry.tabla_afectada}
        </span>
        <span className="hidden flex-1 truncate text-xs text-app-dim sm:block">
          {entry.registro_id ? entry.registro_id.slice(0, 8) + "…" : "—"}
        </span>
        <span className="hidden text-xs text-app-dim md:block">{entry.usuario_bd}</span>
        <span className="ms-auto shrink-0 text-xs text-app-dim">{formatTs(entry.ts, i18n.language)}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-app-dim" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-app-dim" />
        )}
      </button>

      {expanded && (
        <div className="grid gap-4 bg-app-bg px-4 pb-4 pt-2 sm:grid-cols-2">
          {entry.datos_anteriores && (
            <div>
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-state-critica">
                {t("auditLog.before")}
              </p>
              <pre className="overflow-x-auto rounded-[10px] border border-app-border bg-white p-3 text-[11px] text-app-text">
                {JSON.stringify(entry.datos_anteriores, null, 2)}
              </pre>
            </div>
          )}
          {entry.datos_nuevos && (
            <div>
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-state-ok">
                {t("auditLog.after")}
              </p>
              <pre className="overflow-x-auto rounded-[10px] border border-app-border bg-white p-3 text-[11px] text-app-text">
                {JSON.stringify(entry.datos_nuevos, null, 2)}
              </pre>
            </div>
          )}
          {!entry.datos_anteriores && !entry.datos_nuevos && (
            <p className="text-xs text-app-dim">{t("auditLog.noDetail")}</p>
          )}
          <div className="sm:col-span-2">
            <p className="text-[10px] font-mono text-app-dim">
              SHA-256: {entry.hash_sha256?.slice(0, 32)}…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterOp = AuditOperation | "";

const TABLE_OPTIONS = [
  "", "animales", "lactaciones", "tratamientos_activos", "alertas",
  "incidencias", "pedidos", "turnos", "asignaciones_turno", "empleados",
  "maquinaria", "zonas", "usuarios",
];

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { role, can: userCan } = usePermissions();
  const isAdmin = userCan("view_audit_log");

  const [tabla, setTabla] = useState("");
  const [accion, setAccion] = useState<FilterOp>("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [limit] = useState(200);

  const q = useQuery({
    queryKey: ["audit-log", tabla, accion, fechaDesde, fechaHasta, limit],
    queryFn: () =>
      api.auditLog({
        ...(tabla ? { tabla } : {}),
        ...(accion ? { accion } : {}),
        ...(fechaDesde ? { fecha_desde: fechaDesde } : {}),
        ...(fechaHasta ? { fecha_hasta: fechaHasta } : {}),
        limit,
      }),
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const registros = useMemo(() => q.data?.registros ?? [], [q.data]);

  const stats = useMemo(() => ({
    total: registros.length,
    inserts: registros.filter((r) => r.operacion === "INSERT").length,
    updates: registros.filter((r) => r.operacion === "UPDATE").length,
    deletes: registros.filter((r) => r.operacion === "DELETE").length,
  }), [registros]);

  // Client-side search filter by tabla or usuario_bd
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? registros.filter(
        (r) =>
          r.tabla_afectada.toLowerCase().includes(search.toLowerCase()) ||
          r.usuario_bd.toLowerCase().includes(search.toLowerCase()),
      )
    : registros;

  if (!isAdmin) {
    return (
      <div className="min-h-full">
        <PageHeader eyebrow={t("nav.system")} title={t("nav.auditLog")} EyebrowIcon={ShieldCheck} />
        <AccessDenied
          role={role}
          requiredCapability="view_audit_log"
          description={t("auditLog.accessDescription")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("auditLog.eyebrow")} title={t("nav.auditLog")} EyebrowIcon={ShieldCheck}>
        <span className="rounded-full border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-dim">
          {t("auditLog.lastRecords", { count: limit })}
        </span>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* KPIs */}
        {q.isSuccess && (
          <BentoGrid>
            <BentoTile footprint={stats.deletes > 0 ? "2x1" : "1x1"}><KpiCard label={t("auditLog.kpi.deletes")} value={stats.deletes} tone={stats.deletes > 0 ? "critical" : "success"} Icon={Database} featured={stats.deletes > 0} /></BentoTile>
            <BentoTile><KpiCard label={t("auditLog.kpi.updates")} value={stats.updates} tone="info" Icon={Database} /></BentoTile>
            <BentoTile><KpiCard label={t("auditLog.kpi.inserts")} value={stats.inserts} tone="success" Icon={Database} /></BentoTile>
            <BentoTile><KpiCard label={t("auditLog.kpi.total")} value={stats.total} tone="default" /></BentoTile>
          </BentoGrid>
        )}

        {/* Filters */}
        <div className="rounded-[var(--bento-radius)] border border-app-border bg-white p-[var(--bento-padding)] shadow-card">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-app-dim">
            {t("common.filters")}
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                {t("auditLog.table")}
              </label>
              <select
                value={tabla}
                onChange={(e) => setTabla(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
              >
                <option value="">{t("auditLog.allTables")}</option>
                {TABLE_OPTIONS.filter(Boolean).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[140px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                {t("auditLog.operation")}
              </label>
              <select
                value={accion}
                onChange={(e) => setAccion(e.target.value as FilterOp)}
                className="h-10 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
              >
                <option value="">{t("auditLog.allOperations")}</option>
                <option value="INSERT">{enumLabel("auditOperation", "INSERT")}</option>
                <option value="UPDATE">{enumLabel("auditOperation", "UPDATE")}</option>
                <option value="DELETE">{enumLabel("auditOperation", "DELETE")}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                {t("auditLog.from")}
              </label>
              <input
                type="date"
                aria-label={t("auditLog.from")}
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                {t("auditLog.to")}
              </label>
              <input
                type="date"
                aria-label={t("auditLog.to")}
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-10 rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
              />
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-app-dim">
                {t("auditLog.quickSearch")}
              </label>
              <input
                type="text"
                aria-label={t("auditLog.quickSearch")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("auditLog.searchPlaceholder")}
                className="h-10 w-full min-w-[160px] rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </div>

            {(tabla || accion || fechaDesde || fechaHasta || search) && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => { setTabla(""); setAccion(""); setFechaDesde(""); setFechaHasta(""); setSearch(""); }}
                  className="h-10 rounded-[10px] border border-app-border px-3 text-sm font-semibold text-app-dim transition hover:text-app-text"
                >
                  {t("auditLog.clear")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {q.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-[10px] bg-app-surface2" />
            ))}
          </div>
        )}

        {/* Error */}
        {q.isError && (
          <div className="rounded-[14px] border border-state-critica/20 bg-state-critica/5 px-4 py-3 text-sm text-state-critica">
            {t("auditLog.loadError", { message: q.error.message })}
          </div>
        )}

        {/* Empty */}
        {q.isSuccess && filtered.length === 0 && (
          <EmptyState
            Icon={Database}
            title={t("auditLog.emptyTitle")}
            description={search || tabla || accion ? t("auditLog.emptyFiltered") : t("auditLog.emptyLog")}
          />
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div className="rounded-[14px] border border-app-border bg-white shadow-card overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-4 border-b border-app-border bg-app-bg px-4 py-2.5">
              <span className="w-[80px] text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("auditLog.columns.op")}</span>
              <span className="min-w-[120px] text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("auditLog.table")}</span>
              <span className="hidden flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim sm:block">{t("auditLog.columns.recordId")}</span>
              <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim md:block">{t("auditLog.columns.user")}</span>
              <span className="ms-auto text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t("common.date")}</span>
              <span className="w-4" />
            </div>

            {/* Rows */}
            <div className="divide-y divide-app-border">
              {filtered.map((entry: AuditLogEntry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>

            {/* Footer count */}
            {filtered.length < registros.length && (
              <div className="border-t border-app-border bg-app-bg px-4 py-2 text-xs text-app-dim">
                {t("auditLog.showing", { shown: filtered.length, total: registros.length })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
