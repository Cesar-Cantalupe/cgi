# Variables de entorno (Angular vs Next.js)

## Diferencia clave

| Next.js | Este proyecto (Angular) |
|---------|-------------------------|
| `.env.local` se carga solo al arrancar | `.env.local` lo lee **`scripts/sync-env.js`** antes de `ng serve` / `ng build` |
| `process.env.NEXT_PUBLIC_*` en código | `import { environment } from './environment'` |
| Variables disponibles en runtime del servidor | Todo en `environment` va al **bundle del navegador** (público) |
| Cambias `.env` y reinicias `next dev` | Cambias `.env.local` y reinicias `npm start` (o `npm run sync-env`) |

Angular **no tiene** `process.env` en el cliente. Los valores se **incrustan al compilar** en `environment.ts`.

## Qué archivo usar

1. **`.env.local`** (recomendado, como en Next) — tus secretos locales, **no se commitea**.
2. **`.env`** — valores por defecto del equipo (opcional).
3. **`environment.example.ts`** — plantilla documentada, **sí se commitea** (sin secretos reales).
4. **`environment.ts`** — generado automáticamente, **gitignored**.

## Variables soportadas

Copia `.env.example` → `.env.local`:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

WEBSOCKET_URL=wss://tu-backend/ws/query
API_KEY=tu_api_key_dev
```

| Variable en `.env.local` | Propiedad en `environment` | ¿Va al navegador? |
|--------------------------|----------------------------|------------------|
| `SUPABASE_URL` | `supabaseUrl` | Sí (como `NEXT_PUBLIC_`) |
| `SUPABASE_ANON_KEY` | `supabaseAnonKey` | Sí (clave anon, diseñada para eso) |
| `WEBSOCKET_URL` | `websocketUrl` | Sí |
| `API_KEY` | `apiKey` | Sí |

**Nunca** pongas `SUPABASE_SERVICE_ROLE_KEY` aquí: solo en `.env.local` para scripts Node (`npm run i18n:push`), no se sincroniza a Angular.

## Comandos

```bash
npm run sync-env          # regenera environment.ts desde .env.local
npm start                 # ejecuta sync-env antes (hook prestart)
npm run build             # sync-env --prod + build de producción
```

## Producción

En CI/CD define las mismas variables de entorno y ejecuta el build:

```bash
export API_KEY=...
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
npm run build
```

Eso genera `environment.prod.ts` con valores reales y luego `restore-env.js` deja el repo sin el `API_KEY` escrito en el fichero commiteado.

## Uso en código

```typescript
import { environment } from '../../environments/environment';

// Equivalente a process.env.NEXT_PUBLIC_SUPABASE_URL en Next
const url = environment.supabaseUrl;
```

No uses `process.env` en componentes Angular de este proyecto.
