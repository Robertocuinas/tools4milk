"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudSun,
  Database,
  Globe,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { KpiCard } from "@/components/ui/kpi-card";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { PageHeader } from "@/components/ui/page-header";
import { PanelCard, SectionTitle } from "@/components/ui/panel-card";
import { api } from "@/lib/api";
import { API_BASE_URL, API_V1_URL } from "@/lib/config";
import { AccessDenied } from "@/components/ui/access-denied";
import { usePermissions } from "@/lib/use-permissions";
import { roleDisplayName } from "@/lib/role-capabilities";

// ── Module status list ────────────────────────────────────────────────────────

const FRONTEND_MODULES = [
  { name: "Auth", path: "/auth/login", descriptionKey: "integration.modules.auth" },
  { name: "Dashboard", path: "/dashboard/summary", descriptionKey: "integration.modules.dashboard" },
  { name: "Animals", path: "/animals", descriptionKey: "integration.modules.animals" },
  { name: "Alerts", path: "/alerts", descriptionKey: "integration.modules.alerts" },
  { name: "Tasks", path: "/tasks", descriptionKey: "integration.modules.tasks" },
  { name: "Incidents", path: "/incidents", descriptionKey: "integration.modules.incidents" },
  { name: "Orders", path: "/pedidos", descriptionKey: "integration.modules.orders" },
  { name: "Shifts", path: "/turnos", descriptionKey: "integration.modules.shifts" },
  { name: "Handover", path: "/resumenes-relevo", descriptionKey: "integration.modules.handover" },
  { name: "Quality", path: "/lactations/quality/summary", descriptionKey: "integration.modules.quality" },
  { name: "Predictions", path: "/predictions/{id}", descriptionKey: "integration.modules.predictions" },
  { name: "Weather", path: "/weather/current", descriptionKey: "integration.modules.weather" },
  { name: "TV Global", path: "/dashboard/summary", descriptionKey: "integration.modules.tvGlobal" },
  { name: "Audit Log", path: "/audit-log", descriptionKey: "integration.modules.auditLog" },
];

// ── Status badge helper ────────────────────────────────────────────────────────

type StatusType = "ok" | "error" | "loading" | "unknown";

