/**
 * Sube traducciones a Firestore desde src/assets/i18n/*.json
 * Requiere FIREBASE_SERVICE_ACCOUNT_PATH en .env.local
 * No usar la cuenta de servicio en Angular — solo en este script local.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const {
  I18N_TRANSLATIONS_COLLECTION,
  translationDocId,
} = require('./i18n-firestore-util');

const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

const PRIORITY_NAMESPACES = [
  'HEADER', 'FOOTER', 'SUGGESTIONS', 'SOURCES', 'FEEDBACK',
  'SIDEBAR', 'WELCOME', 'HOME', 'LEGAL',
];
const LOCALES = ['en', 'es', 'fr', 'de', 'ca', 'el'];
const BATCH = 400;

if (!serviceAccountPath) {
  console.error('❌ Define FIREBASE_SERVICE_ACCOUNT_PATH en .env.local');
  console.error('   (Firebase Console → Project settings → Service accounts → Generate new private key)');
  process.exit(1);
}

const resolvedPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(root, serviceAccountPath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ No se encontró el archivo de cuenta de servicio: ${resolvedPath}`);
  process.exit(1);
}

function flattenNamespace(namespace, obj, rows, locale) {
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenNamespace(namespace, val, rows, locale);
    } else {
      rows.push({ namespace, key, locale, value: String(val) });
    }
  }
}

function loadAllRows() {
  const i18nDir = path.join(root, 'src', 'assets', 'i18n');
  const rows = [];
  for (const locale of LOCALES) {
    const filePath = path.join(i18nDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const ns of PRIORITY_NAMESPACES) {
      if (!data[ns]) continue;
      flattenNamespace(ns, data[ns], rows, locale);
    }
  }
  return rows;
}

const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

(async () => {
  const rows = loadAllRows();
  console.log(`Subiendo ${rows.length} traducciones a Firestore...`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const batch = db.batch();

    for (const row of chunk) {
      const id = translationDocId(row.namespace, row.key, row.locale);
      const ref = db.collection(I18N_TRANSLATIONS_COLLECTION).doc(id);
      batch.set(ref, {
        namespace: row.namespace,
        key: row.key,
        locale: row.locale,
        value: row.value,
        updatedAt: new Date().toISOString(),
      });
    }

    await batch.commit();
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}\r`);
  }

  console.log(`\n✓ ${rows.length} documentos insertados/actualizados`);
})();
