/**
 * Verifica conexión y datos en i18n_translations.
 * Uso: node scripts/test-supabase-i18n.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Falta SUPABASE_URL o SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  const { count, error: countError } = await supabase
    .from('i18n_translations')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error:', countError.message);
    if (countError.message.includes('does not exist')) {
      console.error('   → Ejecuta la migración y seed.sql en el SQL Editor de Supabase.');
    }
    process.exit(1);
  }

  const { data: sample, error: sampleError } = await supabase
    .from('i18n_translations')
    .select('namespace, key, locale, value')
    .eq('locale', 'en')
    .eq('namespace', 'HEADER')
    .limit(3);

  if (sampleError) {
    console.error('❌ Error al leer muestra:', sampleError.message);
    process.exit(1);
  }

  console.log(`✓ Conexión OK — ${count ?? 0} filas en i18n_translations`);
  console.log('  Muestra (en / HEADER):', sample);
})();
