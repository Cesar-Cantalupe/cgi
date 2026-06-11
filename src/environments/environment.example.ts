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
  firebaseApiKey: '', // .env.local → FIREBASE_API_KEY
  firebaseAuthDomain: '', // .env.local → FIREBASE_AUTH_DOMAIN
  firebaseProjectId: '', // .env.local → FIREBASE_PROJECT_ID
  firebaseAppId: '', // .env.local → FIREBASE_APP_ID
  firebaseStorageBucket: '', // .env.local → FIREBASE_STORAGE_BUCKET (opcional)
  firebaseMessagingSenderId: '', // .env.local → FIREBASE_MESSAGING_SENDER_ID (opcional)
};
