/**
 * Angular no lee .env en runtime (a diferencia de Next.js).
 * Este script carga .env / .env.local y genera environment.ts (o environment.prod.ts).
 *
 * Uso:
 *   node scripts/sync-env.js          → desarrollo (environment.ts)
 *   node scripts/sync-env.js --prod   → producción (environment.prod.ts)
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const isProd = process.argv.includes('--prod');
const requireApiKey = process.argv.includes('--require-api-key');

// Mismo orden que Next: .env base, luego .env.local sobrescribe
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local'), override: true });

/** Nombre en .env.local  →  propiedad en environment.ts */
const ENV_MAP = {
  WEBSOCKET_URL: 'websocketUrl',
  API_KEY: 'apiKey',
  FIREBASE_API_KEY: 'firebaseApiKey',
  FIREBASE_AUTH_DOMAIN: 'firebaseAuthDomain',
  FIREBASE_PROJECT_ID: 'firebaseProjectId',
  FIREBASE_APP_ID: 'firebaseAppId',
  FIREBASE_STORAGE_BUCKET: 'firebaseStorageBucket',
  FIREBASE_MESSAGING_SENDER_ID: 'firebaseMessagingSenderId',
};

const DEFAULTS = {
  dev: {
    production: false,
    websocketUrl: 'wss://d2nrwi7jko6xiv.cloudfront.net/ws/query',
    apiKey: 'API_KEY_DEV',
    firebaseApiKey: '',
    firebaseAuthDomain: '',
    firebaseProjectId: '',
    firebaseAppId: '',
    firebaseStorageBucket: '',
    firebaseMessagingSenderId: '',
  },
  prod: {
    production: true,
    websocketUrl: 'wss://d16smhly3894zz.cloudfront.net/ws/query',
    apiKey: 'API_KEY_PLACEHOLDER',
    firebaseApiKey: '',
    firebaseAuthDomain: '',
    firebaseProjectId: '',
    firebaseAppId: '',
    firebaseStorageBucket: '',
    firebaseMessagingSenderId: '',
  },
};

function escapeTsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildConfig() {
  const base = isProd ? DEFAULTS.prod : DEFAULTS.dev;
  const config = { ...base };

  for (const [envKey, tsKey] of Object.entries(ENV_MAP)) {
    const value = process.env[envKey];
    if (value !== undefined && value !== '') {
      config[tsKey] = value;
    }
  }

  return config;
}

function formatEnvironmentFile(config) {
  return `// Generado por scripts/sync-env.js — no editar a mano
// Valores desde .env.local / .env (ver src/environments/README.md)

export const environment = {
  production: ${config.production},
  websocketUrl: '${escapeTsString(config.websocketUrl)}',
  apiKey: '${escapeTsString(config.apiKey)}',
  firebaseApiKey: '${escapeTsString(config.firebaseApiKey)}',
  firebaseAuthDomain: '${escapeTsString(config.firebaseAuthDomain)}',
  firebaseProjectId: '${escapeTsString(config.firebaseProjectId)}',
  firebaseAppId: '${escapeTsString(config.firebaseAppId)}',
  firebaseStorageBucket: '${escapeTsString(config.firebaseStorageBucket)}',
  firebaseMessagingSenderId: '${escapeTsString(config.firebaseMessagingSenderId)}',
};
`;
}

const targetName = isProd ? 'environment.prod.ts' : 'environment.ts';
const targetPath = path.join(root, 'src/environments', targetName);
const config = buildConfig();

if (isProd && requireApiKey && config.apiKey === 'API_KEY_PLACEHOLDER') {
  console.error('❌ En build de producción define API_KEY en .env.local o en el CI.');
  process.exit(1);
}

fs.writeFileSync(targetPath, formatEnvironmentFile(config), 'utf8');

const label = isProd ? 'environment.prod.ts' : 'environment.ts';
const firebaseReady =
  config.firebaseApiKey &&
  config.firebaseAuthDomain &&
  config.firebaseProjectId &&
  config.firebaseAppId;

if (firebaseReady) {
  console.log(`✓ ${label} generado desde .env.local`);
} else if (!isProd) {
  console.log(`✓ ${label} generado (Firebase vacío — añade FIREBASE_* en .env.local)`);
} else {
  console.log(`✓ ${label} generado`);
}
