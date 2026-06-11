const I18N_TRANSLATIONS_COLLECTION = 'i18n_translations';

function translationDocId(namespace, key, locale) {
  return `${namespace}::${key}::${locale}`;
}

module.exports = {
  I18N_TRANSLATIONS_COLLECTION,
  translationDocId,
};
