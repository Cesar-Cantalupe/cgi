/**
 * @deprecated Usa scripts/sync-env.js --prod --require-api-key (invocado desde npm run build).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error('❌ La variable de entorno para el acceso no está definida.');
    process.exit(1);
  }

  const envPath = path.join(__dirname, '../src/environments/environment.prod.ts');

  try {
    let content = fs.readFileSync(envPath, 'utf8');

    const placeholder = 'API_KEY_PLACEHOLDER';

    if (!content.includes(placeholder)) {
      console.error(`❌ No se encontró el placeholder "${placeholder}" en ${envPath}.`);
      process.exit(1);
    }

    content = content.replace(placeholder, apiKey);

    fs.writeFileSync(envPath, content, 'utf8');
  } catch (error) {
    console.error('❌ Error al inyectar variables de entorno:', error.message);
    process.exit(1);
  }
}