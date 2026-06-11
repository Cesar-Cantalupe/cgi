# Configuración de Firebase para eduCGI

Esta guía explica cómo montar **tu propio proyecto Firebase** para gestionar las traducciones de la web eduCGI. Está pensada para el equipo que despliega o mantiene la aplicación (no hace falta ser experto en Firebase).

Una vez configurado, podrás:

- Editar textos desde el panel admin (`/admin`)
- Guardar cambios en **Firestore**
- Mostrar esos textos en la web pública sin tocar código

Para editar textos día a día, usa también la guía [`ADMIN_PANEL_TUTORIAL.md`](ADMIN_PANEL_TUTORIAL.md).

---

## Resumen del flujo

```
1. Crear proyecto Firebase
2. Activar Authentication + Firestore
3. Publicar reglas de seguridad
4. Registrar app web y copiar claves
5. Configurar .env.local en el proyecto
6. Crear usuario admin
7. Subir traducciones iniciales (npm run i18n:push)
8. Probar panel admin
```

---

## Requisitos previos

- Cuenta de Google
- Node.js 16 o superior instalado
- Proyecto eduCGI clonado en tu máquina
- Dependencias instaladas:

```bash
npm install
```

---

## Paso 1 — Crear el proyecto en Firebase

1. Entra en [Firebase Console](https://console.firebase.google.com/).
2. Pulsa **Crear un proyecto** (*Add project*).
3. Elige un nombre (por ejemplo `mi-educgi` o `educgi-prod`).
4. Google Analytics es **opcional** — puedes desactivarlo si no lo necesitas.
5. Espera a que termine la creación y entra al proyecto.

---

## Paso 2 — Activar Authentication (login del panel)

El panel de traducciones (`/admin/login`) usa email y contraseña.

1. Menú izquierdo: **Compilación** → **Authentication**.
2. Pulsa **Comenzar** (*Get started*).
3. Pestaña **Sign-in method** → abre **Correo electrónico/Contraseña** (*Email/Password*).
4. **Activa** el proveedor y guarda.

> No actives otros métodos (Google, etc.) salvo que tu equipo lo decida expresamente.

---

## Paso 3 — Crear Firestore Database

Las traducciones se guardan en una colección llamada `i18n_translations`.

1. Menú izquierdo: **Compilación** → **Firestore Database**.
2. Pulsa **Crear base de datos**.
3. Elige **modo de producción** (*production mode*).
4. Selecciona la **región** más cercana a tus usuarios (por ejemplo `europe-west1` en Europa).
5. Pulsa **Crear**.

La colección se creará automáticamente al subir las traducciones (paso 8).

---

## Paso 4 — Publicar reglas de seguridad

Estas reglas permiten que la web **lea** traducciones sin login, pero solo usuarios autenticados **escriban** (panel admin).

1. En **Firestore Database**, abre la pestaña **Reglas** (*Rules*).
2. Sustituye todo el contenido por:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /i18n_translations/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Pulsa **Publicar** (*Publish*).

> El mismo texto está en el repositorio: [`firebase/firestore.rules`](../firebase/firestore.rules).

---

## Paso 5 — Registrar la app web y copiar la configuración

Angular necesita la configuración pública de Firebase (va al navegador; no es secreta).

1. Icono de **engranaje** → **Configuración del proyecto** (*Project settings*).
2. Baja a **Tus apps** (*Your apps*).
3. Pulsa el icono **Web** (`</>`).
4. Pon un apodo (por ejemplo `educgi-web`) y **Registrar app**.
5. Firebase mostrará un bloque como este — **copia los valores**:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

No hace falta instalar el SDK desde la consola; el proyecto ya lo incluye.

---

## Paso 6 — Configurar `.env.local`

En la **raíz del proyecto** (donde está `package.json`):

```bash
cp .env.example .env.local
```

Edita `.env.local` con los valores del paso 5:

```env
FIREBASE_API_KEY=AIza...
FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_APP_ID=1:123456789:web:abcdef
FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789

# Ruta al JSON de cuenta de servicio (paso 7)
FIREBASE_SERVICE_ACCOUNT_PATH=./tu-proyecto-firebase-adminsdk-xxxxx.json
```

Luego regenera la configuración de Angular:

```bash
npm run sync-env
```

Esto crea `src/environments/environment.ts` con tus claves Firebase.

> **Importante:** `.env.local` no se sube a Git. No lo compartas por email ni lo publiques.

---

## Paso 7 — Descargar la cuenta de servicio (solo para scripts)

La clave de cuenta de servicio permite **subir traducciones iniciales** desde tu ordenador. **No** va en la app web ni en producción del navegador.

1. **Configuración del proyecto** → pestaña **Cuentas de servicio** (*Service accounts*).
2. Pulsa **Generar nueva clave privada** (*Generate new private key*).
3. Se descargará un archivo JSON (nombre tipo `tu-proyecto-firebase-adminsdk-xxxxx.json`).
4. Muévelo a la **raíz del proyecto** eduCGI.
5. En `.env.local`, apunta la ruta exacta:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./tu-proyecto-firebase-adminsdk-xxxxx.json
```

> **Nunca** subas este JSON a Git, Slack ni repositorios públicos. El proyecto ya lo ignora en `.gitignore`.

---

## Paso 8 — Subir traducciones iniciales

Carga en Firestore los textos que vienen en `src/assets/i18n/*.json`:

```bash
npm run i18n:push
```

Si todo va bien verás:

```
✓ 462 documentos insertados/actualizados
```

Verifica la conexión:

```bash
npm run test:firebase
```

Deberías ver algo como:

```
✓ Firestore conectado — 462 traducciones en i18n_translations
```

En Firebase Console → **Firestore** → **Datos** verás la colección `i18n_translations`.

### Errores frecuentes en este paso

| Mensaje | Solución |
|---------|----------|
| `Define FIREBASE_SERVICE_ACCOUNT_PATH en .env.local` | Descomenta o añade la variable con la ruta al JSON del paso 7 |
| `No se encontró el archivo de cuenta de servicio` | Comprueba que el nombre del archivo coincida con la ruta en `.env.local` |
| Error de permisos | Revisa que Firestore esté creado y las reglas publicadas (pasos 3 y 4) |

---

## Paso 9 — Crear el usuario administrador

1. Firebase Console → **Authentication** → **Users**.
2. **Añadir usuario** (*Add user*).
3. Email y contraseña del editor (por ejemplo `admin@tuorganizacion.com`).
4. Guarda.

Ese usuario entra en `https://tu-dominio.com/admin/login` (o `http://localhost:4200/admin/login` en local).

---

## Paso 10 — Probar en local

```bash
npm start
```

1. Abre `http://localhost:4200/admin/login`.
2. Inicia sesión con el usuario del paso 9.
3. Edita un texto y pulsa **Guardar en Firebase**.
4. Abre la web pública, elige el idioma editado y **recarga** la página.

Si el login muestra *"Firebase no está configurado"*, ejecuta de nuevo `npm run sync-env` y reinicia `npm start`.

---

## Paso 11 — Despliegue en producción

En tu CI/CD o servidor de build, define las mismas variables que en `.env.local`:

```bash
export FIREBASE_API_KEY=...
export FIREBASE_AUTH_DOMAIN=...
export FIREBASE_PROJECT_ID=...
export FIREBASE_APP_ID=...
export FIREBASE_STORAGE_BUCKET=...
export FIREBASE_MESSAGING_SENDER_ID=...
export API_KEY=...          # backend del chatbot
export WEBSOCKET_URL=...    # backend del chatbot
npm run build
```

- Las variables `FIREBASE_*` públicas van al bundle del navegador (es el diseño normal de Firebase).
- **No** incluyas `FIREBASE_SERVICE_ACCOUNT_PATH` ni el JSON de cuenta de servicio en el build de producción web; solo sirven en tu máquina para `i18n:push`.

Tras desplegar, el panel admin estará en:

```
https://tu-dominio.com/admin/login
```

---

## Checklist final

Marca cada ítem antes de dar el proyecto por configurado:

- [ ] Proyecto Firebase creado
- [ ] Authentication con Email/Password activo
- [ ] Firestore creado en modo producción
- [ ] Reglas de `i18n_translations` publicadas
- [ ] App web registrada y valores en `.env.local`
- [ ] `npm run sync-env` ejecutado sin errores
- [ ] JSON de cuenta de servicio en la raíz (solo local)
- [ ] `npm run i18n:push` completado
- [ ] `npm run test:firebase` OK
- [ ] Usuario admin creado en Authentication
- [ ] Login en `/admin/login` probado
- [ ] Cambio de texto guardado y visible en la web pública

---

## Seguridad — recordatorios

| Archivo / dato | ¿Subir a Git? | Uso |
|----------------|:-------------:|-----|
| `.env.local` | No | Config local y build |
| JSON `*firebase-adminsdk*.json` | No | Solo `npm run i18n:push` en local |
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, etc. | Sí en CI (como secretos) | App web (públicas por diseño) |
| Usuario admin (email/contraseña) | No | Panel `/admin` |

Si una clave de cuenta de servicio se filtra, revócala en Firebase Console → Cuentas de servicio → gestionar claves, y genera una nueva.

---

## Documentación relacionada

| Guía | Para qué sirve |
|------|----------------|
| [`ADMIN_PANEL_TUTORIAL.md`](ADMIN_PANEL_TUTORIAL.md) | Editar textos en el panel (usuarios editores) |
| [`firebase/README.md`](../firebase/README.md) | Referencia técnica (modelo de datos, reglas) |
| [`src/environments/README.md`](../src/environments/README.md) | Variables de entorno y build |

---

## Soporte

Si algo no funciona tras seguir esta guía, anota:

1. El comando que ejecutaste
2. El mensaje de error completo
3. En qué paso del checklist estás

Y contacta con el equipo técnico que mantiene eduCGI.
