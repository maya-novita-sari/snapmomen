# Snapmomen

Photo booth web dengan studio foto, galeri, dan pembayaran QRIS dinamis untuk akun admin.

## Alur studio

- Customer: pilih model bingkai, pilih tema, sesi foto, hasil.
- Admin: pilih model bingkai, pilih jumlah cetak, pembayaran QRIS, pilih tema, sesi foto, hasil.

Total pembayaran: `Harga Sesi + (Jumlah Cetak - 1) x Harga Tambah Cetak`.
Harga diatur di dashboard admin, menu **Pengaturan**.

## Cara kerja QRIS dinamis

1. Admin membuka halaman pembayaran di studio.
2. Frontend memanggil `POST /api/payment/create` dengan jumlah cetak dan `client_ref` (kode unik per sesi studio, disimpan di sessionStorage).
3. Backend menghitung total dari pengaturan harga, lalu membuat transaksi QRIS di Midtrans.
4. Backend menyimpan transaksi ke tabel `payments` dan mengirim `qr_url` ke frontend.
5. Frontend menampilkan QR. Nominal sudah tertanam, customer tidak perlu mengetik.
6. Customer membayar. Midtrans memanggil `POST /api/payment/webhook`. Backend memeriksa signature, lalu mengubah status jadi `paid`.
7. Frontend mengecek `GET /api/payment/status` setiap 4 detik. Kalau webhook telat, endpoint ini menanyakan langsung ke Midtrans.
8. Tombol **Sudah Bayar, Lanjut** hanya berhasil kalau server sudah mengonfirmasi `paid`, lalu memanggil `POST /api/payment/consume` supaya pembayaran itu hanya bisa dipakai satu sesi foto.

## Tutorial Opsi A: Midtrans (yang dipasang di kode ini)

Kode memakai REST API Midtrans lewat `fetch`, jadi tidak perlu `npm install midtrans-client`.

### 1. Buat akun dan ambil kunci

1. Daftar di https://midtrans.com lalu login ke dashboard.
2. Pilih environment **Sandbox** dulu untuk uji coba.
3. Buka menu **Settings**, bagian **Access Keys**.
4. Salin **Server Key** (wajib). **Client Key** tidak dipakai oleh kode ini.
5. Pastikan channel **QRIS** aktif di dashboard. Di Sandbox biasanya sudah bisa dipakai. Untuk Production, QRIS perlu diaktifkan dan disetujui Midtrans.

### 2. Environment variable di Vercel

Tambahkan di project **API** (bukan project frontend), menu Settings, Environment Variables:

| Nama | Isi |
| --- | --- |
| `MIDTRANS_SERVER_KEY` | Server Key dari Midtrans |
| `MIDTRANS_IS_PRODUCTION` | `false` untuk Sandbox, `true` untuk Production |
| `MIDTRANS_CLIENT_KEY` | Opsional, belum dipakai kode |

Setelah menambah variable, lakukan **Redeploy** project API.

### 3. Notification URL

1. Di dashboard Midtrans buka **Settings**, cari bagian **Payment Notification URL**.
2. Isi dengan `https://snapmomen.vercel.app/api/payment/webhook`.
3. Simpan. Setiap environment (Sandbox dan Production) punya pengaturan sendiri.

### 4. Database

Jalankan bagian baru di `database/schema.sql` (tabel `settings` dan `payments`) di Neon SQL Editor. API juga membuat tabel itu otomatis kalau belum ada.

### 5. Uji coba di Sandbox

1. Login ke studio dengan akun admin, lanjut sampai halaman pembayaran.
2. QR muncul. Pembayaran Sandbox tidak memakai uang asli. Gunakan **Payment Simulator** Midtrans (ada di dokumentasi Midtrans bagian Sandbox) untuk mensimulasikan pembayaran QRIS dari QR tersebut.
3. Dalam beberapa detik status berubah jadi **Pembayaran diterima**, lalu klik **Sudah Bayar, Lanjut**.
4. Kalau QR tidak muncul, cek log project API di Vercel (Logs) untuk baris `payment create error`.

### 6. Pindah ke Production

1. Ganti `MIDTRANS_SERVER_KEY` dengan Server Key Production.
2. Ubah `MIDTRANS_IS_PRODUCTION` menjadi `true`.
3. Isi Payment Notification URL di environment Production.
4. Redeploy project API, lalu coba transaksi kecil.

## Opsi B dan C: Xendit atau Tripay

Kode di repo ini baru memakai Midtrans. Untuk pindah gateway, yang diganti hanya `api/_lib/midtrans.js` (fungsi `createQrisCharge`, `fetchTransactionStatus`, `mapTransactionStatus`, `isValidNotificationSignature`) dan environment variable. File `create.js`, `status.js`, `webhook.js`, dan frontend tidak perlu diubah.

Catatan dari dokumentasi resmi masing-masing (belum diuji di proyek ini, cek ulang dokumentasi sebelum dipakai):

