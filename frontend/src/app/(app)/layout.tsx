"use client";

import {
  Activity,
  AlertOctagon,
  ArrowLeftRight,
  BarChart3,
  Beef,
  BrainCircuit,
  CalendarClock,
  Droplets,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPin,
  Milk,
  Package,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Capability } from "@/lib/role-capabilities";
import { roleDisplayName } from "@/lib/role-capabilities";
import { useActiveWorkerStore } from "@/lib/active-worker-store";
import { usePermissions } from "@/lib/use-permissions";
import { useAppStore } from "@/store/app-store";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

type NavItem = {
  href: string;
  labelKey: string;
  Icon: typeof LayoutDashboard;
  /** If set, item is only shown when the user has this capability */
  capability?: Capability;
};

const navGroups: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "",
    items: [
      { href: "/dashboard", labelKey: "nav.control", Icon: LayoutDashboard },
      { href: "/report", labelKey: "nav.report", Icon: BarChart3, capability: "view_report" },
    ],
  },
  {
    labelKey: "nav.operations",
    items: [
      { href: "/leanfarming", labelKey: "nav.leanfarming", Icon: ListTodo },
      { href: "/incidents", labelKey: "nav.incidents", Icon: AlertOctagon },
      { href: "/shifts", labelKey: "nav.shifts", Icon: CalendarClock },
      { href: "/quality", labelKey: "nav.quality", Icon: Droplets },
      { href: "/predictions", labelKey: "nav.predictions", Icon: BrainCircuit, capability: "view_predictions" },
    ],
  },
  {
    labelKey: "nav.farm",
    items: [
      { href: "/zones", labelKey: "nav.zones", Icon: MapPin },
      { href: "/handover", labelKey: "nav.handover", Icon: ArrowLeftRight, capability: "view_handover" },
      { href: "/orders", labelKey: "nav.orders", Icon: Package, capability: "manage_orders" },
      { href: "/animals", labelKey: "nav.animals", Icon: Beef },
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      { href: "/profile", labelKey: "nav.profile", Icon: UserRound },
      // Items below require specific capabilities — hidden for non-admin roles
      { href: "/management", labelKey: "nav.management", Icon: Settings2, capability: "view_management" },
      { href: "/settings", labelKey: "nav.settings", Icon: SlidersHorizontal, capability: "manage_settings" },
      { href: "/integration", labelKey: "nav.integration", Icon: Activity, capability: "view_integration" },
      { href: "/audit-log", labelKey: "nav.auditLog", Icon: ShieldCheck, capability: "view_audit_log" },
    ],
  },
];

function LogoMark() {
  return (
    <div className="t4m-logo grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white shadow-brand">
      <Milk className="h-4.5 w-4.5" strokeWidth={2.4} />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const hydrate = useAppStore((state) => state.hydrate);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const token = useAppStore((state) => state.token);
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const { can, role } = usePermissions();
  const workerHydrate = useActiveWorkerStore((s) => s.hydrate);
  const activeWorker = useActiveWorkerStore((s) => s.worker);

  useEffect(() => {
    hydrate();
    workerHydrate();
  }, [hydrate, workerHydrate]);

  useEffect(() => {
    if (isHydrated && !token) router.replace("/");
  }, [isHydrated, token, router]);

  if (!isHydrated || !token) {
    return (
      <div className="grid min-h-screen place-items-center bg-app-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen bg-app-bg font-body text-app-text">
      {/* ── Sidebar ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
          <LogoMark />
          <div className="min-w-0">
            <div className="font-heading text-[15px] font-bold leading-none text-white">
              {t("nav.brand")}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-sidebar-dim">
              {t("nav.controlCenter")}
            </div>
          </div>
        </div>

        {/* Navigation — items filtered by capability */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navGroups.map((group) => {
            // Filter items: show if no capability required, or user has the capability
            const visibleItems = group.items.filter(
              (item) => !item.capability || can(item.capability),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.labelKey || "root"} className="mb-4">
                {group.labelKey && (
                  <p className="mb-1 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-sidebar-dim2">
                    {t(group.labelKey)}
                  </p>
                )}
                {visibleItems.map(({ href, labelKey, Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-sidebar-active-bg text-sidebar-active-text"
                          : "text-sidebar-dim hover:bg-sidebar-hover hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-active-text" : "text-sidebar-dim2"}`}
                        strokeWidth={2}
                      />
                      {t(labelKey)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="space-y-1.5 border-t border-sidebar-border px-2 py-3">
          <Link href="/profile" className="block rounded-[10px] bg-sidebar-card-bg px-3 py-2.5 transition hover:bg-sidebar-hover">
            <div className="truncate text-xs font-bold text-white">
              {user?.username ?? "Usuario"}
            </div>
            <div className="mt-0.5 text-[11px] capitalize text-sidebar-dim">
              {roleDisplayName(role)}
            </div>
            {activeWorker && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[9px] text-sidebar-dim2">▸</span>
                <span className="truncate text-[10px] font-semibold text-sidebar-dim">
                  {activeWorker.name}
                </span>
                <span className="shrink-0 rounded bg-sidebar-border px-1 text-[9px] text-sidebar-dim2">{t("nav.local")}</span>
              </div>
            )}
          </Link>
          <LanguageSwitcher variant="sidebar" />
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold text-sidebar-dim transition hover:bg-state-critica/10 hover:text-state-critica"
          >
            <LogOut className="h-4 w-4" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
