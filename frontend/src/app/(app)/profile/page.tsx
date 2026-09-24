"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Languages,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { PanelCard, SectionTitle } from "@/components/ui/panel-card";
import { TvModeButton } from "@/components/tv/TvModeButton";
import { api } from "@/lib/api";
import { type Capability, roleDisplayName, normalizeRole } from "@/lib/role-capabilities";
import { useActiveWorkerStore } from "@/lib/active-worker-store";
import { usePermissions } from "@/lib/use-permissions";
import { enumLabel } from "@/lib/i18n";
import { useAppStore } from "@/store/app-store";

// ── Capability groups for display ─────────────────────────────────────────────

const CAPABILITY_GROUPS: { id: string; caps: Capability[] }[] = [
  {
    id: "control",
    caps: ["view_dashboard", "view_report", "view_tv_global"],
  },
  {
    id: "operations",
    caps: [
      "manage_tasks", "create_task", "complete_task",
      "manage_incidents", "create_incident",
      "manage_orders", "create_order",
      "manage_shifts", "view_handover", "create_handover",
    ],
  },
  {
    id: "livestock",
    caps: [
      "view_animals", "manage_animals",
      "view_quality", "view_predictions",
      "manage_treatments", "manage_lactations",
      "view_alerts", "resolve_alert",
    ],
  },
  {
    id: "zones",
    caps: ["view_zones", "manage_zones", "use_tablet_zone", "manage_machinery", "view_management"],
  },
  {
    id: "admin",
    caps: [
      "manage_employees", "manage_settings", "view_audit_log",
      "view_integration", "manage_users",
    ],
  },
];

