import crypto from 'node:crypto';

function resolveCryptoSecret(envName: 'TICKET_HMAC_SECRET' | 'SESSION_SECRET', devFallback: string): string {
  const val = process.env[envName]?.trim() || '';
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_LOCAL_DEV !== '1') {
    if (!val || /local_test_only_/i.test(val)) {
      throw new Error(`${envName} must be set to a strong production secret.`);
    }
  }
  return val || devFallback;
}

const TICKET_HMAC_SECRET = resolveCryptoSecret('TICKET_HMAC_SECRET', 'local_test_only_ticket_hmac_secret_not_for_production');
const SESSION_SECRET = resolveCryptoSecret('SESSION_SECRET', 'local_test_only_session_secret_not_for_production');

export type QrPayloadType = 'TKT' | 'MRC';

/**
 * Generates a tamper-evident cryptographic QR payload for E-Tickets (TKT) and Merch Pickup (MRC).
 * Format: AVERSA44|<TYPE>|<CODE>|<ORDER_CODE>|<HMAC_16HEX>
 */
export function signQrPayload(type: QrPayloadType, code: string, orderCode: string): string {
  const core = `AVERSA44|${type}|${code}|${orderCode}`;
  const sig = crypto
    .createHmac('sha256', TICKET_HMAC_SECRET)
    .update(core)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
  return `${core}|${sig}`;
}

export interface ParsedQrInspection {
  validFormat: boolean;
  validSignature: boolean;
  isDirectCode: boolean;
  type?: QrPayloadType;
  code?: string;
  orderCode?: string;
  reason?: string;
}

/**
 * Parses and cryptographically verifies a scanned QR string or manual code.
 */
export function verifyQrPayload(input: string): ParsedQrInspection {
  const trimmed = input.trim();
  if (!trimmed) {
    return { validFormat: false, validSignature: false, isDirectCode: false, reason: 'Kode QR kosong.' };
  }

  // Allow direct manual entry of ticket_code (TKT-...) or order_code (AVR44-...) by authorized gate staff
  if (/^TKT-AVR44-[A-Z0-9-]+$/i.test(trimmed)) {
    return {
      validFormat: true,
      validSignature: true,
      isDirectCode: true,
      type: 'TKT',
      code: trimmed.toUpperCase(),
      reason: 'Pencarian manual kode tiket oleh petugas.',
    };
  }
  if (/^AVR44-[A-Z0-9-]+$/i.test(trimmed)) {
    return {
      validFormat: true,
      validSignature: true,
      isDirectCode: true,
      type: 'MRC',
      code: trimmed.toUpperCase(),
      orderCode: trimmed.toUpperCase(),
      reason: 'Pencarian manual kode pesanan merch oleh petugas.',
    };
  }

  const parts = trimmed.split('|');
  if (parts.length !== 5 || parts[0] !== 'AVERSA44') {
    return {
      validFormat: false,
      validSignature: false,
      isDirectCode: false,
      reason: 'Format QR bukan merupakan QR resmi AVERSA 44 SMAN 1 Gedeg.',
    };
  }

  const [, rawType, code, orderCode, providedSig] = parts;
  if (rawType !== 'TKT' && rawType !== 'MRC') {
    return {
      validFormat: false,
      validSignature: false,
      isDirectCode: false,
      reason: 'Tipe token QR tidak dikenali.',
    };
  }

  const core = `AVERSA44|${rawType}|${code}|${orderCode}`;
  const expectedSig = crypto
    .createHmac('sha256', TICKET_HMAC_SECRET)
    .update(core)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from((providedSig || '').toUpperCase(), 'utf8');

  const sigMatch =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!sigMatch) {
    return {
      validFormat: true,
      validSignature: false,
      isDirectCode: false,
      type: rawType,
      code,
      orderCode,
      reason: 'Signature kriptografis HMAC-SHA256 tidak cocok (QR berpotensi dipalsukan atau diubah).',
    };
  }

  return {
    validFormat: true,
    validSignature: true,
    isDirectCode: false,
    type: rawType,
    code,
    orderCode,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  return keyBuf.length === derivedBuf.length && crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface StaffSessionPayload {
  userId: number;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'CASHIER' | 'SCANNER' | 'MEDIA';
  sessionVersion: number;
  exp: number;
}

export function signSessionToken(payload: Omit<StaffSessionPayload, 'exp'>, ttlSeconds = 43200): string {
  const full: StaffSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string | undefined): StaffSessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as StaffSessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
