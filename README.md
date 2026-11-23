# AVERSA 44

Situs Dies Natalis ke-44 SMA Negeri 1 Gedeg, dengan portal publik, pengelolaan tiket dan merchandise, serta Media Studio dan perangkat siaran OBS.

## Menjalankan di komputer lokal

Siapkan Node.js 26, npm, dan PostgreSQL. Salin `.env.example` menjadi `.env`, lalu isi pengaturan PostgreSQL dan rahasia masing-masing. Aplikasi membaca variabel `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, dan `PGDATABASE`; `DATABASE_URL` saja belum digunakan.

```sh
npm ci
npm run dev
```

Vite berjalan di port 5173 dan API di port 4400. Untuk menjalankan hasil build melalui server pada port 4400:

```sh
npm run build
NODE_ENV=production npm start
```

Pada database lokal yang kosong dan server yang **tidak** memakai `NODE_ENV=production`, data uji menyediakan akun berikut. Akun ini hanya untuk pengembangan, bukan untuk produksi:

| Peran | Username | Kata sandi lokal |
| --- | --- | --- |
| Admin | admin | Aversa44! |
| Kasir | kasir | Kasir44! |
| Scanner | scanner | Gate44! |
| Media | media | Media44! |

Pengaturan `NODE_ENV=production` pada perintah di atas memakai aturan akun produksi, meskipun server berjalan di komputer lokal. Database yang sudah berisi akun tidak otomatis diganti. Bila kata sandi akun lokal sudah diubah, gunakan kata sandi baru.

## Produksi dan akun awal

Baca [Panduan Produksi](docs/PRODUKSI.md) sebelum membuka akses publik. Pada database produksi yang belum mempunyai akun, isi `BOOTSTRAP_ADMIN_USERNAME` dan `BOOTSTRAP_ADMIN_PASSWORD` sebagai rahasia lingkungan server. Username terdiri dari 3-40 huruf, angka, titik, garis bawah, atau tanda hubung; kata sandi minimal 12 karakter dan maksimal 100 karakter. `BOOTSTRAP_ADMIN_NAME` opsional. Server menolak memulai jika database panitia kosong dan kredensial awal tidak valid.

Setelah admin pertama dibuat, hapus variabel bootstrap dari lingkungan server dan buat akun panitia lain di Office. Jika database dipindahkan dari lokal, akun dan kata sandinya ikut terbawa: ganti kata sandi semua akun atau nonaktifkan akun yang tidak diperlukan. Menghapus kotak petunjuk login tidak mengubah akun di database.

## Pemeriksaan

Jalankan pada database lokal atau lingkungan uji, karena E2E membuat dan mengubah data uji serta menggunakan akun bawaan lokal:

```sh
! grep -rn "—" src/ index.html
npx tsc -p tsconfig.json --noEmit
npm run build
npx tsx scripts/verify-e2e.ts
```

Server dalam mode pengembangan dan PostgreSQL uji harus aktif sebelum E2E; fallback QRIS yang dipakai E2E dinonaktifkan dalam mode produksi. Skrip E2E saat ini memakai kredensial lokal di dalam skrip; jangan jalankan pada database produksi. Verifikasi visual di browser untuk perubahan UI. Informasi fitur dan alur ada di [PRD](PRD.md), aturan visual di [DESIGN](DESIGN.md), dan aturan kontribusi di [AGENTS](AGENTS.md).

## Indeks dokumentasi

- [Arsitektur dan peta kode](docs/ARSITEKTUR.md)
- [Panduan kontribusi](CONTRIBUTING.md)
- [Standar dan pelaporan keamanan](SECURITY.md)
- [Pengujian dan serah terima](docs/PENGUJIAN.md)
- [Panduan produksi dan operasional](docs/PRODUKSI.md)

Periksa prioritas keamanan di SECURITY.md sebelum mengaktifkan transaksi atau data pelanggan nyata.

## Lisensi, sitasi, dan rilis

Kode proyek dilisensikan dengan [MIT](LICENSE). Aset, logo, font, foto, dan materi pihak ketiga tetap tunduk pada hak serta izin pemiliknya. Metadata sitasi tersedia di [CITATION.cff](CITATION.cff) dan [CITATION.bib](CITATION.bib). Perubahan dicatat di [CHANGELOG](CHANGELOG.md); petunjuk CI, image, dan penerbitan ada di [panduan rilis](docs/RELEASE.md).

Dependabot mengelompokkan pembaruan minor dan patch mingguan; pembaruan keamanan dan versi baru tetap perlu ditinjau saat tersedia.
