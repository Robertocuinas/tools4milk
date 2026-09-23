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

// Nombre de cada idioma en su propia lengua (endonimo): se muestra igual sea
// cual sea el idioma activo para que el usuario reconozca siempre el suyo.
const LANGUAGE_NATIVE_NAMES: Record<Language, string> = {
  es: "Español",
  en: "English",
  gl: "Galego",
  fr: "Français",
  ar: "العربية",
};

type LanguageSwitcherProps = {
  /** "sidebar" = pill compacta para el pie oscuro de la barra lateral,
   * "panel" = tarjeta clara para ajustes/perfil,
   * "compact" = pill clara pequena para la cabecera movil y el login */
  variant?: "sidebar" | "panel" | "compact";
};

const VARIANT_STYLES: Record<
  NonNullable<LanguageSwitcherProps["variant"]>,
  { wrapper: string; button: string; active: string; idle: string }
> = {
  sidebar: {
    wrapper: "flex overflow-hidden rounded-[10px] border border-sidebar-border",
    button: "flex-1 px-2.5 py-1.5 text-[11px] font-extrabold transition",
    active: "bg-sidebar-border text-sidebar-active",
    idle: "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
  },
  panel: {
    wrapper: "flex overflow-hidden rounded-[10px] border border-app-border bg-white",
    button: "flex-1 px-4 py-2 text-sm font-semibold transition",
    active: "bg-app-bg text-brand-dark",
    idle: "text-app-dim hover:text-app-text",
  },
  compact: {
    wrapper: "flex overflow-hidden rounded-lg border border-app-border bg-white",
    button: "min-h-[32px] min-w-[30px] px-1.5 text-[10px] font-extrabold transition",
    active: "bg-app-bg text-brand-dark",
    idle: "text-app-dim hover:text-app-text",
  },
};

export function LanguageSwitcher({ variant = "panel" }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language) as Language;
  const styles = VARIANT_STYLES[variant];

  return (
    // dir="ltr": el orden de los botones (ES EN GL FR AR) se mantiene estable
    // al cambiar a arabe, asi el selector no "salta" bajo el cursor.
    <div role="group" aria-label={t("languageSwitcher.label")} dir="ltr" className={styles.wrapper}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          onClick={() => setLanguage(lang)}
          aria-pressed={current === lang}
          aria-label={LANGUAGE_NATIVE_NAMES[lang]}
          title={LANGUAGE_NATIVE_NAMES[lang]}
          className={`${styles.button} ${current === lang ? styles.active : styles.idle}`}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
