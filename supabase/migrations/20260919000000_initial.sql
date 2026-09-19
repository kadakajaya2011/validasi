-- ============================================================
-- Aplikasi Kependudukan Desa - Supabase schema & security
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'operator' check (role in ('admin','operator')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.residents (
  nik text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.mutation_history (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  type text not null,
  nik text,
  name text,
  kk text,
  address text,
  rt text,
  rw text,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id)
);

create index if not exists mutation_history_at_idx on public.mutation_history(at desc);
create index if not exists mutation_history_nik_idx on public.mutation_history(nik);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.app_settings;
create trigger settings_touch_updated_at before update on public.app_settings
for each row execute function public.touch_updated_at();

drop trigger if exists residents_touch_updated_at on public.residents;
create trigger residents_touch_updated_at before update on public.residents
for each row execute function public.touch_updated_at();

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles p
    where p.id = uid
      and (p.role = 'admin' or coalesce((p.permissions ->> perm)::boolean, false))
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
revoke all on function public.has_permission(uuid,text) from public;
grant execute on function public.has_permission(uuid,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.residents enable row level security;
alter table public.mutation_history enable row level security;

-- Profiles: user can read own profile; admin can read/update all profiles.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- App settings: public read is intentional so login screen can show logo/title.
drop policy if exists settings_select_public on public.app_settings;
create policy settings_select_public on public.app_settings for select to anon, authenticated
using (true);

drop policy if exists settings_insert_admin on public.app_settings;
create policy settings_insert_admin on public.app_settings for insert to authenticated
with check (public.is_admin());

drop policy if exists settings_update_admin on public.app_settings;
create policy settings_update_admin on public.app_settings for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Residents: visibility requires view_data. Mutations require their matching permission.
drop policy if exists residents_select on public.residents;
create policy residents_select on public.residents for select to authenticated
using (public.has_permission(auth.uid(),'view_data'));

drop policy if exists residents_insert on public.residents;
create policy residents_insert on public.residents for insert to authenticated
with check (public.has_permission(auth.uid(),'add_data') or public.has_permission(auth.uid(),'import_data'));

drop policy if exists residents_update on public.residents;
create policy residents_update on public.residents for update to authenticated
using (public.has_permission(auth.uid(),'edit_data') or public.has_permission(auth.uid(),'import_data'))
with check (public.has_permission(auth.uid(),'edit_data') or public.has_permission(auth.uid(),'import_data'));

drop policy if exists residents_delete on public.residents;
create policy residents_delete on public.residents for delete to authenticated
using (public.has_permission(auth.uid(),'delete_data') or public.has_permission(auth.uid(),'import_data'));

-- Mutation history.
drop policy if exists mutation_history_select on public.mutation_history;
create policy mutation_history_select on public.mutation_history for select to authenticated
using (public.has_permission(auth.uid(),'mutation'));

drop policy if exists mutation_history_insert on public.mutation_history;
create policy mutation_history_insert on public.mutation_history for insert to authenticated
with check (
  public.has_permission(auth.uid(),'mutation')
  or public.has_permission(auth.uid(),'add_data')
  or public.has_permission(auth.uid(),'edit_data')
  or public.has_permission(auth.uid(),'delete_data')
  or public.has_permission(auth.uid(),'import_data')
);

-- Storage: public read; only admin can upload/update/delete logo assets.
insert into storage.buckets (id, name, public)
values ('app-assets','app-assets',true)
on conflict (id) do update set public = true;

drop policy if exists app_assets_public_read on storage.objects;
create policy app_assets_public_read on storage.objects for select to anon, authenticated
using (bucket_id = 'app-assets');

drop policy if exists app_assets_admin_insert on storage.objects;
create policy app_assets_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists app_assets_admin_update on storage.objects;
create policy app_assets_admin_update on storage.objects for update to authenticated
using (bucket_id = 'app-assets' and public.is_admin())
with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists app_assets_admin_delete on storage.objects;
create policy app_assets_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'app-assets' and public.is_admin());

-- Seed row. The actual settings are filled from the app after admin login.
insert into public.app_settings(id,settings)
values ('main','{}'::jsonb)
on conflict (id) do nothing;
