# Variables de entorno

## Diferencia con Next.js

| Next.js | Este proyecto (Angular) |
|---------|-------------------------|
| `.env.local` se carga al arrancar | **`scripts/sync-env.js`** lo lee antes de `ng serve` / `ng build` |
| `process.env.NEXT_PUBLIC_*` en código | `import { environment } from './environment'` |
| Variables en runtime del servidor | Todo va al **bundle del navegador** (público) |
| Cambias `.env` y reinicias `next dev` | Cambias `.env.local` y reinicias `npm start` |

Angular **no tiene** `process.env` en cliente. Los valores se **incrustan al compilar** en `environment.ts`.

## Archivos de configuración

| Archivo | ¿Se commitea? | Uso |
|---------|:------------:|-----|
| `.env.local` | No | Secretos locales (recomendado) |
| `.env` | Opcional | Valores por defecto del equipo |
| `environment.example.ts` | Sí | Plantilla documentada (sin secretos) |
| `environment.ts` | No | Generado automáticamente

## Variables soportadas

Copia `.env.example` → `.env.local`:

```env
FIREBASE_API_KEY=AIza...
FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_APP_ID=1:...

WEBSOCKET_URL=wss://tu-backend/ws/query
API_KEY=tu_api_key_dev
```

| Variable en `.env.local` | Propiedad en `environment` | ¿Va al navegador? |
|--------------------------|----------------------------|------------------|
| `FIREBASE_API_KEY` | `firebaseApiKey` | Sí |
| `FIREBASE_AUTH_DOMAIN` | `firebaseAuthDomain` | Sí |
| `FIREBASE_PROJECT_ID` | `firebaseProjectId` | Sí |
| `FIREBASE_APP_ID` | `firebaseAppId` | Sí |
| `FIREBASE_STORAGE_BUCKET` | `firebaseStorageBucket` | Sí (opcional) |
| `FIREBASE_MESSAGING_SENDER_ID` | `firebaseMessagingSenderId` | Sí (opcional) |
| `WEBSOCKET_URL` | `websocketUrl` | Sí |
| `API_KEY` | `apiKey` | Sí |

**Nunca** pongas `FIREBASE_SERVICE_ACCOUNT_PATH` ni el JSON de cuenta de servicio en el bundle de Angular: solo en `.env.local` para scripts Node (`npm run i18n:push`).

## Comandos

```bash
npm run sync-env          # regenera environment.ts desde .env.local
npm start                 # ejecuta sync-env antes (hook prestart)
npm run build             # sync-env --prod + build de producción
```

## Producción

En CI/CD define las mismas variables y ejecuta el build:

```bash
export API_KEY=...
export FIREBASE_API_KEY=...
export FIREBASE_AUTH_DOMAIN=...
export FIREBASE_PROJECT_ID=...
export FIREBASE_APP_ID=...
npm run build
```

El script `scripts/restore-env.js` restaura `API_KEY_PLACEHOLDER` tras el build para no dejar la clave escrita en el repositorio.

## Uso en código

```typescript
import { environment } from '../../environments/environment';

const projectId = environment.firebaseProjectId;
```

No uses `process.env` en componentes Angular de este proyecto.
