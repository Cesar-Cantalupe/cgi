const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../src/environments/environment.prod.ts');
const placeholder = 'API_KEY_PLACEHOLDER';

try {
  let content = fs.readFileSync(envPath, 'utf8');

  if (content.includes(placeholder)) {
    return; // Ya tiene el placeholder, nada que restaurar
  }

  content = content.replace(/apiKey:\s*'[^']*'/, `apiKey: '${placeholder}'`);
  content = content.replace(/firebaseApiKey:\s*'[^']*'/, `firebaseApiKey: ''`);
  content = content.replace(/firebaseAuthDomain:\s*'[^']*'/, `firebaseAuthDomain: ''`);
  content = content.replace(/firebaseProjectId:\s*'[^']*'/, `firebaseProjectId: ''`);
  content = content.replace(/firebaseAppId:\s*'[^']*'/, `firebaseAppId: ''`);
  content = content.replace(/firebaseStorageBucket:\s*'[^']*'/, `firebaseStorageBucket: ''`);
  content = content.replace(/firebaseMessagingSenderId:\s*'[^']*'/, `firebaseMessagingSenderId: ''`);

  fs.writeFileSync(envPath, content, 'utf8');
} catch (error) {
  console.error('❌ Error al restaurar el placeholder:', error.message);
  process.exit(1);
}
