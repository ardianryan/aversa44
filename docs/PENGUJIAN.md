# Pengujian dan serah terima

Gunakan lingkungan uji terpisah. `scripts/verify-e2e.ts` membuat pesanan dan data lain, memanggil webhook, dan menggunakan kredensial lokal yang tertulis di skrip. Jangan arahkan ke produksi. Pastikan PostgreSQL uji dan server port 4400 dalam mode pengembangan aktif, kemudian jalankan pemeriksaan README; `npm run build` sudah mencakup TypeScript tetapi pemeriksaan terpisah juga diwajibkan AGENTS.

## Skenario menurut perubahan

- Publik: refresh setiap slug, katalog kosong, checkout, dompet, error jaringan, ukuran desktop/mobile, zoom dan keyboard.
- Office: masing-masing peran, akses terlarang di server, refresh slug, accordion, fokus sheet, dan perubahan kata sandi dengan akun sementara.
- Media: semua template dan rasio yang terdampak, margin aman, unggah/crop/trim, pratinjau, isi MP4 dan PNG, logo/sponsor, reduced motion, serta file HEIC/MOV nyata yang mewakili perangkat pengguna.
- OBS: setiap layout yang terdampak, area transparan, sponsor kosong dan terisi, pergantian cepat, stinger, token salah, koneksi terputus lalu kembali, serta uji dengan OBS sebenarnya.
- Pembayaran: uji penyedia dan webhook di staging menggunakan akun dan transaksi uji; E2E lokal bukan bukti integrasi produksi.

Catat ukuran viewport, browser, hasil, masalah yang tersisa, dan apakah uji memakai aset atau data sementara. Jangan mengklaim kesiapan produksi hanya karena build atau E2E lolos.