function StatusBadge({ status }: { status: StatusType }) {
  const { t } = useTranslation();
  const map: Record<StatusType, { icon: React.ReactNode; cls: string; label: string }> = {
    ok: { icon: <CheckCircle2 className="h-4 w-4" />, cls: "bg-state-ok/10 text-state-ok", label: t("integration.status.ok") },
    error: { icon: <XCircle className="h-4 w-4" />, cls: "bg-state-critica/10 text-state-critica", label: t("integration.status.error") },
    loading: { icon: <Loader2 className="h-4 w-4 animate-spin" />, cls: "bg-state-atencion/10 text-state-atencion", label: t("integration.status.loading") },
    unknown: { icon: <AlertTriangle className="h-4 w-4" />, cls: "bg-state-neutral/10 text-state-neutral", label: t("integration.status.unknown") },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app-border py-2.5 text-sm last:border-0">
      <span className="text-app-dim">{label}</span>
      <span className={`font-semibold text-app-text ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntegrationPage() {
  const { t } = useTranslation();
  const { role, user, can: userCan } = usePermissions();
  const isAdmin = userCan("view_integration");

  const healthQ = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: 1,
  });

  const weatherQ = useQuery({
    queryKey: ["weather-current"],
    queryFn: api.weather,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  const backendOnline = healthQ.isSuccess && healthQ.data.status === "ok";
  const dbOnline = healthQ.isSuccess && healthQ.data.database === "ok";
  const weatherOk = weatherQ.isSuccess;

  const systemOk = backendOnline && dbOnline;

  if (!isAdmin) {
    return (
      <div className="min-h-full">
        <PageHeader eyebrow={t("integration.eyebrow")} title={t("integration.title")} EyebrowIcon={Activity} />
        <AccessDenied
          role={role}
          requiredCapability="view_integration"
          description={t("integration.accessDescription")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("integration.eyebrow")} title={t("integration.title")} EyebrowIcon={Activity}>
        <StatusBadge status={healthQ.isLoading ? "loading" : systemOk ? "ok" : "error"} />
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* KPIs */}
        <BentoGrid>
          <BentoTile footprint={!systemOk ? "2x2" : "1x1"}><KpiCard
            Icon={Globe}
            label={t("integration.kpi.backend")}
            value={healthQ.isLoading ? "…" : backendOnline ? t("integration.online") : t("integration.offline")}
            tone={healthQ.isLoading ? "muted" : backendOnline ? "success" : "critical"}
            featured={!systemOk}
          /></BentoTile>
          <BentoTile><KpiCard
            Icon={Database}
            label={t("integration.database")}
            value={healthQ.isLoading ? "…" : dbOnline ? t("integration.online") : t("integration.offline")}
            tone={healthQ.isLoading ? "muted" : dbOnline ? "success" : "critical"}
          /></BentoTile>
          <BentoTile><KpiCard
            Icon={CloudSun}
            label={t("integration.kpi.weather")}
            value={weatherQ.isLoading ? "…" : weatherOk ? t("integration.online") : t("integration.noData")}
            sublabel={weatherQ.data?.temperatura_actual != null ? `${weatherQ.data.temperatura_actual.toFixed(0)}°C` : ""}
            tone={weatherQ.isLoading ? "muted" : weatherOk ? "success" : "warning"}
          /></BentoTile>
          <BentoTile><KpiCard
            Icon={ShieldCheck}
            label={t("integration.kpi.auth")}
            value={user ? t("integration.authenticated") : t("integration.noSession")}
            sublabel={user?.username}
            tone={user ? "success" : "critical"}
          /></BentoTile>
        </BentoGrid>

        {/* Backend detail */}
        <div className="grid gap-5 lg:grid-cols-2">
          <PanelCard className="h-full">
            <div className="mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4 text-brand" />
              <SectionTitle>{t("integration.backendStatus")}</SectionTitle>
            </div>

            {healthQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-app-dim">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("integration.verifyingConnection")}
              </div>
            )}

            {healthQ.isError && (
              <p className="text-sm text-state-critica">{t("integration.backendError")}</p>
            )}

            {healthQ.isSuccess && (
              <div>
                <InfoLine label={t("common.status")} value={<StatusBadge status={backendOnline ? "ok" : "error"} />} />
                <InfoLine label={t("integration.database")} value={<StatusBadge status={dbOnline ? "ok" : "error"} />} />
                <InfoLine label={t("integration.environment")} value={healthQ.data.environment ?? "—"} />
                <InfoLine label={t("integration.apiBaseUrl")} value={API_BASE_URL} mono />
                <InfoLine label={t("integration.apiV1Url")} value={API_V1_URL} mono />
              </div>
            )}
          </PanelCard>

          <PanelCard className="h-full">
            <div className="mb-3 flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-state-info" />
              <SectionTitle>{t("integration.externalServices")}</SectionTitle>
            </div>

            <div>
              <InfoLine
                label={t("integration.weatherAemet")}
                value={<StatusBadge status={weatherQ.isLoading ? "loading" : weatherOk ? "ok" : "error"} />}
              />
              {weatherQ.data && (
                <>
                  <InfoLine label={t("integration.temperature")} value={`${weatherQ.data.temperatura_actual?.toFixed(1) ?? "—"} °C`} />
                  <InfoLine label={t("integration.description")} value={weatherQ.data.descripcion ?? "—"} />
                  {weatherQ.data.impacto_productivo && (
                    <InfoLine label={t("integration.productionImpact")} value={weatherQ.data.impacto_productivo} />
                  )}
                </>
              )}
            </div>
          </PanelCard>
        </div>

        {/* Session info */}
        <PanelCard>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <SectionTitle>{t("integration.currentSession")}</SectionTitle>
          </div>
          <div className="grid gap-x-8 md:grid-cols-2">
            <InfoLine label={t("integration.user")} value={user?.username ?? "—"} mono />
            <InfoLine label={t("integration.email")} value={user?.email ?? "—"} />
            <InfoLine label={t("common.role")} value={user?.role ? roleDisplayName(user.role) : "—"} />
            <InfoLine label={t("common.status")} value={user?.activo !== false ? <span className="text-state-ok">{t("integration.active")}</span> : <span className="text-state-neutral">{t("integration.inactive")}</span>} />
          </div>
        </PanelCard>

        {/* Module status */}
        <PanelCard>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand" />
            <SectionTitle>{t("integration.modulesTitle")}</SectionTitle>
          </div>
          <p className="mb-4 text-xs text-app-dim">
            {t("integration.modulesDescription")}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {FRONTEND_MODULES.map((mod) => (
              <div
                key={mod.name}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-app-border bg-app-bg px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-app-text">{mod.name}</p>
                  <p className="text-xs text-app-dim">{t(mod.descriptionKey)}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-app-dim/70">{API_V1_URL}{mod.path}</p>
                </div>
                <StatusBadge
                  status={
                    mod.name === "Auth" ? (user ? "ok" : "error")
                    : mod.name === "Weather" ? (weatherQ.isLoading ? "loading" : weatherOk ? "ok" : "error")
                    : systemOk ? "ok"
                    : "unknown"
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[10px] border border-state-info/20 bg-state-info/5 px-4 py-3 text-xs text-state-info">
            <strong>{t("integration.noteLabel")}</strong> {t("integration.noteText")}
            {/* TODO: Cuando el backend exponga WebSocket/SSE, sustituir el polling por eventos push */}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
