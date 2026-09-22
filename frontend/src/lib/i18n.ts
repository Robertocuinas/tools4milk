import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "@/locales/es.json";
import en from "@/locales/en.json";
import gl from "@/locales/gl.json";
import fr from "@/locales/fr.json";

export const SUPPORTED_LANGUAGES = ["es", "en", "gl", "fr"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "t4m-language";
const DEFAULT_LANGUAGE: Language = "es";

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return value != null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

// Distingue "nunca se eligio idioma explicitamente" de "se eligio 'es'"
// para poder aplicar el idioma_preferente del empleado solo la primera vez
// (T5), sin pisar una eleccion manual posterior en el selector de idioma.
export function hasStoredLanguage(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}

export function setLanguage(lang: Language) {
  i18n.changeLanguage(lang);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      gl: { translation: gl },
      fr: { translation: fr },
    },
    lng: getStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

export default i18n;
