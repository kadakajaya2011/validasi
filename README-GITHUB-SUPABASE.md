# Aplikasi Kependudukan Desa — GitHub + Supabase

Paket ini adalah versi siap-upload ke repository GitHub.

## Struktur

```text
/
├── index.html
├── supabase-config.js
├── README-GITHUB-SUPABASE.md
├── deploy-supabase.sh
├── deploy-supabase.ps1
├── .gitignore
├── .github/
│   └── workflows/
├── supabase/
│   ├── config.toml
│   ├── schema.sql
│   ├── migrations/
│   │   └── 20260919000000_initial.sql
│   └── functions/
│       └── create-operator/
│           └── index.ts
└── Aplikasi_Data_Kependudukan_Desa_F101.html
```

`index.html` adalah file utama yang akan dibuka GitHub Pages. File HTML sumber lama tetap disertakan sebagai cadangan.

## 1. Buat project Supabase

Buat project baru di Supabase, kemudian catat:

- Project URL
- anon/public key
- Project Ref

**Jangan pernah memasukkan `service_role` key ke `index.html`, `supabase-config.js`, GitHub, atau browser.**

## 2. Isi supabase-config.js

Buka `supabase-config.js` dan ganti placeholder:

```js
window.SUPABASE_CONFIG = {
  url: 'https://PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

`anon/public key` memang digunakan oleh aplikasi browser. Keamanan data tetap bergantung pada RLS/policy Supabase.

## 3. Siapkan database

Pilihan A — melalui Supabase SQL Editor:

1. Buka `supabase/schema.sql`.
2. Salin seluruh isinya.
3. Jalankan di SQL Editor Supabase.

Pilihan B — melalui Supabase CLI:

```bash
supabase login
supabase link --project-ref PROJECT_REF
supabase db push
```

## 4. Deploy Edge Function

Edge Function `create-operator` diperlukan agar admin dapat membuat akun operator tanpa pernah mengekspos `service_role` key ke browser.

```bash
supabase functions deploy create-operator --no-verify-jwt
```

Atau gunakan script:

Linux/macOS:

```bash
./deploy-supabase.sh PROJECT_REF
```

Windows PowerShell:

```powershell
./deploy-supabase.ps1 -ProjectRef PROJECT_REF
```

## 5. Buat akun admin pertama

Buat user pertama melalui Supabase Dashboard → Authentication → Users.

Kemudian ambil UUID user tersebut dan jalankan di SQL Editor:

```sql
insert into public.profiles (id, email, role, permissions)
values (
  'UUID_ADMIN',
  'email-admin@example.com',
  'admin',
  '{}'::jsonb
);
```

Ganti `UUID_ADMIN` dan email sesuai akun admin.

## 6. Upload ke GitHub

Upload seluruh isi folder paket ini ke repository GitHub. Pastikan `index.html` berada langsung di root repository.

Aktifkan GitHub Pages:

`Repository → Settings → Pages → Deploy from a branch → main → /(root)`

Setelah aktif, GitHub akan memberikan alamat Pages repository.

## 7. Pengaturan Supabase Auth

Di Supabase Dashboard → Authentication → URL Configuration:

- Site URL: alamat GitHub Pages aplikasi.
- Redirect URLs: alamat GitHub Pages aplikasi.

Contoh pola:

```text
https://USERNAME.github.io/NAMA-REPOSITORY/
```

Gunakan alamat repository Anda sendiri.

## 8. Login dan pengaturan desa

Setelah GitHub Pages aktif:

1. Buka aplikasi.
2. Login menggunakan akun admin.
3. Masuk ke pengaturan desa.
4. Isi nama desa, kecamatan, kabupaten, provinsi, kepala desa, alamat kantor, dan logo.
5. Pengaturan utama disimpan ke `app_settings` melalui Supabase.
6. Logo dapat disimpan pada Storage bucket `app-assets`.

Nama aplikasi pada halaman login akan mengikuti nama desa dari pengaturan.

## 9. Akun operator

Admin dapat membuka menu akun/permissions untuk membuat operator dan memilih hak akses yang tersedia. Edge Function akan membuat user Auth dan profile operator secara server-side.

## 10. Keamanan

- Data penduduk dilindungi Row Level Security (RLS).
- Admin memiliki seluruh permission aplikasi.
- Operator hanya memperoleh permission yang diberikan.
- `service_role` hanya boleh berada di lingkungan server/Edge Function.
- `supabase-config.js` berisi URL dan anon/public key, bukan service_role key.

## 11. Catatan penting tentang GitHub Pages

GitHub Pages hanya menyajikan file statis. Database, autentikasi, RLS, Storage, dan Edge Function berada di Supabase.

Jadi arsitekturnya:

```text
Browser
   │
   ├── GitHub Pages → index.html + supabase-config.js
   │
   └── Supabase
        ├── Auth
        ├── PostgreSQL + RLS
        ├── Storage
        └── Edge Function create-operator
```
