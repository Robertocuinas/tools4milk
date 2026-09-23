"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  HeartPulse,
  Loader2,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { UserRole } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

const roles: {
  value: UserRole;
  labelKey: string;
  shortKey: string;
  Icon: typeof ShieldCheck;
}[] = [
  { value: "admin", labelKey: "auth.roles.admin", shortKey: "auth.roles.adminShort", Icon: ShieldCheck },
  { value: "veterinario", labelKey: "auth.roles.veterinario", shortKey: "auth.roles.veterinarioShort", Icon: HeartPulse },
  { value: "alimentacion", labelKey: "auth.roles.alimentacion", shortKey: "auth.roles.alimentacionShort", Icon: Sprout },
];

// Auditoria post-implementacion (hallazgo 5.1): estas credenciales viven en
// el bundle de JS del cliente. Nunca deben mostrarse fuera de un entorno de
// desarrollo — cualquiera que abra la URL publica en Azure podia leerlas
// directamente del JS servido. Ver NEXT_PUBLIC_ENVIRONMENT en Dockerfile /
// docker-compose.yml.
const isDemoAccessEnabled = process.env.NEXT_PUBLIC_ENVIRONMENT !== "production";

const demoUsers = isDemoAccessEnabled
  ? [
      { username: "admin", role: "admin" as const, labelKey: "auth.demo.users.admin", password: "testpass123" },
      { username: "roberto.castro", role: "admin" as const, labelKey: "auth.demo.users.manager", password: "testpass123" },
      { username: "operario.zona", role: "operario" as const, labelKey: "auth.demo.users.milkingParlour", password: "testpass123" },
      { username: "laura.fernandez", role: "alimentacion" as const, labelKey: "auth.demo.users.feeding", password: "testpass123" },
      { username: "dr.mendez", role: "veterinario" as const, labelKey: "auth.demo.users.vet", password: "testpass123" },
    ]
  : [];

function StatusDot({ online, loading = false }: { online: boolean; loading?: boolean }) {
  return (
    <span className={`h-2.5 w-2.5 rounded-full ${
      loading ? "animate-pulse bg-state-atencion"
      : online ? "bg-tv-accent"
      : "bg-state-critica"
    }`} />
  );
}

// Traduce los errores conocidos del login por codigo HTTP; el resto se
// muestra tal cual (texto libre del backend o error de red ya traducido).
function loginErrorMessage(error: Error, t: (key: string) => string): string {
  const status = (error as Error & { status?: number }).status;
  if (status === 429) return t("auth.errors.tooManyAttempts");
  if (status === 401) return t("auth.errors.invalidCredentials");
  return error.message;
}

