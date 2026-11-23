# Panduan kontribusi

Mulai dari [README](README.md), [arsitektur](docs/ARSITEKTUR.md), [standar keamanan](SECURITY.md), [PRD](PRD.md), [DESIGN](DESIGN.md), dan [AGENTS](AGENTS.md). Keputusan pengguna yang lebih baru tentang identitas dan fitur berlaku ketika dokumen lama bertentangan; perbarui dokumen yang terdampak dalam perubahan yang sama.

## Cara bekerja

1. Gunakan database dan akun uji terpisah. Jangan menguji E2E terhadap produksi atau memasukkan data pribadi ke fixture.
2. Pertahankan rute refresh-safe, RBAC di server, warna dan aset AVERSA, serta perilaku kosong katalog. Formulir/detail memakai `ResponsiveSheet`; `ConfirmModal` untuk konfirmasi sederhana.
3. Buat perubahan kecil yang dapat ditinjau. Tulis pengujian yang memeriksa perilaku dan batas akses yang berubah. Jangan memasukkan `.env`, unggahan, rahasia, atau artefak build ke repositori.
4. Jalankan pemeriksaan di README. Untuk UI, periksa browser 1440×900 dan 375×812, keyboard, fokus, reduced motion, overflow, dan error konsol/jaringan. Untuk media, uji rasio dan ekspor yang terdampak; untuk OBS, uji transparansi, pembaruan SSE, reconnect, dan token tidak valid.
5. Jelaskan masalah, perubahan, pengujian, dan keterbatasan dalam deskripsi perubahan. Perbarui dokumen untuk perubahan konfigurasi, endpoint, data, atau operasional.

Kata sandi akun lokal hanya untuk database uji. E2E saat ini mengandalkan kredensial itu dan membuat data; lihat README sebelum menjalankan. Laporkan masalah keamanan mengikuti [SECURITY.md](SECURITY.md).
