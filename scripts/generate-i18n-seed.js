/**
 * Genera supabase/seed.sql a partir de src/assets/i18n/*.json
 * Solo incluye los namespaces prioritarios definidos en PRIORITY_NAMESPACES.
 *
 * Uso: node scripts/generate-i18n-seed.js
 */

const fs = require('fs');
const path = require('path');

const PRIORITY_NAMESPACES = [
  'HEADER',
  'FOOTER',
  'SUGGESTIONS',
  'SOURCES',
  'FEEDBACK',
  'SIDEBAR',
  'WELCOME',
  'HOME',
  'LEGAL',
];

const LOCALES = ['en', 'es', 'fr', 'de', 'ca', 'el'];
const I18N_DIR = path.join(__dirname, '..', 'src', 'assets', 'i18n');
const OUT_FILE = path.join(__dirname, '..', 'supabase', 'seed.sql');

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function flattenNamespace(namespace, obj, rows) {
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenNamespace(namespace, val, rows);
    } else {
      rows.push({ namespace, key, value: String(val) });
    }
  }
}

function loadLocale(locale) {
  const filePath = path.join(I18N_DIR, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`Omitido (no existe): ${filePath}`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const rows = [];
  for (const ns of PRIORITY_NAMESPACES) {
    if (!data[ns]) {
      console.warn(`[${locale}] Namespace ausente: ${ns}`);
      continue;
    }
    flattenNamespace(ns, data[ns], rows);
  }
  return rows.map((r) => ({ ...r, locale }));
}

const allRows = LOCALES.flatMap(loadLocale);

const lines = [
  '-- Generado por scripts/generate-i18n-seed.js — no editar a mano',
  '-- Namespaces: ' + PRIORITY_NAMESPACES.join(', '),
  '',
  'insert into public.i18n_translations (namespace, key, locale, value)',
  'values',
];

const valueLines = allRows.map(
  (r) =>
    `  ('${escapeSql(r.namespace)}', '${escapeSql(r.key)}', '${escapeSql(r.locale)}', '${escapeSql(r.value)}')`
);

lines.push(valueLines.join(',\n'));
lines.push('on conflict (namespace, key, locale) do update set');
lines.push('  value = excluded.value,');
lines.push('  updated_at = now();');
lines.push('');

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(`Seed escrito: ${OUT_FILE} (${allRows.length} filas)`);
