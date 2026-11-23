# Arsitektur dan peta kode

## Komponen

- `src/client/App.tsx`: rute publik, katalog, keranjang, serta pemuatan Office dan OBS secara terpisah.
- `src/client/components/StageHomeSection.tsx`, `TicketingSection.tsx`, `MerchStoreSection.tsx`, `TicketWalletSection.tsx`: halaman publik.
- `src/client/components/OfficePortal.tsx` dan `OfficeCmsModules.tsx`: navigasi dan modul panitia; hak akses tetap harus diperiksa server.
- `src/client/components/media/`: editor, crop, trim, logo, dan kontrol OBS. `src/shared/media-timeline.ts` mengatur waktu adegan pratinjau/ekspor.
- `src/client/pages/ObsOverlayDisplay.tsx`: Browser Source transparan; menerima SSE dan memuat ulang keadaan saat koneksi kembali.
- `src/server/index.ts`: rute Hono, autentikasi, checkout, webhook, CMS, dan SSE. `db.ts`: skema dan data awal; `crypto-ticket.ts`: tanda tangan dan sesi; `sdk/qbiz.ts`: integrasi QBiz.
- `public/assets/` dan `referensi desain/`: aset serta referensi. `public/uploads/media/`: unggahan runtime, harus dipertahankan di penyimpanan tetap dan tidak ditambahkan ke repositori.

## Alur utama

Dompet memakai pesan masuk WhatsApp melalui webhook GOWA yang ditandatangani. Pembeli mengirim tantangan dari nomor pemesanan; GOWA dapat membalas hasil, dan cookie sementara membatasi akses pesanan baru dan hasil verifikasi. Lihat panduan produksi untuk konfigurasi dan keterbatasannya.

Katalog publik diambil dari `/api/catalog`. Checkout mengirim pesanan ke `/api/orders`; harga dan stok harus dihitung server. Webhook atau konfirmasi petugas dapat menandai pembayaran lunas; tiket dikelola dan dipindai melalui API scanner. Lihat [SECURITY](../SECURITY.md) untuk batasan akses pesanan dan verifikasi pembayaran yang belum selesai.

Office memakai cookie sesi dan RBAC. Rute utama: `/office/ringkasan`, `scanner`, `pesanan`, `tiket`, `merch`, `pengiriman`, `panggung`, `timeline`, `anatomi`, `media-studio`, `logo-media`, `live-kit`, `sponsorship`, dan `panitia`, semuanya di bawah `/office/`. Peran MEDIA dapat membuka tiga modul media; pengelolaan keuangan bukan akses MEDIA.

Pengendali OBS menyimpan perubahan dan mengirim SSE per slug. Browser Source mengakses `/obs?overlay=...&token=...`, mengambil `/api/obs/state`, dan membuka `/api/obs/stream`. Sponsor dan satu media partner dikelola pada `/office/logo-media`; tiga sponsor aktif teratas menurut urutan tampil paling besar. Koneksi dan token OBS dibahas di panduan produksi dan keamanan.

Media Studio merender pratinjau dan ekspor di browser, dengan PNG dan video MP4, serta efek suara. Musik ditambahkan saat publikasi di platform tujuan. Ketersediaan konversi HEIC/MOV bergantung pada dukungan browser dan perlu diuji dengan berkas nyata.

## Data dan perubahan skema

`initDatabase()` menjalankan DDL dan seed saat server mulai; belum ada sistem migrasi berversi. Perubahan skema perlu dirancang agar aman pada database yang sudah terisi, diuji pada salinan staging, dan disertai rencana backup serta rollback. Jangan menganggap seed memperbarui data lama. Direktori upload perlu dicadangkan bersama database.

## Aset dan batas mesin pengembang

Referensi Canva ada di repositori. `scripts/sync_assets.py` memiliki sumber absolut yang spesifik mesin pengembang semula; baca dan sesuaikan sumber sebelum menjalankannya, jangan menganggap skrip ini portabel. Gunakan logo sekolah, logo 44 resmi, dan wordmark AVERSA sesuai konteks; logo provinsi tidak dipakai. Hormati lisensi aset dan dependensi; lisensi komponen ReactBits tersimpan di `src/client/components/reactbits/REACTBITS-LICENSE.md`.
