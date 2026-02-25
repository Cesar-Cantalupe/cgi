const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../src/environments/environment.prod.ts');
const placeholder = 'API_KEY_PLACEHOLDER';

try {
  let content = fs.readFileSync(envPath, 'utf8');

  if (content.includes(placeholder)) {
    return; // Ya tiene el placeholder, nada que restaurar
  }

  // Reemplazar cualquier apiKey por el placeholder
  content = content.replace(/apiKey:\s*'[^']*'/, `apiKey: '${placeholder}'`);

  fs.writeFileSync(envPath, content, 'utf8');
} catch (error) {
  console.error('❌ Error al restaurar el placeholder:', error.message);
  process.exit(1);
}
