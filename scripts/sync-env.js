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
  SUPABASE_URL: 'supabaseUrl',
  SUPABASE_ANON_KEY: 'supabaseAnonKey',
};

const DEFAULTS = {
  dev: {
    production: false,
    websocketUrl: 'wss://d2nrwi7jko6xiv.cloudfront.net/ws/query',
    apiKey: 'API_KEY_DEV',
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
  prod: {
    production: true,
    websocketUrl: 'wss://d16smhly3894zz.cloudfront.net/ws/query',
    apiKey: 'API_KEY_PLACEHOLDER',
    supabaseUrl: '',
    supabaseAnonKey: '',
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
  supabaseUrl: '${escapeTsString(config.supabaseUrl)}',
  supabaseAnonKey: '${escapeTsString(config.supabaseAnonKey)}',
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
if (config.supabaseUrl && config.supabaseAnonKey) {
  console.log(`✓ ${label} generado desde .env.local`);
} else if (!isProd) {
  console.log(`✓ ${label} generado (Supabase vacío — añade SUPABASE_* en .env.local)`);
} else {
  console.log(`✓ ${label} generado`);
}
