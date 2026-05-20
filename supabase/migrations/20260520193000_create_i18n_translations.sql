-- Tabla de traducciones i18n (CMS editable desde Supabase)
-- Clave compuesta: namespace + key + locale (ej. HEADER.LOGOUT en inglés)

create table if not exists public.i18n_translations (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  key text not null,
  locale text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint i18n_translations_namespace_key_locale_unique
    unique (namespace, key, locale),
  constraint i18n_translations_locale_check
    check (locale in ('en', 'es', 'fr', 'de', 'ca', 'el'))
);

create index if not exists i18n_translations_locale_idx
  on public.i18n_translations (locale);

create index if not exists i18n_translations_namespace_idx
  on public.i18n_translations (namespace);

comment on table public.i18n_translations is
  'Textos de la aplicación por idioma. namespace = sección JSON (HEADER, FOOTER, …); key = clave dentro de la sección.';

comment on column public.i18n_translations.namespace is
  'Sección principal: HEADER, FOOTER, SUGGESTIONS, SOURCES, FEEDBACK, SIDEBAR, WELCOME, HOME, LEGAL';

comment on column public.i18n_translations.key is
  'Clave dentro del namespace (ej. LOGOUT, TERMS_TITLE)';

comment on column public.i18n_translations.locale is
  'Código de idioma ISO corto: en, es, fr, de, ca, el';

-- Actualizar updated_at automáticamente
create or replace function public.set_i18n_translations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists i18n_translations_set_updated_at on public.i18n_translations;

create trigger i18n_translations_set_updated_at
  before update on public.i18n_translations
  for each row
  execute function public.set_i18n_translations_updated_at();

-- RLS: lectura pública (textos de UI), escritura solo autenticados (panel/admin)
alter table public.i18n_translations enable row level security;

create policy "i18n_translations_select_anon"
  on public.i18n_translations
  for select
  to anon, authenticated
  using (true);

create policy "i18n_translations_insert_authenticated"
  on public.i18n_translations
  for insert
  to authenticated
  with check (true);

create policy "i18n_translations_update_authenticated"
  on public.i18n_translations
  for update
  to authenticated
  using (true)
  with check (true);

create policy "i18n_translations_delete_authenticated"
  on public.i18n_translations
  for delete
  to authenticated
  using (true);

-- Vista útil para consultar traducciones agrupadas por idioma y sección
create or replace view public.i18n_by_locale
with (security_invoker = true) as
select
  locale,
  namespace,
  jsonb_object_agg(key, value order by key) as entries
from public.i18n_translations
group by locale, namespace;

grant select on public.i18n_by_locale to anon, authenticated;
