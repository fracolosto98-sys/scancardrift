-- Foilio: sincronización de los datos del usuario entre dispositivos.
-- Ejecutar una vez en Supabase > SQL Editor. Se puede volver a ejecutar sin problema.

-- Una fila por cada elemento del usuario (favorito, carta de la colección, mazo o carta de un mazo).
create table if not exists public.user_rows (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null check (tbl in ('favs', 'collection', 'decks', 'deckCards')),
  key        text        not null check (length(key) <= 200),
  data       jsonb       check (pg_column_size(data) <= 4000),
  deleted    boolean     not null default false,
  updated_at bigint      not null, -- hora del cambio en el dispositivo (ms): decide qué versión gana
  synced_at  timestamptz not null default now(), -- hora del servidor: cursor para descargar cambios
  primary key (user_id, tbl, key)
);
create index if not exists user_rows_user_synced on public.user_rows (user_id, synced_at);

-- Cada usuario solo puede ver y tocar sus propias filas.
alter table public.user_rows enable row level security;
drop policy if exists "user_rows_select_own" on public.user_rows;
drop policy if exists "user_rows_insert_own" on public.user_rows;
drop policy if exists "user_rows_update_own" on public.user_rows;
create policy "user_rows_select_own" on public.user_rows for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_rows_insert_own" on public.user_rows for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_rows_update_own" on public.user_rows for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.user_rows from anon;

-- Sube cambios: solo sobrescribe si el cambio es igual o más reciente que lo guardado.
-- Los borrados se guardan como deleted = true para que lleguen a los demás dispositivos.
create or replace function public.sync_push(rows jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_rows (user_id, tbl, key, data, deleted, updated_at, synced_at)
  select (select auth.uid()), r.tbl, r.key, case when coalesce(r.deleted, false) then null else r.data end,
         coalesce(r.deleted, false), r.updated_at, now()
  from jsonb_to_recordset(rows) as r (tbl text, key text, data jsonb, deleted boolean, updated_at bigint)
  on conflict (user_id, tbl, key) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where public.user_rows.updated_at <= excluded.updated_at;
$$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Borra la cuenta del usuario que la llama (y, en cascada, todos sus datos). Obligatorio para las tiendas de apps.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
