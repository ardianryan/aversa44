import crypto from 'node:crypto';

const secret = () => {
  const val = process.env.SESSION_SECRET?.trim() || '';
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_LOCAL_DEV !== '1') {
    if (!val || /local_test_only_/i.test(val)) {
      throw new Error('SESSION_SECRET must be set to a strong production secret.');
    }
  }
  return val || 'local_test_only_session_secret_not_for_production';
};

export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  if (!/^62[0-9]{8,13}$/.test(digits)) return null;
  return digits;
}

export function otpDigest(phone: string, code: string): string {
  return crypto.createHmac('sha256', secret()).update(`wallet-otp:${phone}:${code}`).digest('hex');
}

export function signWalletAccess(kind: 'order' | 'phone', value: string): string {
  const payload = Buffer.from(JSON.stringify({ kind, value, exp: Date.now() + 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update('wallet:' + payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyWalletAccess(token: string | undefined): { kind: 'order' | 'phone'; value: string } | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra) return null;
  const expected = crypto.createHmac('sha256', secret()).update('wallet:' + payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['order', 'phone'].includes(data.kind) || typeof data.value !== 'string' || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
