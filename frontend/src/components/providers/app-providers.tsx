"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@/components/ui/toast";
import i18n, { getStoredLanguage } from "@/lib/i18n";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = getStoredLanguage();
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
