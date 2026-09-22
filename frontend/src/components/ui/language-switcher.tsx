"use client";

import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage, type Language } from "@/lib/i18n";

const LANGUAGE_LABELS: Record<Language, string> = {
  es: "ES",
  en: "EN",
  gl: "GL",
  fr: "FR",
  ar: "AR",
};

type LanguageSwitcherProps = {
  /** "sidebar" = compact pill for the dark sidebar footer, "panel" = light card for settings/profile pages */
  variant?: "sidebar" | "panel";
};

export function LanguageSwitcher({ variant = "panel" }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const current = i18n.language as Language;

  if (variant === "sidebar") {
    return (
      <div className="flex overflow-hidden rounded-[10px] border border-sidebar-border">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={current === lang}
            className={`flex-1 px-2.5 py-1.5 text-[11px] font-extrabold transition ${
              current === lang
                ? "bg-sidebar-border text-sidebar-active"
                : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
            }`}
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-[10px] border border-app-border bg-white">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={current === lang}
          className={`flex-1 px-4 py-2 text-sm font-semibold transition ${
            current === lang ? "bg-app-bg text-brand-dark" : "text-app-dim hover:text-app-text"
          }`}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
