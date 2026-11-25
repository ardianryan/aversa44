export type ErrorCode = 400 | 403 | 404 | 500 | 502 | 503 | 505;

interface ErrorCopy {
  code: ErrorCode;
  badge: string;
  title: string;
  message: string;
  hint: string;
}

const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  400: {
    code: 400,
    badge: 'PERMINTAAN TIDAK VALID',
    title: 'Permintaan Tidak Dapat Diproses',
    message: 'Format alamat atau data yang dikirim tidak dikenali oleh sistem.',
    hint: 'Periksa kembali tautan yang Anda buka atau kembali ke beranda AVERSA 44.',
  },
  403: {
    code: 403,
    badge: 'AKSES DIBATASI',
    title: 'Akses ke Halaman Ini Ditolak',
    message: 'Anda tidak memiliki izin untuk membuka sumber daya atau halaman ini.',
    hint: 'Jika Anda panitia resmi, silakan masuk melalui portal yang sesuai atau hubungi koordinator.',
  },
  404: {
    code: 404,
    badge: 'HALAMAN TIDAK DITEMUKAN',
    title: 'Tautan Tidak Tersedia',
    message: 'Halaman yang Anda cari tidak ditemukan, telah dipindahkan, atau sudah berakhir.',
    hint: 'Gunakan tombol di bawah untuk kembali ke panggung utama AVERSA 44.',
  },
  500: {
    code: 500,
    badge: 'GANGGUAN SERVER',
    title: 'Terjadi Kendala Sementara',
    message: 'Sistem kami mengalami gangguan tak terduga saat memproses permintaan Anda.',
    hint: 'Silakan muat ulang halaman dalam beberapa saat.',
  },
  502: {
    code: 502,
    badge: 'BAD GATEWAY',
    title: 'Koneksi Gateway Terputus',
    message: 'Server gerbang tidak menerima respons yang valid dari layanan utama.',
    hint: 'Tunggu beberapa detik lalu muat ulang halaman ini.',
  },
  503: {
    code: 503,
    badge: 'LAYANAN SIBUK / PEMELIHARAAN',
    title: 'Layanan Sedang Disiapkan',
    message: 'Server sedang dalam pembaruan singkat atau menerima trafik sangat tinggi.',
    hint: 'Silakan coba kembali dalam 10 hingga 30 detik.',
  },
  505: {
    code: 505,
    badge: 'VERSI PROTOKOL TIDAK DIDUKUNG',
    title: 'Versi HTTP Tidak Didukung',
    message: 'Browser atau klien mengirimkan versi protokol HTTP yang tidak didukung server.',
    hint: 'Perbarui browser Anda atau gunakan koneksi HTTPS standar.',
  },
};

export function resolveErrorCode(raw: number | string): ErrorCode {
  const num = Number(raw);
  if (num === 400 || num === 403 || num === 404 || num === 500 || num === 502 || num === 503 || num === 505) {
    return num;
  }
  return 500;
}

export function renderBrandedErrorHtml(rawCode: number | string): string {
  const code = resolveErrorCode(rawCode);
  const info = ERROR_COPY[code];

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${info.code} - ${info.title} | AVERSA 44</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=44" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100dvh;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background: radial-gradient(circle at 50% 15%, #360538 0%, #1A021D 60%, #0D010F 100%);
      color: #FFF5D6;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(560px, 100%);
      background: #250428;
      border: 1px solid rgba(245, 197, 56, 0.38);
      border-top: 2px solid rgba(253, 243, 157, 0.72);
      border-radius: 20px;
      padding: 36px 28px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(13, 1, 15, 0.65);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid rgba(245, 197, 56, 0.45);
      background: #18021B;
      color: #F7D160;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
    }
    .code {
      margin-top: 16px;
      font-family: Georgia, serif;
      font-size: clamp(60px, 12vw, 88px);
      font-weight: 800;
      line-height: 1;
      color: #F5C538;
      text-shadow: 0 8px 28px rgba(245, 197, 56, 0.25);
    }
    h1 {
      margin-top: 12px;
      font-size: clamp(20px, 3vw, 26px);
      font-weight: 800;
      color: #FFF5D6;
    }
    p {
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 245, 214, 0.84);
    }
    .hint {
      margin-top: 14px;
      font-size: 12px;
      color: #A0D9CA;
    }
    .actions {
      margin-top: 26px;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 10px 22px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
      border: 0;
    }
    .btn-primary { background: #F5C538; color: #310603; }
    .btn-secondary {
      background: #18021B;
      color: #FDF39D;
      border: 1px solid rgba(245, 197, 56, 0.4);
    }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">${info.badge}</span>
    <div class="code">${info.code}</div>
    <h1>${info.title}</h1>
    <p>${info.message}</p>
    <p class="hint">${info.hint}</p>
    <div class="actions">
      <a class="btn btn-primary" href="/">Kembali ke Beranda</a>
      <button class="btn btn-secondary" type="button" onclick="window.location.reload()">Muat Ulang</button>
    </div>
  </main>
</body>
</html>`;
}
