/**
 * QBiz Dynamic QRIS Gateway - TypeScript / Modern ESM SDK Adapter
 * Ported directly from /Users/ardianryan/Documents/qrispaymti/sdk/qbiz.ts
 * with CRC-16 EMVCo Dynamic QRIS local fallback when QBiz daemon is offline.
 */
import crypto from 'node:crypto';

export interface QBizConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface PurchaseItem {
  name: string;
  quantity: number;
  price: number;
}

export interface CreateInvoiceOptions {
  orderId: string;
  amount: number;
  callbackUrl?: string;
  redirectUrl?: string;
  merchantId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items?: PurchaseItem[];
}

export interface Invoice {
  id: string;
  merchantId: string | null;
  orderId: string;
  baseAmount: number;
  uniqueCode: number;
  totalAmount: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  qrisPayload: string;
  checkoutUrl: string;
  redirectUrl?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  items?: PurchaseItem[] | null;
  expiredAt: string;
  paidAt?: string | null;
  createdAt: string;
  mode?: 'QBIZ_LIVE' | 'QBIZ_LOCAL_COMPAT';
}

export interface InvoiceStatus {
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  totalAmount: number;
  paidAt?: string | null;
}

export class QBizClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: QBizConfig) {
    if (!config.apiKey) {
      throw new Error('API Key is required to initialize QBizClient');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  }

  async createInvoice(options: CreateInvoiceOptions): Promise<Invoice> {
    if (!options.orderId) throw new Error('orderId is required');
    if (!options.amount || options.amount <= 0) throw new Error('amount must be greater than 0');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const url = `${this.baseUrl}/api/v1/invoices`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          order_id: options.orderId,
          amount: Math.round(options.amount),
          callback_url: options.callbackUrl,
          redirect_url: options.redirectUrl,
          merchant_id: options.merchantId,
          customer_name: options.customerName,
          customer_email: options.customerEmail,
          customer_phone: options.customerPhone,
          items: options.items,
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to create invoice`);
      }

      return {
        id: data.invoice.id,
        merchantId: data.invoice.merchant_id || null,
        orderId: data.invoice.order_id,
        baseAmount: data.invoice.base_amount,
        uniqueCode: data.invoice.unique_code,
        totalAmount: data.invoice.total_amount,
        status: data.invoice.status,
        qrisPayload: data.invoice.qris_payload,
        checkoutUrl: data.invoice.checkout_url,
        redirectUrl: data.invoice.redirect_url,
        customerName: data.invoice.customer_name,
        customerEmail: data.invoice.customer_email,
        customerPhone: data.invoice.customer_phone,
        items: data.invoice.items
          ? typeof data.invoice.items === 'string'
            ? JSON.parse(data.invoice.items)
            : data.invoice.items
          : undefined,
        expiredAt: data.invoice.expired_at || '',
        createdAt: data.invoice.created_at || new Date().toISOString(),
        mode: 'QBIZ_LIVE',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    if (!invoiceId) throw new Error('invoiceId is required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const url = `${this.baseUrl}/api/v1/invoices/${encodeURIComponent(invoiceId)}/status`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as any;
      return {
        status: data.status,
        totalAmount: data.totalAmount || data.total_amount,
        paidAt: data.paidAt || data.paid_at,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Cryptographically verify an incoming HMAC-SHA256 webhook signature with anti-replay protection.
   */
  static async verifyWebhookSignature(
    rawBody: string | Uint8Array,
    signature: string,
    secretKey: string,
    timestamp?: number | string,
    toleranceSeconds = 300
  ): Promise<boolean> {
    if (!rawBody || !signature || !secretKey) return false;

    if (timestamp) {
      const tsNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
      if (!Number.isSafeInteger(tsNum) || !/^\d+$/.test(String(timestamp))) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - tsNum) > toleranceSeconds) return false;
    }

    try {
      const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody);
      const expectedSig = crypto.createHmac('sha256', secretKey).update(bodyBuf).digest('hex');
      const expectedBuf = Buffer.from(expectedSig.toLowerCase(), 'utf8');
      const providedBuf = Buffer.from(signature.trim().toLowerCase(), 'utf8');
      return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }

  static verifyXenditCallbackToken(incomingToken: string, expectedToken: string): boolean {
    if (!incomingToken || !expectedToken) return false;
    const a = Buffer.from(incomingToken.trim(), 'utf8');
    const b = Buffer.from(expectedToken.trim(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

/**
 * Computes EMVCo CRC-16/CCITT-FALSE checksum for valid dynamic QRIS strings.
 */
function crc16Ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, val: string): string {
  const len = val.length.toString().padStart(2, '0');
  return `${tag}${len}${val}`;
}

export function buildEmvQrisPayload(totalAmount: number, orderId: string, merchantName = 'AVERSA44 SMAN 1 GEDEG'): string {
  const amtStr = Math.round(totalAmount).toString();
  const mai = tlv('00', 'ID.CO.QRIS.WWW') + tlv('01', '936009140000440044') + tlv('02', 'ID1026044004401') + tlv('03', 'UME');
  const addData = tlv('01', orderId.slice(0, 20));
  const raw =
    tlv('00', '01') +
    tlv('01', '12') + // Dynamic QRIS
    tlv('26', mai) +
    tlv('52', '8299') + // Educational institution / festival
    tlv('53', '360') + // IDR
    tlv('54', amtStr) +
    tlv('58', 'ID') +
    tlv('59', merchantName.slice(0, 25)) +
    tlv('60', 'MOJOKERTO') +
    tlv('61', '61351') +
    tlv('62', addData) +
    '6304';
  return raw + crc16Ccitt(raw);
}

/**
 * Attempts live QBiz server invoice creation; seamlessly builds compatible EMVCo Dynamic QRIS
 * using collision-free 3-digit unique code if QBiz local server (port 8000) is offline.
 */
export async function createQrisInvoiceWithFallback(
  options: CreateInvoiceOptions,
  uniqueCodeFallback: number
): Promise<Invoice> {
  const baseUrl = process.env.QBIZ_BASE_URL || 'http://localhost:8000';
  const apiKey = process.env.QBIZ_API_KEY || 'local_test_only_qbiz_api_key_not_for_production';
  const client = new QBizClient({ apiKey, baseUrl });

  try {
    return await client.createInvoice(options);
  } catch {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Pembayaran QRIS sementara tidak tersedia. Silakan coba lagi atau pilih metode lain.');
    }
    const baseAmount = Math.round(options.amount);
    const totalAmount = baseAmount + uniqueCodeFallback;
    const invId = `inv_${Date.now()}_${uniqueCodeFallback}`;
    const qrisPayload = buildEmvQrisPayload(totalAmount, options.orderId);
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
      id: invId,
      merchantId: options.merchantId || 'mrc_toko_1',
      orderId: options.orderId,
      baseAmount,
      uniqueCode: uniqueCodeFallback,
      totalAmount,
      status: 'PENDING',
      qrisPayload,
      checkoutUrl: `${options.redirectUrl || ''}`,
      redirectUrl: options.redirectUrl || null,
      customerName: options.customerName || null,
      customerEmail: options.customerEmail || null,
      customerPhone: options.customerPhone || null,
      items: options.items || null,
      expiredAt,
      createdAt: new Date().toISOString(),
      mode: 'QBIZ_LOCAL_COMPAT',
    };
  }
}

export function signQbizWebhookBody(rawBody: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(rawBody, 'utf8').digest('hex');
}