export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const hydrate = useAppStore((state) => state.hydrate);
  const token = useAppStore((state) => state.token);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const selectedRole = useAppStore((state) => state.selectedRole);
  const setSelectedRole = useAppStore((state) => state.setSelectedRole);
  const setSession = useAppStore((state) => state.setSession);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    if (isHydrated && token) router.replace("/dashboard");
  }, [isHydrated, token, router]);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    retry: 1,
    refetchInterval: 30_000,
  });

  const activeRole = useMemo(
    () => roles.find((r) => r.value === selectedRole) ?? roles[2],
    [selectedRole],
  );

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: (data) => {
      const realRole = data.user.role ?? selectedRole;
      setSelectedRole(realRole);
      setSession(data.token.access_token, data.user);
      setRedirecting(true);
      router.push("/dashboard");
    },
  });

  const backendOnline = health.isSuccess && health.data.status === "ok";
  const isLoading = loginMutation.isPending || redirecting;

  function submitLogin() {
    if (!username.trim() || password.length < 3 || isLoading) return;
    loginMutation.mutate({ username: username.trim(), password });
  }

  if (redirecting) {
    return (
      <main className="grid min-h-screen place-items-center bg-tv-bg px-6 font-body text-white">
        <section className="text-center">
          <BrandLogo variant="mark" theme="light" size={80} className="mx-auto object-contain" />
          <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-tv-accent/20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-tv-accent border-t-transparent" />
          </div>
          <h1 className="mt-6 font-heading text-3xl font-bold">{t("auth.welcome", { name: username })}</h1>
          <p className="mt-2 text-sm text-tv-dim">
            {t("auth.openingPanel", { role: t(activeRole.labelKey).toLowerCase() })}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden font-body">
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[58fr_42fr]">

        {/* ── Left panel — Visual brand showcase ────────────────────────── */}
        <section className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-dark via-brand to-sidebar-bg p-10 lg:flex lg:p-12">
          {/* Decorative elements */}
          <div className="absolute inset-0 overflow-hidden opacity-10">
            <div className="absolute start-10 top-20 text-9xl font-bold text-white/30">»</div>
            <div className="absolute bottom-32 end-20 text-8xl font-bold text-white/20">»</div>
            <div className="absolute start-1/3 top-1/2 text-7xl font-bold text-white/15">»</div>
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* Logo */}
            <BrandLogo variant="full" size={200} className="rounded-xl bg-white p-3 shadow-lg" />
          </div>

          {/* Main content */}
          <div className="relative z-10 space-y-6">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-white/60">
                {t("auth.showcase.eyebrow")}
              </div>
              <h1 className="mt-4 max-w-md font-heading text-5xl font-bold leading-tight text-white">
                {t("auth.showcase.title")}
              </h1>
            </div>
            <p className="max-w-md text-white/80">
              {t("auth.showcase.description")}
            </p>
          </div>

          {/* Footer */}
          <div className="relative z-10 border-t border-white/20 pt-6">
            <span className="flex items-center gap-2 text-sm font-semibold text-white/70">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent"></span>
              {t("auth.showcase.footer")}
            </span>
          </div>
        </section>

        {/* ── Right panel — Login form ────────────────────────────────── */}
        <section className="flex flex-col items-center justify-center bg-app-bg px-6 py-12 sm:px-8 lg:bg-app-bg">
          <div className="w-full max-w-md">
            {/* Mobile logo — visible only on small screens */}
            <div className="mb-8 flex lg:hidden flex-col items-center">
              <BrandLogo variant="full" size={170} className="rounded-xl bg-white p-2 shadow-panel" />
            </div>

            {/* Form title + selector de idioma (permite cambiar antes de entrar) */}
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="font-heading text-3xl font-bold text-brand-dark">
                {t("auth.title")}
              </h2>
              <LanguageSwitcher variant="compact" />
            </div>

            {/* Login form */}
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); submitLogin(); }}
            >
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-brand-dark">
                  {t("auth.username")}
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("auth.usernamePlaceholder")}
                  autoComplete="username"
                  className="w-full rounded-2xl border-2 border-app-border bg-white px-5 py-3 text-sm font-semibold text-brand-dark outline-none transition placeholder:text-app-dim focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wide text-brand-dark">
                    {t("auth.password")}
                  </label>
                  {/* No hay flujo de recuperacion de contrasena implementado
                      (ni backend ni frontend); un enlace href="#" fingia una
                      accion que no existe. Texto informativo en su lugar. */}
                  <span className="text-xs font-semibold text-app-dim" title={t("auth.forgotPasswordTitle")}>
                    {t("auth.forgotPassword")}
                  </span>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.password")}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border-2 border-app-border bg-white px-5 py-3 text-sm font-semibold text-brand-dark outline-none transition placeholder:text-app-dim focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>

              {loginMutation.isError && (
                <div className="rounded-2xl border-2 border-state-critica bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
                  {loginErrorMessage(loginMutation.error, t)}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !username.trim() || password.length < 3}
                className="mt-6 w-full rounded-2xl bg-gradient-to-br from-brand to-brand-dark px-6 py-4 font-heading text-lg font-bold text-white shadow-lg transition hover:from-brand-dark hover:to-sidebar-bg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("auth.authenticating")}
                  </span>
                ) : (
                  t("auth.submit")
                )}
              </button>
            </form>

            {/* Demo access — solo fuera de produccion, ver hallazgo 5.1 */}
            {isDemoAccessEnabled && (
              <div className="mt-8 rounded-2xl border-2 border-app-border bg-white p-5">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark">
                  {t("auth.demo.title")}
                </h3>
                <p className="mb-4 text-xs text-app-dim">
                  {t("auth.demo.description")}
                </p>
                <div className="space-y-2">
                  {demoUsers.slice(1, 4).map((demo) => (
                    <button
                      key={demo.username}
                      type="button"
                      onClick={() => {
                        setUsername(demo.username);
                        setPassword(demo.password);
                        setSelectedRole(demo.role);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-start transition hover:bg-brand-light"
                    >
                      <span className="font-mono text-sm font-semibold text-brand-dark">{demo.username}</span>
                      <span className="text-xs text-app-dim">{t(demo.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Backend status — small indicator */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-app-dim">
              <StatusDot online={backendOnline} loading={health.isLoading} />
              {health.isLoading ? t("auth.health.checking")
                : backendOnline ? t("auth.health.online")
                : t("auth.health.offline")}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
