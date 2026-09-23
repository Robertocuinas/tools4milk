"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@/components/ui/toast";
import i18n, { applyDocumentLanguage, getStoredLanguage } from "@/lib/i18n";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Fase D: i18n arranca en el idioma por defecto (igual que el HTML del
  // servidor) para que la hidratacion coincida. Justo despues de hidratar,
  // antes del pintado, se aplica el idioma guardado en localStorage.
  useLayoutEffect(() => {
    const lang = getStoredLanguage();
    applyDocumentLanguage(lang);
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
  }, []);

  // Los componentes con useTranslation se re-renderizan al suscribirse (efectos
  // pasivos); se espera un frame antes de mostrar el body que el script inline
  // de app/layout.tsx oculto con t4m-lang-pending, evitando el parpadeo de
  // textos en espanol.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.documentElement.classList.remove("t4m-lang-pending");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 5 * 60_000,
            staleTime: 45_000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <div aria-live="polite" aria-atomic="true" className="sr-only" id="app-live-region" />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
