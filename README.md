# Snapmomen

Website photobooth komersil: studio foto instan + bingkai gratis/premium + dashboard admin.

## Struktur

```
snapmomen/
├── api/              backend (Vercel Serverless Functions, deploy sebagai project sendiri)
├── frontend/          static frontend (deploy sebagai project sendiri)
├── database/schema.sql
└── vercel.json        config cron untuk backend
```

## 1. Setup Database (Neon)

1. Buat project di https://neon.tech (gratis).
2. Copy connection string (DATABASE_URL).
3. Jalankan `database/schema.sql` di SQL editor Neon.
4. (Opsional) Seed bingkai demo:
   ```bash
   npm install @neondatabase/serverless
   DATABASE_URL=postgresql://... node database/seed-frames.mjs
   ```

## 2. Deploy Backend (project Vercel #1)

1. Push folder `snapmomen/` ke GitHub.
2. Di Vercel, buat project baru, **Root Directory = snapmomen** (folder yang berisi `api/`).
3. Set environment variables:
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=isi-string-acak-panjang
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin12345
   CRON_SECRET=isi-string-acak-lain
   NODE_ENV=production
   ```
4. Deploy. Endpoint akan aktif di `https://<project>.vercel.app/api/...`.
5. Cron `api/cron` otomatis jalan 1x/hari (jadwal `0 0 * * *`, limit paket Hobby).

## 3. Deploy Frontend (project Vercel #2)

1. Buat project Vercel baru, **Root Directory = snapmomen/frontend**.
2. Sebelum deploy, edit `frontend/js/config.js`:
   ```js
   const API_BASE_URL = 'https://<project-backend-kamu>.vercel.app/api';
   ```
3. Deploy sebagai static site (tidak perlu build command).

## 4. Login Admin

- Username & password admin diambil langsung dari env `ADMIN_USERNAME` / `ADMIN_PASSWORD`
  (bukan disimpan di database). Login di `login.html` akan otomatis mendeteksi kredensial ini
  dan mengarahkan ke `dashboard-admin.html`.

## Alur Sistem

- **Premium**: admin generate kode (`SNAP-XXXXXX`) di dashboard → kirim ke customer via WhatsApp
  → customer redeem di `premium.html` → `premium_until` bertambah sesuai durasi.
- **Foto**: customer ambil foto di studio → klik "Simpan" → foto tersimpan ke DB (base64),
  otomatis di-print (WebUSB → dialog print browser → fallback download manual), dan
  `expires_at = NOW() + 3 hari`.
- **Cron** (`api/cron`, 1x/hari): hapus foto yang sudah `expires_at`, tandai kode premium yang
  masa aktifnya habis sebagai `expired`, dan kosongkan `premium_until` user yang sudah lewat.

## Catatan Print (WebUSB)

WebUSB hanya berfungsi di Chrome desktop dan device printer harus sudah di-"Hubungkan" lewat
tombol di panel Printer dashboard admin (butuh interaksi user, tidak bisa otomatis penuh dari
browser). Jika WebUSB tidak tersedia/gagal, sistem otomatis membuka dialog cetak browser;
jika itu juga gagal, foto sudah otomatis ter-download untuk dicetak manual.
