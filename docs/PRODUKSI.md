# Panduan persiapan produksi

Dokumen ini adalah daftar kerja untuk operator. Selesaikan prioritas sebelum produksi di [SECURITY.md](../SECURITY.md) terlebih dahulu. Pengujian lokal tidak menjamin pembayaran, kapasitas, atau keamanan lingkungan produksi.

## Konfigurasi dan keamanan

1. Siapkan PostgreSQL dan penyimpanan tetap untuk `public/uploads/media/`. Cadangkan database dan direktori unggahan bersama-sama; uji pemulihannya. Aplikasi mencoba memeriksa dan membuat database lewat database `postgres`, sehingga hak akses PostgreSQL harus sesuai atau database disiapkan sebelumnya dengan akses yang diperlukan.
2. Isi variabel dalam `.env.example` melalui mekanisme rahasia server. Jangan unggah `.env`, cadangan database, token OBS, atau direktori unggahan privat ke repositori publik.
3. Isi `SESSION_SECRET` dan `TICKET_HMAC_SECRET` dengan nilai acak yang berbeda dan kuat. Pertahankan nilai tersebut antar-restart. Mengganti rahasia sesi membuat sesi lama tidak berlaku; mengganti rahasia tiket dapat membuat QR yang sudah terbit gagal diverifikasi.
4. Tentukan `PUBLIC_SITE_URL` dengan alamat HTTPS resmi. Siapkan HTTPS dan reverse proxy. Cookie login produksi memakai atribut Secure dan memerlukan HTTPS.
5. Siapkan admin awal untuk database kosong sesuai README, kemudian hapus variabel bootstrap. Untuk database yang diimpor, audit akun yang sudah ada dan ganti semua kata sandi bawaan. Perubahan kata sandi mencabut sesi lain; sesi memiliki masa berlaku hingga 12 jam.
6. Batasi akses ke Office dan PostgreSQL sesuai kebutuhan, siapkan pencatatan serta pembatasan percobaan login di infrastruktur, dan lakukan peninjauan keamanan sebelum peluncuran. Kode saat ini belum menyediakan pembatasan percobaan login.
7. Endpoint simulasi pembayaran dinonaktifkan saat `NODE_ENV=production`. Periksa pula konfigurasi dan uji pembayaran nyata secara terpisah sebelum penjualan dibuka.

## Pembayaran dan isi situs

- Isi kredensial dan alamat QBiz yang sah, `QBIZ_MERCHANT_ID`, dan `QBIZ_WEBHOOK_SECRET`; atur `XENDIT_CALLBACK_TOKEN` bila integrasi digunakan. Pastikan webhook dapat mencapai domain HTTPS resmi dan cocok dengan pengaturan penyedia.
- Periksa seluruh metode pembayaran, nominal, masa berlaku, rekonsiliasi, dan penanganan kegagalan bersama penyedia. Fallback QBiz lokal hanya tersedia pada mode pengembangan; di produksi, QRIS gagal tertutup jika layanan QBiz tidak tersedia. E2E bawaan memakai fallback sehingga dijalankan pada server pengembangan dan database uji.
- Periksa tanggal, lokasi, kontak, proposal, katalog, kuota, ongkir, logo mitra, dan sponsor di Office. Jangan membuka penjualan sampai informasi dan metode pembayarannya benar.

## Build, jaringan, dan operasi

- Pasang dependensi dari lockfile dengan `npm ci`, jalankan `npm run build`, lalu jalankan `NODE_ENV=production npm start` melalui pengelola proses yang melakukan restart otomatis.
- Jalankan satu instance aplikasi untuk siaran OBS saat ini. Pelanggan SSE disimpan di memori proses, sehingga beberapa instance memerlukan mekanisme pub/sub bersama sebelum dapat digunakan secara andal. Konfigurasikan proxy agar tidak melakukan buffering SSE dan tidak memutus koneksi yang aktif.
- Cadangkan dan pantau database, direktori unggahan, ruang disk, error aplikasi, pembayaran, dan ketersediaan server. Uji pemulihan setelah restart serta saat jaringan OBS terputus.
- Lakukan uji beban, uji pembayaran, pemeriksaan akses per peran, uji browser desktop/mobile, scanner, dan latihan siaran di lingkungan staging yang menyerupai produksi. E2E bawaan mengubah data dan menggunakan akun lokal, sehingga hanya untuk lingkungan uji.

## Verifikasi dompet melalui GOWA

Pembeli mengirim pesan verifikasi yang disiapkan situs dari nomor WhatsApp yang dipakai saat memesan. Setelah pesan verifikasi diterima, aplikasi dapat mengirim balasan hasil melalui GOWA. Atur GOWA_BASE_URL, GOWA_USERNAME, dan GOWA_PASSWORD sebagai rahasia server; GOWA_SESSION_ID memilih sesi. HTTPS wajib digunakan selain loopback, atau jaringan Tailscale tepercaya saat GOWA_ALLOW_TAILNET_HTTP=1 untuk pengembangan lokal. Atur `WHATSAPP_BOT_PHONE` (format internasional), `GOWA_SESSION_ID`, dan `WHATSAPP_WEBHOOK_SECRET` pada server AVERSA; atur nilai secret yang sama dan event `message` di GOWA. Arahkan webhook GOWA ke `https://DOMAIN-AVERSA/api/webhooks/whatsapp`; alamat tersebut harus dapat dicapai GOWA dan memakai HTTPS saat melintasi jaringan yang tidak tepercaya. Konfigurasi dilakukan pada instance yang tepat, tanpa mengganti webhook layanan lain secara tidak sengaja.

GOWA menandatangani isi mentah dengan HMAC-SHA256 pada header `X-Hub-Signature-256`; aplikasi memverifikasi tanda tangan, sesi yang dikonfigurasi, nomor pengirim, percakapan personal, serta tantangan acak satu kali yang berlaku lima menit. Pesan yang ditandatangani ulang tidak dapat dipakai untuk membuka sesi lain setelah tantangan dikonsumsi. Tambahkan pembatasan global/IP pada proxy dan uji pengiriman dari nomor tim dengan GOWA asli sebelum produksi. Bila webhook tidak dapat diakses, verifikasi gagal tertutup dan perlu prosedur bantuan panitia.

Balasan diproses maksimal sekali untuk setiap ID pesan webhook. Jika pengiriman balasan gagal, status verifikasi tetap dapat diperiksa di situs; pengunjung dapat mengirim pesan baru bila memerlukan balasan. Variasi kalimat tidak menjamin akun WhatsApp terhindar dari pembatasan penyedia.

Server produksi mensyaratkan `PUBLIC_SITE_URL` HTTPS, parameter PostgreSQL eksplisit, serta `SESSION_SECRET` dan `TICKET_HMAC_SECRET` yang berbeda dan masing-masing minimal 32 karakter. QRIS PayMTI bersifat opsional: atur `QBIZ_ENABLED=1` hanya setelah `QBIZ_BASE_URL`, `QBIZ_API_KEY`, `QBIZ_MERCHANT_ID`, dan `QBIZ_WEBHOOK_SECRET` dikonfigurasi dan diuji; rahasia webhook minimal 32 karakter. `XENDIT_CALLBACK_TOKEN` juga opsional dan harus kuat jika digunakan. Gunakan rahasia acak dari pengelola rahasia. `ALLOW_INSECURE_LOCAL_DEV=1` hanya untuk pengujian di URL localhost, bukan deployment publik. Rotasi kunci tiket dapat membatalkan QR yang sudah diterbitkan.
