/**
 * Verifica conexión y datos de traducciones en Firestore.
 * Uso: npm run test:firebase
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const { I18N_TRANSLATIONS_COLLECTION } = require('./i18n-firestore-util');

const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  console.error('❌ Define FIREBASE_SERVICE_ACCOUNT_PATH en .env.local');
  process.exit(1);
}

const resolvedPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(root, serviceAccountPath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ No se encontró: ${resolvedPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

(async () => {
  const snapshot = await db.collection(I18N_TRANSLATIONS_COLLECTION).limit(1).get();

  if (snapshot.empty) {
    console.log('⚠ Colección vacía o inexistente.');
    console.log('   → Ejecuta npm run i18n:push para subir las traducciones desde los JSON.');
    process.exit(1);
  }

  const countSnap = await db.collection(I18N_TRANSLATIONS_COLLECTION).count().get();
  const total = countSnap.data().count;

  const sample = await db
    .collection(I18N_TRANSLATIONS_COLLECTION)
    .where('locale', '==', 'en')
    .limit(3)
    .get();

  console.log(`✓ Firestore conectado — ${total} traducciones en ${I18N_TRANSLATIONS_COLLECTION}`);
  console.log('  Muestra (locale=en):');
  sample.forEach((doc) => {
    const d = doc.data();
    console.log(`    - ${d.namespace}.${d.key} = "${String(d.value).slice(0, 50)}..."`);
  });
})();
