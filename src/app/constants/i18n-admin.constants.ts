export const I18N_LOCALES = ['en', 'es', 'fr', 'de', 'ca', 'el'] as const;

export type I18nLocale = (typeof I18N_LOCALES)[number];

export const I18N_NAMESPACES = [
  'HEADER',
  'FOOTER',
  'SUGGESTIONS',
  'SOURCES',
  'FEEDBACK',
  'SIDEBAR',
  'WELCOME',
  'HOME',
  'LEGAL',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export const I18N_LOCALE_LABELS: Record<I18nLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ca: 'Català',
  el: 'Ελληνικά',
};

export const I18N_NAMESPACE_LABELS: Record<I18nNamespace, string> = {
  HEADER: 'Cabecera',
  FOOTER: 'Pie de página',
  SUGGESTIONS: 'Sugerencias',
  SOURCES: 'Fuentes',
  FEEDBACK: 'Feedback',
  SIDEBAR: 'Barra lateral',
  WELCOME: 'Bienvenida',
  HOME: 'Inicio',
  LEGAL: 'Legal',
};
