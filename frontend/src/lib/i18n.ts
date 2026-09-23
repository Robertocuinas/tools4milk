import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "@/locales/es.json";
import en from "@/locales/en.json";
import gl from "@/locales/gl.json";
import fr from "@/locales/fr.json";
import ar from "@/locales/ar.json";

import {
  DEFAULT_LANGUAGE,
  RTL_LANGUAGES,
  STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/lib/i18n-config";

export { LANGUAGE_BOOTSTRAP_SCRIPT, SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n-config";

export function isRtl(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}


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

// Grupos de valores enumerados que devuelve el backend (estados, severidades,
// roles...). Sus etiquetas viven en el namespace "enums" de los locales.
export type EnumGroup = keyof (typeof es)["enums"];

/** Traduce un valor enumerado del backend (p. ej. estado "en_gestion") a la
 * etiqueta del idioma activo. Si el valor no esta en el mapa se muestra el
 * codigo "humanizado" (guiones bajos -> espacios, primera letra mayuscula)
 * para no enseñar nunca una clave i18n cruda. Debe llamarse desde un
 * componente que use useTranslation() para re-renderizar al cambiar idioma. */
export function enumLabel(group: EnumGroup, value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const humanized = value.replace(/_/g, " ");
  return i18n.t(`enums.${group}.${value}`, {
    defaultValue: humanized.charAt(0).toUpperCase() + humanized.slice(1),
  });
}

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return value != null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// Distingue "nunca se eligio idioma explicitamente" de "se eligio 'es'"
// para poder aplicar el idioma_preferente del empleado solo la primera vez
// (T5), sin pisar una eleccion manual posterior en el selector de idioma.
export function hasStoredLanguage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

/** Refleja el idioma en <html> (lang y dir). Al volver a un idioma LTR se
 * fija dir="ltr" explicitamente para no dejar restos del modo RTL (fuentes
 * y variantes rtl: de Tailwind dependen solo de este atributo). */
export function applyDocumentLanguage(lang: Language) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = isRtl(lang) ? "rtl" : "ltr";
}

export function setLanguage(lang: Language) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Modo privado / almacenamiento bloqueado: el idioma se aplica igualmente
      // durante la sesion aunque no se pueda persistir.
    }
  }
  applyDocumentLanguage(lang);
  void i18n.changeLanguage(lang);
}

const warnedMissingKeys = new Set<string>();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      gl: { translation: gl },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    // Fase D: se arranca SIEMPRE en el idioma por defecto, igual que el HTML
    // renderizado en servidor, para que la hidratacion coincida. AppProviders
    // aplica el idioma guardado justo despues de hidratar (ver
    // LANGUAGE_BOOTSTRAP_SCRIPT para evitar el parpadeo).
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // Una traduccion vacia o nula cae al idioma de respaldo en vez de pintar
    // una cadena en blanco.
    returnEmptyString: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    saveMissing: false,
    // Clave inexistente tambien en el idioma de respaldo: en desarrollo se
    // avisa por consola (una vez por clave) para detectarla pronto. Si la
    // llamada trae defaultValue se usa ese texto en vez de la clave cruda.
    parseMissingKeyHandler: (key, defaultValue) => {
      if (process.env.NODE_ENV !== "production" && defaultValue === undefined && !warnedMissingKeys.has(key)) {
        warnedMissingKeys.add(key);
        console.warn(`[i18n] clave sin traducir: ${key}`);
      }
      return defaultValue ?? key;
    },
  });
  // Cualquier cambio de idioma (selector, idioma_preferente, bootstrap)
  // mantiene sincronizados lang/dir del documento.
  i18n.on("languageChanged", (lng) => {
    const base = lng.split("-")[0];
    if (isSupportedLanguage(base)) applyDocumentLanguage(base);
  });
}

export default i18n;
