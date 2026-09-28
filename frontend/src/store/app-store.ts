"use client";

import { create } from "zustand";
import { ACTIVE_ZONE_STORAGE_KEY } from "@/lib/config";
import { api, setCsrfToken } from "@/lib/api";
import type { AuthResponse, AuthUser, UserRole } from "@/lib/types";

type AppState = {
  activeZoneId: string;
  hasSession: boolean;
  user: AuthUser | null;
  selectedRole: UserRole;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveZone: (zoneId: string) => void;
  setSelectedRole: (role: UserRole) => void;
  setSession: (session: AuthResponse) => void;
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
};

let hydration: Promise<void> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  activeZoneId: "ordeno",
  hasSession: false,
  user: null,
  selectedRole: "operario",
  isHydrated: false,

  hydrate: async () => {
    if (typeof window === "undefined" || get().isHydrated) return;
    if (hydration) return hydration;
    hydration = (async () => {
      try {
        // Delete credentials left by versions using localStorage.
        window.localStorage.removeItem("t4m_token");
        window.localStorage.removeItem("t4m_user");
        document.cookie = "t4m_token=; path=/; max-age=0; SameSite=Lax";
        set({ activeZoneId: window.localStorage.getItem(ACTIVE_ZONE_STORAGE_KEY) ?? "ordeno" });
      } catch { /* Storage can be unavailable; authentication uses cookies. */ }
      try {
        get().setSession(await api.session());
      } catch {
        get().clearSession();
      } finally {
        set({ isHydrated: true });
        hydration = null;
      }
    })();
    return hydration;
  },

  setActiveZone: (activeZoneId) => {
    try { window.localStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, activeZoneId); } catch { /* Optional preference. */ }
    set({ activeZoneId });
  },
  setSelectedRole: (selectedRole) => set({ selectedRole }),
  setSession: (session) => {
    setCsrfToken(session.csrf_token);
    set({ user: session.user, hasSession: true, isHydrated: true });
  },
  setUser: (user) => set({ user }),
  clearSession: () => {
    setCsrfToken(null);
    set({ user: null, hasSession: false });
  },
  logout: async () => {
    try {
      await api.logout();
    } catch (error) {
      if ((error as { status?: number }).status !== 401 && (error as { status?: number }).status !== 403) throw error;
    }
    get().clearSession();
  },
}));