- **Xendit**: QR Code dibuat lewat `POST https://api.xendit.co/qr_codes` dengan Basic Auth memakai Secret Key, body berisi `external_id`, `type: DYNAMIC`, `amount`, dan `callback_url`. Respons berisi `qr_string`. Webhook diverifikasi dengan header `x-callback-token` yang dicocokkan dengan Callback Token di dashboard. Karena responsnya `qr_string` (bukan gambar), frontend perlu library QR (misalnya qrcodejs) untuk menggambarnya.
- **Tripay**: transaksi dibuat lewat endpoint `transaction/create` dengan `Authorization: Bearer API_KEY`, `method: QRIS`, dan `signature` berupa HMAC SHA256 dari `merchant_code + merchant_ref + amount` memakai Private Key. Callback diverifikasi dari header `X-Callback-Signature` (HMAC SHA256 dari body mentah dengan Private Key). Paket npm `tripay-sdk` pada contoh lama tidak dipastikan ada, lebih aman memakai REST API langsung.

## Daftar file pembayaran

Semua endpoint pembayaran dilayani satu function, `api/payment.js`, supaya jumlah function di Vercel tidak melewati batas paket Hobby. URL tetap `/api/payment/create`, `/status`, `/webhook`, `/cancel`, `/consume` lewat `rewrites` di `vercel.json`.

| File | Fungsi |
| --- | --- |
| `api/_lib/payment/create.js` | Buat transaksi QRIS (khusus admin). Total dihitung di server. |
| `api/_lib/payment/webhook.js` | Terima notifikasi Midtrans, cek signature dan nominal. |
| `api/_lib/payment/cancel.js` | Batalkan order pending (khusus admin). |
| `api/_lib/payment/consume.js` | Tandai pembayaran sudah dipakai satu kali (khusus admin). |
| `api/_lib/payment/status.js` | Cek status transaksi (khusus admin), sinkron ke Midtrans kalau masih pending. |
| `api/_lib/midtrans.js` | Pemanggilan Midtrans dan verifikasi signature. |
| `api/_lib/payment-store.js` | Query tabel `payments`. |
| `api/_lib/settings-store.js` | Query tabel `settings`. |
| `api/settings.js` | GET harga (publik), POST harga (admin). |
| `frontend/js/payment.js` | Jumlah cetak, pembayaran, polling status. |

## Catatan keamanan dan perilaku

- Nominal tidak dikirim dari browser. Server menghitung sendiri dari pengaturan harga.
- Webhook ditolak kalau `signature_key` salah atau nominal tidak cocok.
- Status `paid` tidak pernah diturunkan lagi, walaupun ada notifikasi `expire` yang telat.
- Satu pembayaran hanya diproses sekali (anti charge ganda):
  - `client_ref` yang sama selalu mengembalikan order yang sama. Klik ganda, request paralel, dan reload halaman tidak membuat QR baru.
  - Database menjaga lewat unique index: satu `client_ref` hanya boleh punya satu order `pending`. Charge ekstra akibat request paralel langsung dibatalkan di Midtrans.
  - Kalau jumlah cetak diubah saat masih `pending`, order lama dibatalkan lalu dibuat order baru dengan nominal baru.
  - Kalau sudah `paid`, jumlah cetak tidak bisa diubah (respons 409) dan tombol Kembali dikunci, jadi tidak perlu bayar dua kali.
  - Setelah **Sudah Bayar, Lanjut**, order ditandai `consumed_at` dan tidak bisa dipakai lagi. Sesi berikutnya memakai `client_ref` baru dan harus bayar lagi.
  - Webhook yang dikirim berulang aman. Status `paid` tidak diturunkan.
  - Kalau pembayaran masuk ke order yang sudah dibatalkan atau kedaluwarsa, tercatat `paid` dan muncul peringatan di Logs Vercel. Ini perlu direfund manual lewat dashboard Midtrans.
- Kalau total harga 0, order langsung `paid` tanpa memanggil Midtrans.
- Jumlah cetak saat ini hanya menentukan nominal pembayaran. Jumlah lembar yang dicetak belum otomatis mengikuti angka itu.

## Masalah umum

| Gejala | Penyebab dan solusi |
| --- | --- |
| "Gagal membuat QRIS" | `MIDTRANS_SERVER_KEY` belum diatur atau salah, atau environment tidak cocok (Sandbox vs Production). Cek Logs di Vercel. |
| QR muncul tapi status tidak berubah | Cek pembayaran sudah sukses di dashboard Midtrans. Status tetap dicek langsung ke Midtrans tiap 4 detik, jadi webhook yang gagal tidak menghalangi. |
| Webhook error 403 | Server Key di Vercel tidak sama dengan yang dipakai Midtrans untuk transaksi itu. |
| Harga tidak berubah | Simpan di menu Pengaturan, lalu buka ulang halaman jumlah cetak. |
