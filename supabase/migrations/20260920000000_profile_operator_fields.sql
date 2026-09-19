-- ============================================================
-- PROFIL OPERATOR / ADMIN: NAMA LENGKAP + FOTO PROFIL
-- Jalankan sekali di Supabase Dashboard > SQL Editor.
-- ============================================================

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

-- Bucket foto profil. Dibuat PUBLIC agar foto dapat langsung ditampilkan
-- di header aplikasi tanpa signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- User hanya boleh mengunggah/mengubah/menghapus file di folder miliknya:
-- avatars/<auth.uid()>/...
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Jangan memberikan UPDATE langsung ke profiles melalui browser.
-- Penyimpanan nama/foto dilakukan oleh Edge Function manage-profile
-- agar role, permissions, dan email tidak bisa diubah oleh operator.

-- Backfill nama lama agar aplikasi tetap menampilkan identitas sementara.
-- Ini hanya mengisi full_name jika masih kosong.
update public.profiles p
set full_name = split_part(p.email, '@', 1)
where coalesce(trim(p.full_name), '') = ''
  and coalesce(trim(p.email), '') <> '';
