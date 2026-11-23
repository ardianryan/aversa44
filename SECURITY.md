# Keamanan AVERSA 44

Dokumen ini menetapkan standar kontribusi dan mencatat celah yang masih harus diselesaikan. Ini bukan sertifikasi keamanan atau hasil audit menyeluruh. **Jangan membuka transaksi atau data pelanggan ke publik sebelum temuan prioritas di bawah ditangani dan diuji di staging.**

## Pelaporan kerentanan

Laporkan secara privat kepada penanggung jawab teknis/pengelola repositori melalui kanal privat yang disepakati panitia. Jangan membuat issue publik yang memuat cara eksploitasi, data pelanggan, token, QR, kata sandi, atau rahasia. Belum ada alamat kontak keamanan khusus yang terverifikasi; pemilik repositori perlu menetapkan dan mencantumkannya sebelum publikasi.

Sertakan lingkungan dan versi, dampak, langkah reproduksi pada data uji, serta bukti yang telah disamarkan. Jangan menguji sistem produksi atau data orang lain tanpa izin eksplisit. Pengelola perlu mengonfirmasi penerimaan, membatasi akses laporan, memperbaiki, menguji ulang, lalu menyepakati pengungkapan.

## Prioritas sebelum produksi

Temuan berikut berdasarkan pembacaan kode, bukan hasil pengujian penetrasi:

1. **Akses pesanan dan tiket:** `GET /api/orders/:orderCode` dan `POST /api/orders/lookup` dapat dipanggil tanpa autentikasi; lookup mengembalikan pesanan terhidrasi setelah verifikasi nomor WhatsApp. Akses kini dibatasi melalui pesan verifikasi masuk WhatsApp atau cookie sementara pesanan baru. Uji akses silang dan penerimaan webhook GOWA di staging; tambahkan pembatasan global berdasarkan IP tepercaya di proxy dan minimalkan data respons sebelum data pelanggan nyata dipakai.
2. **Pembayaran:** webhook QBiz kini memeriksa tanda tangan, metode, invoice, dan nominal. Validasi mata uang, jaminan anti-replay yang terikat pada tanda tangan, dan kesesuaian kontrak penyedia masih harus diuji. Tinjau pula verifikasi Xendit, bukti transfer, idempotensi, fallback QRIS lokal, dan rekonsiliasi. Jangan mengaktifkan metode pembayaran sebelum uji bersama penyedia.
3. **Konfigurasi rahasia:** Produksi memeriksa URL HTTPS, konfigurasi database, dan rahasia inti serta rahasia integrasi yang diaktifkan saat startup. Audit rahasia integrasi lainnya dan akun yang diimpor, serta ganti kredensial bawaan. Bypass konfigurasi hanya untuk pengujian lokal dan tidak boleh digunakan pada server publik.
4. **Sesi dan perlindungan endpoint:** pemeriksaan Origin untuk permintaan browser dan pembatasan CORS sudah diterapkan; sesi diperiksa terhadap status dan versi akun. Turnstile dan pembatasan per IP dalam memori diterapkan pada login, checkout, dan permintaan verifikasi dompet. Pembatasan ini berlaku per proses; siapkan pembatasan bersama di proxy bila diperlukan dan uji proteksi CSRF secara menyeluruh. Cookie memiliki HttpOnly, SameSite=Lax, dan Secure di mode produksi.
5. **Upload dan operasional:** upload media dapat diakses publik melalui URL, validasi saat ini memeriksa ukuran dan tanda awal format. Tinjau parsing, pembatasan ukuran request di proxy, sanitasi/pemrosesan ulang gambar, kuota, dan pemindaian file. Jangan menyimpan dokumen privat di direktori tersebut.
6. **Siaran OBS:** token berada di URL dan dapat masuk ke riwayat browser atau log proxy. Perlakukan URL sebagai rahasia, batasi akses log, dan putar ulang token bila bocor. SSE menggunakan memori satu proses; beberapa instance memerlukan pub/sub bersama.

## Standar perubahan

- Periksa otorisasi **server-side** untuk setiap operasi dan objek, termasuk akses lintas peran dan akun nonaktif. Jangan mengandalkan penyembunyian menu.
- Validasi input di server; gunakan query berparameter dan transaksi untuk perubahan yang memerlukan konsistensi. Jangan mengembalikan hash kata sandi, token rahasia, atau data pribadi yang tidak diperlukan.
- Uji keberhasilan, input tidak valid, akses tanpa autentikasi, akses lintas peran, replay/idempotensi, dan kondisi balapan pada perubahan yang relevan. Gunakan data dan kredensial sementara di lingkungan uji.
- Jangan memasukkan rahasia ke kode, dokumentasi, screenshot, log, issue, atau fixture. `.env.example` hanya berisi placeholder; `.gitignore` tidak menghapus rahasia yang sudah pernah terlanjur dilacak.
- Gunakan HTTPS, rahasia berbeda untuk setiap lingkungan, hak akses minimum, backup terenkripsi, serta rencana rotasi dan pemulihan. Jangan mencatat token OBS atau QR lengkap.
- Tinjau dependensi dan lisensinya, gunakan lockfile, jalankan pemeriksaan kerentanan dalam lingkungan yang sesuai, dan dokumentasikan pengecualian beserta pemiliknya.

## Bila rahasia terpapar

Batasi akses yang terdampak, putar rahasia/kredensial dari kanal aman, periksa log tanpa menyebarkan token, nilai dampak terhadap akun/pesanan, dan pulihkan layanan dengan kredensial baru. Rotasi `TICKET_HMAC_SECRET` memengaruhi validitas QR yang sudah diterbitkan; siapkan prosedur penerbitan ulang terlebih dahulu. Penghapusan dari riwayat repositori tidak menggantikan rotasi.
