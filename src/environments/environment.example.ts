/**
 * Plantilla de configuración (se commitea).
 * Los valores reales vienen de .env.local → scripts/sync-env.js → environment.ts
 *
 * Ver: src/environments/README.md
 */
export const environment = {
  production: false,
  websocketUrl: 'wss://URL_DEV/ws/query', // .env.local → WEBSOCKET_URL
  apiKey: 'API_KEY_DEV', // .env.local → API_KEY
  supabaseUrl: '', // .env.local → SUPABASE_URL
  supabaseAnonKey: '', // .env.local → SUPABASE_ANON_KEY
};
