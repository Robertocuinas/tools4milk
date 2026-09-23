// Constantes de idioma sin dependencias de React/i18next: se pueden importar
// desde Server Components (p. ej. app/layout.tsx para el script inline).

export const SUPPORTED_LANGUAGES = ["es", "en", "gl", "fr", "ar"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// T6: unico idioma RTL soportado por ahora. Determina la direccion del
// documento (ver setLanguage) y la carga condicional de fuente arabe.
export const RTL_LANGUAGES: readonly Language[] = ["ar"];

export const STORAGE_KEY = "t4m-language";
export const DEFAULT_LANGUAGE: Language = "es";

/** Script inline que se ejecuta en <head> antes del primer pintado: lee el
 * idioma guardado y fija lang/dir en <html> para que la pagina no "salte" de
 * LTR a RTL al hidratar. Si el idioma no es el de por defecto oculta el body
 * (clase t4m-lang-pending) hasta que React haya re-renderizado los textos en
 * ese idioma; un temporizador de seguridad la quita si algo falla. */
export const LANGUAGE_BOOTSTRAP_SCRIPT = `(function(){try{var l=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});var s=${JSON.stringify(SUPPORTED_LANGUAGES)};var r=${JSON.stringify(RTL_LANGUAGES)};if(s.indexOf(l)<0)l=${JSON.stringify(
  DEFAULT_LANGUAGE,
)};var h=document.documentElement;h.lang=l;h.dir=r.indexOf(l)>=0?"rtl":"ltr";if(l!==${JSON.stringify(
  DEFAULT_LANGUAGE,
)}){h.classList.add("t4m-lang-pending");setTimeout(function(){h.classList.remove("t4m-lang-pending")},1500);}}catch(e){}})();`;
