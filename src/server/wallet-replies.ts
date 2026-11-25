import crypto from 'node:crypto';

const greetings = ['Halo!', 'Hai!', 'Halo, terima kasih.', 'Hai, terima kasih.', 'Halo, pesanmu sudah kami terima.', 'Hai, pesanmu sudah masuk.', 'Halo dari AVERSA 44.'];
const success = [
  'Nomor WhatsApp kamu berhasil diverifikasi. Kembali ke halaman Dompet Tiket dan tekan “Saya sudah kirim pesan”.',
  'Verifikasi nomor berhasil. Silakan kembali ke Dompet Tiket, lalu pilih “Saya sudah kirim pesan”.',
  'Nomor kamu sudah terverifikasi. Buka kembali halaman dompet dan tekan “Saya sudah kirim pesan”.',
  'Verifikasi WhatsApp selesai. Lanjutkan di halaman Dompet Tiket dengan menekan “Saya sudah kirim pesan”.',
  'Nomor WhatsApp telah cocok. Kembali ke situs dan pilih “Saya sudah kirim pesan” untuk melanjutkan.',
  'Nomor berhasil dicocokkan. Silakan kembali ke situs dan tekan “Saya sudah kirim pesan”.',
  'Nomor kamu sudah cocok. Di halaman Dompet Tiket, tekan “Saya sudah kirim pesan” untuk melanjutkan.',
  'Verifikasi nomor selesai. Kembali ke halaman website dan pilih “Saya sudah kirim pesan”.',
  'Pesan verifikasi diterima dan nomor cocok. Silakan tekan “Saya sudah kirim pesan” di halaman Dompet Tiket.',
];
const rejected = [
  'Verifikasi belum berhasil. Nomor pengirim mungkin berbeda atau tautan sudah kedaluwarsa. Siapkan pesan baru di Dompet Tiket.',
  'Pesan belum dapat diverifikasi. Pastikan nomor sama dengan yang dimasukkan dan buat tautan baru di website.',
  'Nomor atau pesan verifikasi belum cocok. Kembali ke Dompet Tiket dan siapkan pesan baru dari nomor yang digunakan.',
  'Verifikasi belum selesai. Pastikan pesan dikirim dari nomor yang dimasukkan di website dan tautannya masih berlaku.',
  'Pesan verifikasi tidak cocok atau sudah kedaluwarsa. Silakan buat pesan baru di halaman Dompet Tiket.',
  'Kami belum dapat mencocokkan pesan ini. Periksa nomor WhatsApp dan ulangi langkah verifikasi di website.',
  'Tautan verifikasi mungkin sudah tidak berlaku atau nomor pengirim berbeda. Siapkan pesan baru di Dompet Tiket.',
  'Verifikasi belum dapat dilanjutkan. Gunakan nomor yang sama seperti di website, lalu kirim pesan baru.',
  'Pesan ini belum dapat digunakan. Pastikan nomor pengirim sesuai dan siapkan kembali pesan di Dompet Tiket.',
  'Nomor pengirim atau tautan belum cocok. Silakan mulai ulang verifikasi dari halaman Dompet Tiket.',
];

// 7 × 9 success and 6 × 10 rejection messages.
export function walletReply(verified: boolean): string {
  const options = verified ? success : rejected;
  const greetingCount = verified ? greetings.length : greetings.length - 1;
  return greetings[crypto.randomInt(greetingCount)] + ' ' + options[crypto.randomInt(options.length)];
}

function getGowaConfig() {
  const base = process.env.GOWA_BASE_URL?.replace(/\/+$/, '');
  const username = process.env.GOWA_USERNAME;
  const password = process.env.GOWA_PASSWORD;
  const sessionId = process.env.GOWA_SESSION_ID;
  if (!base || !username || !password || !sessionId) throw new Error('GOWA reply is not configured');
  const parsed = new URL(base);
  const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  const tailnet = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && (isLoopback || (tailnet && process.env.GOWA_ALLOW_TAILNET_HTTP === '1')))) {
    throw new Error('GOWA requires HTTPS or an explicitly allowed private connection');
  }
  return {
    base,
    sessionId,
    authHeader: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
  };
}

export async function sendWhatsappText(phone: string, message: string): Promise<void> {
  const { base, sessionId, authHeader } = getGowaConfig();
  const response = await fetch(base + '/send/message', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      'X-Device-Id': sessionId,
    },
    body: JSON.stringify({ phone: phone + '@s.whatsapp.net', message }),
  });
  if (!response.ok) throw new Error('GOWA rejected message');
}

export async function sendWhatsappMedia(phone: string, imageUrl: string, caption: string): Promise<void> {
  const { base, sessionId, authHeader } = getGowaConfig();
  try {
    const response = await fetch(base + '/send/image', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'X-Device-Id': sessionId,
      },
      body: JSON.stringify({ phone: phone + '@s.whatsapp.net', image_url: imageUrl, caption }),
    });
    if (response.ok) return;
  } catch {
    // Fall back to text message with link below
  }
  await sendWhatsappText(phone, `${caption}\n\nBukti Transfer: ${imageUrl}`);
}

export async function sendWalletReply(phone: string, verified: boolean): Promise<void> {
  await sendWhatsappText(phone, walletReply(verified));
}
