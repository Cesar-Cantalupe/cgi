export const I18N_TRANSLATIONS_COLLECTION = 'i18n_translations';

export function translationDocId(namespace: string, key: string, locale: string): string {
  return `${namespace}::${key}::${locale}`;
}

export function parseTranslationDocId(docId: string): {
  namespace: string;
  key: string;
  locale: string;
} | null {
  const parts = docId.split('::');
  if (parts.length < 3) {
    return null;
  }
  const locale = parts.pop()!;
  const namespace = parts.shift()!;
  const key = parts.join('::');
  return { namespace, key, locale };
}