// Etiquetas de capacidades: profile.capabilities.<capability> en los locales.

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app-border py-2.5 text-sm last:border-0">
      <span className="shrink-0 font-semibold text-app-dim">{label}</span>
      <span className="text-end text-app-text">{value ?? <span className="text-app-dim">—</span>}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const { role, can, isAdmin } = usePermissions();
  const normalizedRole = normalizeRole(role);
  const isUnknownRole = role !== null && role !== normalizedRole;

  const { worker: activeWorker, setWorker, clearWorker, hydrate: workerHydrate } = useActiveWorkerStore();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  useEffect(() => { workerHydrate(); }, [workerHydrate]);

  // Refresh user data from API
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  // Load employees for worker selection
  const employeesQ = useQuery({
    queryKey: ["management-employees"],
    queryFn: () => api.employees(),
    staleTime: 5 * 60_000,
  });
  const farmSettingsQ = useQuery({ queryKey: ["farm-settings"], queryFn: api.farmSettings, staleTime: 30_000 });
  const farmSettingsMutation = useMutation({
    mutationFn: api.updateFarmSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["farm-settings"] }),
  });

  const profile = meQ.data ?? user;
  const roleInfo = {
    label: roleDisplayName(role),
    color:
      role === "admin" ? "bg-brand/10 text-brand-dark border-brand/20"
      : role === "veterinario" ? "bg-state-info/10 text-state-info border-state-info/20"
      : role === "operario" ? "bg-state-atencion/10 text-state-atencion border-state-atencion/20"
      : "bg-state-ok/10 text-state-ok border-state-ok/20",
  };

  function handleLogout() {
    logout();
    router.replace("/");
  }

  function applyWorker() {
    const emp = (employeesQ.data ?? []).find((e) => e.id === selectedEmployeeId);
    if (!emp) return;
    setWorker({
      id: emp.id,
      name: [emp.nombre, emp.apellidos].filter(Boolean).join(" "),
      role: emp.role ?? "auxiliar",
    });
    setSelectedEmployeeId("");
  }

  return (
    <div className="min-h-full">
      <PageHeader eyebrow={t("profile.eyebrow")} title={t("nav.profile")} EyebrowIcon={UserRound}>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-[10px] border border-state-critica/20 bg-state-critica/5 px-3 py-2 text-sm font-semibold text-state-critica transition hover:bg-state-critica/10"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.logout")}
        </button>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Unknown role warning */}
        {isUnknownRole && (
          <div className="rounded-[14px] border border-state-atencion/30 bg-state-atencion/5 px-4 py-3 text-sm text-state-atencion">
            <strong>{t("profile.unknownRoleTitle")}</strong> {t("profile.unknownRoleText", { role })}
          </div>
        )}

        {/* User card */}
        <section className="rounded-[var(--bento-radius)] border border-app-border bg-[linear-gradient(145deg,#ffffff_0%,#eef9ff_100%)] p-6 shadow-card">
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand/10">
              <UserRound className="h-10 w-10 text-brand" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-heading text-2xl font-bold text-app-text">
                  {profile?.username ?? "—"}
                </h2>
                <span className={`rounded-full border px-3 py-0.5 text-[11px] font-extrabold uppercase ${roleInfo.color}`}>
                  {roleInfo.label}
                </span>
                {profile?.activo !== false ? (
                  <span className="flex items-center gap-1 rounded-full bg-state-ok/10 px-2.5 py-0.5 text-[11px] font-bold text-state-ok">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("profile.active")}
                  </span>
                ) : (
                  <span className="rounded-full bg-state-neutral/10 px-2.5 py-0.5 text-[11px] font-bold text-state-neutral">
                    {t("profile.inactive")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-app-dim">{profile?.email ?? "—"}</p>
            </div>
          </div>
        </section>

        {isAdmin && (
          <PanelCard>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <SectionTitle>{t("settings.nightShiftTitle")}</SectionTitle>
                <p className="mt-1 text-sm text-app-dim">{t("settings.nightShiftDescription")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={farmSettingsQ.data?.turno_noche_habilitado ?? false}
                disabled={farmSettingsQ.isLoading || farmSettingsQ.isError || farmSettingsMutation.isPending}
                onClick={() => farmSettingsMutation.mutate({ turno_noche_habilitado: !farmSettingsQ.data?.turno_noche_habilitado })}
                className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${farmSettingsQ.data?.turno_noche_habilitado ? "bg-state-ok/10 text-state-ok" : "bg-app-bg text-app-dim"}`}
              >
                {farmSettingsQ.data?.turno_noche_habilitado ? t("settings.nightShiftEnabled") : t("settings.nightShiftDisabled")}
              </button>
            </div>
            {(farmSettingsQ.isError || farmSettingsMutation.isError) && <p role="alert" className="mt-3 text-sm text-state-critica">{t("settings.toast.saveError")}</p>}
          </PanelCard>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Account data */}
          <PanelCard className="h-full">
            <SectionTitle className="mb-3">{t("profile.accountData")}</SectionTitle>
            <InfoRow label={t("profile.username")} value={<span className="font-mono text-sm">{profile?.username}</span>} />
            <InfoRow label={t("profile.email")} value={profile?.email} />
            <InfoRow label={t("profile.systemRole")} value={
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-semibold">{roleInfo.label}</span>
                {role && <span className="font-mono text-[10px] text-app-dim">({role})</span>}
              </div>
            } />
            <InfoRow label={t("profile.normalizedRole")} value={<span className="font-mono text-xs">{normalizedRole}</span>} />
            <InfoRow label={t("profile.admin")} value={isAdmin ? (
              <span className="font-semibold text-brand-dark">{t("profile.yes")}</span>
            ) : (
              <span className="text-app-dim">{t("profile.no")}</span>
            )} />
            <InfoRow label={t("common.status")} value={
              profile?.activo !== false
                ? <span className="font-semibold text-state-ok">{t("profile.active")}</span>
                : <span className="font-semibold text-state-neutral">{t("profile.inactive")}</span>
            } />

            {/* Quick links */}
            <div className="mt-4 border-t border-app-border pt-4">
              <p className="mb-2 text-xs font-semibold text-app-dim">{t("profile.quickLinks")}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { href: "/dashboard", label: t("profile.links.dashboard"), Icon: Activity },
                  ...(isAdmin ? [
                    { href: "/settings", label: t("nav.settings"), Icon: Settings2 },
                    { href: "/audit-log", label: t("nav.auditLog"), Icon: ShieldCheck },
                  ] : []),
                  { href: "/predictions", label: t("nav.predictions"), Icon: BrainCircuit },
                ].map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-dim hover:border-brand/30 hover:text-brand"
                  >
                    <Icon className="h-3.5 w-3.5 text-brand" />
                    {label}
                  </Link>
                ))}
                <TvModeButton />
              </div>
            </div>
          </PanelCard>

          {/* Capabilities summary */}
          <PanelCard className="h-full">
            <SectionTitle className="mb-3">{t("profile.capabilitiesTitle", { role: roleInfo.label })}</SectionTitle>
            <div className="space-y-4">
              {CAPABILITY_GROUPS.map((group) => {
                const available = group.caps.filter((cap) => can(cap));
                const total = group.caps.length;
                if (total === 0) return null;
                return (
                  <div key={group.id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">{t(`profile.capabilityGroups.${group.id}`)}</p>
                      <span className="text-[10px] text-app-dim">{available.length}/{total}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {group.caps.map((cap) => {
                        const allowed = can(cap);
                        return (
                          <span
                            key={cap}
                            title={t(`profile.capabilities.${cap}`, { defaultValue: cap })}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              allowed
                                ? "bg-brand/10 text-brand-dark"
                                : "bg-app-surface2 text-app-dim line-through opacity-50"
                            }`}
                          >
                            {t(`profile.capabilities.${cap}`, { defaultValue: cap })}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>
        </div>

        {/* ── Preferences section ── */}
        <PanelCard>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <Languages className="h-5 w-5 text-brand" strokeWidth={1.5} />
              </div>
              <div>
                <SectionTitle>{t("common.language")}</SectionTitle>
                <p className="mt-0.5 text-xs text-app-dim">
                  {t("profile.languageDescription")}
                </p>
              </div>
            </div>
            <div className="w-40">
              <LanguageSwitcher variant="panel" />
            </div>
          </div>
        </PanelCard>

        {/* ── Worker mode section ── */}
        <PanelCard>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <SectionTitle>{t("profile.workerMode.title")}</SectionTitle>
              <p className="mt-0.5 text-xs text-app-dim">
                {t("profile.workerMode.description")}
              </p>
            </div>
            <span className="rounded-full bg-state-atencion/10 px-2.5 py-0.5 text-[10px] font-bold text-state-atencion">
              {t("profile.workerMode.localBadge")}
            </span>
          </div>

          {/* Active worker */}
          {activeWorker ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-brand/20 bg-brand/5 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-app-text">{activeWorker.name}</p>
                <p className="text-xs capitalize text-app-dim">{t("profile.workerMode.operationalRole", { role: enumLabel("employeeRole", activeWorker.role) })}</p>
              </div>
              <button
                type="button"
                onClick={clearWorker}
                className="flex items-center gap-1 rounded-[10px] border border-state-critica/20 bg-white px-3 py-1.5 text-xs font-semibold text-state-critica hover:bg-state-critica/5"
              >
                <X className="h-3.5 w-3.5" />
                {t("profile.workerMode.remove")}
              </button>
            </div>
          ) : (
            <div className="mb-4 rounded-[10px] border border-dashed border-app-border bg-app-bg px-4 py-3 text-sm text-app-dim">
              {t("profile.workerMode.noWorker")}
            </div>
          )}

          {/* Selector */}
          <div className="space-y-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-dim">
              {t("profile.workerMode.selectEmployee")}
            </p>

            {employeesQ.isLoading && (
              <div className="h-11 animate-pulse rounded-[10px] bg-app-surface2" />
            )}

            {employeesQ.isError && (
              <p className="text-sm text-state-critica">{t("profile.workerMode.loadError")}</p>
            )}

            {!employeesQ.isLoading && (employeesQ.data ?? []).length === 0 && (
              <p className="text-sm text-app-dim">{t("profile.workerMode.noEmployees")}</p>
            )}

            {(employeesQ.data ?? []).length > 0 && (
              <div className="flex gap-2">
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="h-11 flex-1 rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none focus:border-brand"
                >
                  <option value="">{t("profile.workerMode.selectPlaceholder")}</option>
                  {(employeesQ.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {[e.nombre, e.apellidos].filter(Boolean).join(" ")}
                      {e.role ? ` · ${enumLabel("employeeRole", e.role)}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedEmployeeId}
                  onClick={applyWorker}
                  className="rounded-[10px] bg-brand-dark px-4 text-sm font-bold text-white hover:bg-sidebar-bg disabled:opacity-40"
                >
                  {t("profile.workerMode.apply")}
                </button>
              </div>
            )}
          </div>

          <p className="mt-4 text-[11px] text-app-dim">
            <strong>{t("profile.workerMode.noteLabel")}</strong> {t("profile.workerMode.noteText")}
            {/* TODO (Phase 13): Cuando el backend exponga POST /auth/select-worker o
                vinculación usuario↔empleado, reemplazar esta selección local
                por una sesión de trabajador real con permisos aplicados globalmente. */}
          </p>
        </PanelCard>
      </div>
    </div>
  );
}
