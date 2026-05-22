# Supabase — traducciones i18n

## Tabla `i18n_translations`

| Columna     | Descripción                                      | Ejemplo        |
|------------|---------------------------------------------------|----------------|
| `namespace`| Sección del JSON (`HEADER`, `FOOTER`, …)         | `HEADER`       |
| `key`      | Clave dentro de la sección                       | `LOGOUT`       |
| `locale`   | Idioma (`en`, `es`, `fr`, `de`, `ca`, `el`)      | `en`           |
| `value`    | Texto mostrado en la UI                          | `LOG OUT`      |

En la app Angular la clave equivale a `namespace.key` (ej. `HEADER.LOGOUT`).

### Namespaces incluidos en el seed

`HEADER`, `FOOTER`, `SUGGESTIONS`, `SOURCES`, `FEEDBACK`, `SIDEBAR`, `WELCOME`, `HOME`, `LEGAL`

## Configuración inicial

1. Crear proyecto en [Supabase Dashboard](https://supabase.com/dashboard).
2. Copiar `.env.example` → `.env.local` y completar `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
3. Variables en `.env.local` (como Next.js); `npm start` genera `environment.ts` automáticamente. Ver `src/environments/README.md`.
4. Cargar datos (elige una opción):

   **A — SQL Editor:** pegar y ejecutar `supabase/seed.sql`

   **B — Script (requiere service role en `.env.local`):**
   ```bash
   npm run i18n:push
   ```

5. Verificar: `npm run test:supabase`

6. Enlazar el proyecto remoto (opcional, requiere [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
```

7. Aplicar migración y datos en la nube:

```bash
npx supabase db push
```

O pegar en el **SQL Editor** del dashboard:

- `supabase/migrations/20260520193000_create_i18n_translations.sql`
- `supabase/seed.sql`

## Desarrollo local (opcional)

Requiere [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
npm run supabase:start
npm run supabase:reset
```

## Regenerar seed desde JSON

Tras editar `src/assets/i18n/*.json`:

```bash
npm run i18n:seed
```

Luego `npx supabase db reset` (local) o volver a ejecutar `seed.sql` en remoto.

## RLS

- **Lectura**: `anon` y `authenticated` (público para la UI).
- **Escritura**: solo `authenticated` (editores en dashboard o app con login).

## Panel admin de traducciones

Ruta: **`/admin`** (login en **`/admin/login`**).

1. En Supabase → **Authentication** → **Users** → **Add user** (email + contraseña).
2. Desactiva «Confirm email» si quieres entrar sin verificación (Authentication → Providers → Email).
3. `npm start` → abre `http://localhost:4200/admin/login`.
4. El panel muestra los textos de `src/assets/i18n` automáticamente.
5. Edita y pulsa **Guardar en Supabase** — solo entonces se persisten y la app pública los usa.

La app pública sigue leyendo Supabase + fallback JSON (`TranslationService`).

## Siguiente paso en Angular

Ampliar namespaces en `i18n-admin.constants.ts` y en el seed si añades más secciones (CHAT, ERRORS, etc.).
