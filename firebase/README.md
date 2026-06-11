# Firebase — traducciones i18n

Las traducciones editables viven en **Firestore** (`i18n_translations`). El panel admin usa **Firebase Auth**.

## Guía paso a paso (cliente)

Para montar un proyecto Firebase desde cero, sigue:

**[`docs/CONFIGURACION_FIREBASE.md`](../docs/CONFIGURACION_FIREBASE.md)**

Incluye checklist, configuración de `.env.local`, subida inicial de traducciones y despliegue.

## Referencia rápida (desarrolladores)

### Variables en `.env.local`

```env
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_APP_ID=1:...
FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
FIREBASE_MESSAGING_SENDER_ID=...

FIREBASE_SERVICE_ACCOUNT_PATH=./tu-proyecto-firebase-adminsdk-xxxxx.json
```

```bash
npm run sync-env
npm run i18n:push
npm run test:firebase
```

### Reglas de Firestore

Ver [`firestore.rules`](firestore.rules): lectura pública, escritura solo autenticados.

### Panel admin

Ruta: **`/admin`** (login en **`/admin/login`**).

La app pública fusiona Firestore + JSON local (`TranslationService`).

## Modelo de datos

Colección: `i18n_translations`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `namespace` | string | p. ej. `HEADER`, `HOME` |
| `key` | string | clave dentro del namespace |
| `locale` | string | `en`, `es`, `fr`, … |
| `value` | string | texto traducido |
| `updatedAt` | string | ISO timestamp (opcional) |

ID del documento: `{namespace}::{key}::{locale}`
