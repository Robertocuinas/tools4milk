import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "@/locales/es.json";
import en from "@/locales/en.json";
import gl from "@/locales/gl.json";
import fr from "@/locales/fr.json";
import ar from "@/locales/ar.json";

export const SUPPORTED_LANGUAGES = ["es", "en", "gl", "fr", "ar"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// T6: unico idioma RTL soportado por ahora. Determina la direccion del
// documento (ver setLanguage) y la carga condicional de fuente arabe.
const RTL_LANGUAGES: readonly Language[] = ["ar"];

export function isRtl(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}

const STORAGE_KEY = "t4m-language";
const DEFAULT_LANGUAGE: Language = "es";

// Etiquetas BCP-47 para Intl / toLocaleDateString. Se usa "ar" sin region
// a proposito: ar-SA arrastra el calendario hijri y ar-EG los digitos
// arabigo-indicos, y el resto de la UI muestra numeros latinos.
const DATE_LOCALES: Record<Language, string> = {
  es: "es-ES",
  en: "en-GB",
  gl: "gl-ES",
  fr: "fr-FR",
  ar: "ar",
};

/** Traduce el idioma activo de i18next (p. ej. "gl" o "gl-ES") a la
 * etiqueta BCP-47 que deben usar las fechas y numeros formateados. */
export function dateLocale(lang: string | null | undefined): string {
  const base = lang?.split("-")[0];
  return isSupportedLanguage(base) ? DATE_LOCALES[base] : DATE_LOCALES[DEFAULT_LANGUAGE];
}

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
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      gl: { translation: gl },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    lng: getStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

export default i18n;
