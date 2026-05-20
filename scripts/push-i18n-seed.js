/**
 * Sube traducciones a Supabase desde src/assets/i18n/*.json
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (Settings → API → service_role)
 * No usar la service role en Angular — solo en este script local.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PRIORITY_NAMESPACES = [
  'HEADER', 'FOOTER', 'SUGGESTIONS', 'SOURCES', 'FEEDBACK',
  'SIDEBAR', 'WELCOME', 'HOME', 'LEGAL',
];
const LOCALES = ['en', 'es', 'fr', 'de', 'ca', 'el'];
const BATCH = 100;

if (!url || !serviceKey) {
  console.error('❌ Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  console.error('   (Dashboard → Settings → API → service_role — solo para scripts locales)');
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

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const rows = loadAllRows();
  console.log(`Subiendo ${rows.length} traducciones...`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('i18n_translations')
      .upsert(chunk, { onConflict: 'namespace,key,locale' });

    if (error) {
      console.error('❌ Error en lote', i, error.message);
      process.exit(1);
    }
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}\r`);
  }

  console.log(`\n✓ ${rows.length} filas insertadas/actualizadas`);
})();
