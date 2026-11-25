import { sealCloudSecret } from './security/cloud-secrets.ts';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isAllowedOrigin, isPrivateOrTailscaleIp, normalizeIp, resolveChallengeHostname, resolveClientIp, verifyTurnstile } from './security/edge.ts';
import { sendWalletReply } from './wallet-replies.ts';
import { normalizePhone, otpDigest, signWalletAccess, verifyWalletAccess } from './wallet-auth.ts';
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { renderBrandedErrorHtml, resolveErrorCode } from './error-page.ts';
import { z } from 'zod';
import QRCode from 'qrcode';
import { initDatabase, pool } from './db.ts';
import {
  signQrPayload,
  verifyQrPayload,
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  type StaffSessionPayload,
} from './crypto-ticket.ts';
import {
  QBizClient,
  createQrisInvoiceWithFallback,
  signQbizWebhookBody,
} from './sdk/qbiz.ts';

const app = new Hono();
const PORT = Number(process.env.PORT || 4400);
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const qrisEnabled = process.env.NODE_ENV !== 'production' || process.env.QBIZ_ENABLED === '1';
const QBIZ_WEBHOOK_SECRET = process.env.QBIZ_WEBHOOK_SECRET || 'local_test_only_qbiz_webhook_secret_not_for_production';
const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN || 'local_test_only_xendit_callback_token_not_for_production';

const turnstileEnabled = process.env.NODE_ENV === 'production' ? process.env.TURNSTILE_ENABLED !== '0' : process.env.TURNSTILE_ENABLED === '1';
const trustedProxies = (process.env.TRUSTED_PROXY_IPS || '').split(',').map((ip) => normalizeIp(ip)).filter((ip): ip is string => Boolean(ip));
const localBypass = process.env.ALLOW_INSECURE_LOCAL_DEV === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(PUBLIC_SITE_URL);
const buckets = new Map<string, { count: number; until: number }>();

const isHttpsRequest = (c: any): boolean =>
  c.req.header('X-Forwarded-Proto') === 'https' || c.req.url.startsWith('https://');

const compressMiddleware = compress();
app.use('*', async (c, next) => {
  if (c.req.path === '/api/obs/stream') return next();
  return compressMiddleware(c, next);
});

app.use('*', async (c, next) => {
  const peer = normalizeIp(getConnInfo(c).remote.address || '');
  const isHealth = c.req.path === '/api/health' && (peer === '127.0.0.1' || peer === '::1');
  const isAllowedDirectPeer = isPrivateOrTailscaleIp(peer);
  if (process.env.NODE_ENV === 'production' && !localBypass && !isHealth && !isAllowedDirectPeer && (!peer || !trustedProxies.includes(peer))) {
    if (!c.req.path.startsWith('/api/') && (c.req.header('Accept') || '').includes('text/html')) {
      return c.html(renderBrandedErrorHtml(403), 403);
    }
    return c.json({ success: false, error: 'Akses tidak diizinkan.' }, 403);
  }
  const ip = resolveClientIp(peer || '', c.req.header('X-Real-IP') || '', trustedProxies);
  if (!ip && !isHealth) {
    if (!c.req.path.startsWith('/api/') && (c.req.header('Accept') || '').includes('text/html')) {
      return c.html(renderBrandedErrorHtml(400), 400);
    }
    return c.json({ success: false, error: 'Alamat pengunjung tidak tersedia.' }, 400);
  }
  c.set('clientIp' as never, (ip || peer || '') as never);
  await next();
});

app.get('/api/security/turnstile', (c) => {
  const clientIp = (c.get('clientIp' as never) as string) || '';
  const effectiveEnabled = turnstileEnabled && !isPrivateOrTailscaleIp(clientIp);
  return c.json({ enabled: effectiveEnabled, siteKey: effectiveEnabled ? process.env.TURNSTILE_SITE_KEY || '' : '' });
});

async function checkChallenge(c: any, token: unknown, action: string): Promise<Response | null> {
  const ip = (c.get('clientIp') as string) || '';
  if (!turnstileEnabled || isPrivateOrTailscaleIp(ip)) return null;
  const now = Date.now();
  const key = `${action}:${ip}`;
  const old = buckets.get(key);
  if ((!old || old.until <= now) && buckets.size >= 10000) {
    for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
    if (buckets.size >= 10000) return c.json({ success: false, error: 'Layanan sedang sibuk. Coba lagi sebentar.' }, 429);
  }
  if (!old || old.until <= now) buckets.set(key, { count: 1, until: now + 60000 });
  else if (++old.count > 20) return c.json({ success: false, error: 'Terlalu banyak percobaan. Coba lagi sebentar.' }, 429);
  if (buckets.size > 10000) for (const [k, v] of buckets) { if (v.until <= now) buckets.delete(k); }
  const expectedHost = resolveChallengeHostname(c.req.header('Origin'), c.req.header('Host'), PUBLIC_SITE_URL, process.env.NODE_ENV !== 'production');
  const ok = await verifyTurnstile(token, action, expectedHost, ip, process.env.TURNSTILE_SECRET_KEY || '');
  return ok ? null : c.json({ success: false, error: 'Verifikasi keamanan belum berhasil. Silakan coba lagi.' }, 403);
}

// Security Headers Middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return PUBLIC_SITE_URL;
    if (isAllowedOrigin(origin, PUBLIC_SITE_URL, process.env.NODE_ENV !== 'production')) return origin;
    return '';
  },
  credentials: true,
}));

// Reject browser cross-origin writes; webhooks without Origin remain supported.
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowed = isAllowedOrigin(origin, PUBLIC_SITE_URL, process.env.NODE_ENV !== 'production');
  if (origin && !allowed && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return c.json({ success: false, error: 'Permintaan dari alamat ini tidak diizinkan.' }, 403);
  }
  await next();
});

// Helper: Extract staff session from signed HttpOnly cookie
function getStaffSession(c: any): StaffSessionPayload | null {
  if (c.get('staffSessionInvalid')) return null;
  const token = getCookie(c, 'aversa44_staff_session');
  return verifySessionToken(token);
}

function requireRoles(
  c: any,
  allowedRoles: Array<'ADMIN' | 'CASHIER' | 'SCANNER' | 'MEDIA'>
): StaffSessionPayload | Response {
  const session = getStaffSession(c);
  if (!session) {
    return c.json({ success: false, error: 'Autentikasi petugas diperlukan. Silakan login terlebih dahulu.' }, 401);
  }
  if (!allowedRoles.includes(session.role)) {
    return c.json({ success: false, error: `Akses ditolak untuk peran ${session.role}.` }, 403);
  }
  return session;
}

// Check current account status and version before trusting a signed staff session.
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, 'aversa44_staff_session');
  const session = verifySessionToken(token);
  if (session) {
    const result = await pool.query('SELECT role, is_active, session_version FROM staff_users WHERE id = $1', [session.userId]);
    const user = result.rows[0];
    if (!user?.is_active || user.role !== session.role || user.session_version !== session.sessionVersion) {
      (c as any).set('staffSessionInvalid', true);
    }
  }
  await next();
});

// Helper: Settle order atomically (used by QBiz webhook, Xendit webhook, and POS Cash confirmation)
async function settleOrderPayment(
  client: any,
  orderId: number,
  verifiedBy: string
) {
  const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  const order = orderRes.rows[0];
  if (!order) return null;

  if (order.payment_status === 'PAID') {
    return order; // Idempotent guard
  }

  const nextFulfillment =
    order.order_type === 'TICKET_ONLY'
      ? 'COMPLETED'
      : order.fulfillment_mode === 'PICKUP_BOOTH'
      ? 'READY_FOR_PICKUP'
      : 'UNFULFILLED';

  const updatedRes = await client.query(
    `UPDATE orders
     SET payment_status = 'PAID',
         paid_at = COALESCE(paid_at, NOW()),
         verified_by = $1,
         fulfillment_status = $2
     WHERE id = $3
     RETURNING *`,
    [verifiedBy, nextFulfillment, orderId]
  );

  await client.query(
    `UPDATE issued_tickets
     SET status = 'ACTIVE'
     WHERE order_id = $1 AND status = 'PENDING_PAYMENT'`,
    [orderId]
  );

  return updatedRes.rows[0];
}

// Helper: Generate QR Data URL safely
async function toQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 360,
    margin: 2,
    color: { dark: '#1a021d', light: '#fff9e6' },
    errorCorrectionLevel: 'M',
  });
}

// ---------------------------------------------------------------------------
// 1. HEALTH & PUBLIC CATALOG API
// ---------------------------------------------------------------------------

app.get('/api/health', async (c) => {
  const dbCheck = await pool.query('SELECT NOW() AS db_time');
  return c.json({
    ok: true,
    service: 'AVERSA 44 SMAN 1 Gedeg API',
    dbTime: dbCheck.rows[0].db_time,
  });
});

app.get('/api/catalog', async (c) => {
  const [timelineRes, tiersRes, merchRes, zonesRes, settingsRes] = await Promise.all([
    pool.query('SELECT * FROM event_timeline WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM ticket_tiers WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM merch_products WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM shipping_zones WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT value_json FROM site_settings WHERE key = $1', ['public_config']),
  ]);

  const cfg = settingsRes.rows[0]?.value_json || {};

  return c.json({
    success: true,
    eventMeta: {
      school: cfg.school || 'SMA Negeri 1 Gedeg',
      location: cfg.location || 'Kabupaten Mojokerto, Jawa Timur',
      address: cfg.address || 'Jl. Raya Pendidikan No. 55, Gedeg, Kabupaten Mojokerto, Jawa Timur 61351',
      era: cfg.era || '1982 - 2026',
      edition: cfg.edition || 'Dies Natalis ke-44',
      themeName: cfg.themeName || 'AVERSA',
      heroBadgeText: cfg.heroBadgeText || 'SMA Negeri 1 Gedeg • 1982 - 2026',
      heroTitlePrefix: cfg.heroTitlePrefix || 'Dies Natalis ke-44',
      heroTitleHighlight: cfg.heroTitleHighlight || 'Action, Compassion, Celebration',
      heroDescription:
        cfg.heroDescription ||
        'Perayaan puncak 44 tahun SMA Negeri 1 Gedeg pada 17 Desember 2026 bersama bintang tamu Niken Salindry dan Kembange Jagad.',
      peakDateIso: cfg.peakDateIso || '2026-12-17T19:00:00+07:00',
      peakDateLabel: cfg.peakDateLabel || '17 Desember 2026',
      guestStar1Name: cfg.guestStar1Name || 'Niken Salindry',
      guestStar2Name: cfg.guestStar2Name || 'Kembange Jagad',
      guestStarDescription: cfg.guestStarDescription || '',
      guestStarVenue: cfg.guestStarVenue || 'Lapangan Tengah SMAN 1 Gedeg',
      guestStarAccessNote: cfg.guestStarAccessNote || 'E-Ticket QR Terenkripsi',
      bankPaymentInfo:
        cfg.bankPaymentInfo ||
        'Transfer ke Rekening Bendahara Panitia Dies Natalis 44 SMAN 1 Gedeg (Bank Jatim 0123-44-2026 a.n. Panitia AVERSA 44) atau kanal Xendit.',
      sponsorshipHeadline: cfg.sponsorshipHeadline || 'Bermitra Bersama Perayaan 44 Tahun SMAN 1 Gedeg',
      sponsorshipDescription: cfg.sponsorshipDescription || '',
      guestStars: [cfg.guestStar1Name || 'Niken Salindry', cfg.guestStar2Name || 'Kembange Jagad'],
      sponsorshipContacts: cfg.sponsorshipContacts || [
        { name: 'Pak Shofy', phoneDisplay: '0856-4878-4500', whatsapp: '6285648784500', role: 'Koordinator Sponsorship & Kemitraan' },
        { name: 'Bu Whenna', phoneDisplay: '0856-3310-519', whatsapp: '628563310519', role: 'Humas & Sponsorship SMA Negeri 1 Gedeg' },
      ],
      socials: cfg.socials || {
        website: 'https://www.sman1gedeg.sch.id',
        instagram: '@smansagemoker',
        tiktok: '@sman1gedeg',
        facebook: 'SMA Negeri 1 Gedeg',
        humas: 'Humas SMAN 1 Gedeg',
      },
      anatomyItems: cfg.anatomyItems || [],
      creativeCredits: Array.isArray(cfg.creativeCredits) ? cfg.creativeCredits.reduce((merged: any[], credit: any) => {
        if (!credit || typeof credit.name !== 'string' || typeof credit.affiliation !== 'string') return merged;
        const existing = merged.find((item) => item.name.trim().toLocaleLowerCase() === credit.name.trim().toLocaleLowerCase() && item.affiliation.trim().toLocaleLowerCase() === credit.affiliation.trim().toLocaleLowerCase());
        if (existing) {
          if (credit.role && !existing.role?.includes(credit.role)) existing.role = [existing.role, credit.role].filter(Boolean).join('; ');
        } else merged.push({ ...credit });
        return merged;
      }, []) : [],
    },
    timeline: timelineRes.rows,
    qrisEnabled,
    ticketTiers: tiersRes.rows,
    merchProducts: merchRes.rows,
    shippingZones: zonesRes.rows,
  });
});

// ---------------------------------------------------------------------------
// 2. ORDER CREATION, HYBRID CHECKOUT & QBIZ DYNAMIC QRIS
// ---------------------------------------------------------------------------

const CreateOrderSchema = z.object({
  customerName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(140),
  customerEmail: z.string().trim().email('Format email tidak valid').optional().or(z.literal('')),
  customerPhone: z.string().trim().min(8, 'Nomor WhatsApp minimal 8 digit').max(25),
  customerType: z.enum(['SISWA', 'GURU', 'ALUMNI', 'UMUM', 'VIP']).default('UMUM'),
  identityNumber: z.string().trim().max(64).optional().or(z.literal('')),
  kelasAngkatan: z.string().trim().max(64).optional().or(z.literal('')),
  fulfillmentMode: z.enum(['PICKUP_BOOTH', 'LOCAL_COURIER', 'REGULER_EXPEDITION']).default('PICKUP_BOOTH'),
  shippingZoneId: z.number().int().positive().optional(),
  shippingAddress: z.string().trim().max(500).optional().or(z.literal('')),
  shippingNotes: z.string().trim().max(300).optional().or(z.literal('')),
  paymentMethod: z.enum(['QBIZ_QRIS', 'XENDIT', 'CASH_BOOTH', 'MANUAL_TRANSFER']),
  items: z
    .array(
      z.object({
        itemType: z.enum(['TICKET', 'MERCH']),
        id: z.number().int().positive(),
        variantLabel: z.string().trim().max(120).optional(),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, 'Keranjang pesanan masih kosong.'),
});

app.post('/api/orders', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Payload JSON tidak valid.' }, 400);
  }

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: parsed.error.issues[0]?.message || 'Data formulir tidak valid.',
      issues: parsed.error.issues,
    }, 400);
  }

  const challengeError = await checkChallenge(c, (body as any)?.turnstileToken, 'checkout');
  if (challengeError) return challengeError;
  const input = parsed.data;
  if (input.paymentMethod === 'QBIZ_QRIS' && !qrisEnabled) return c.json({ success: false, error: 'Pembayaran QRIS belum tersedia. Silakan pilih metode lain.' }, 503);
  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    let subtotalAmount = 0;
    let hasTicket = false;
    let hasMerch = false;
    let totalWeightGrams = 0;
    const resolvedItems: Array<{
      itemType: 'TICKET' | 'MERCH';
      tier?: any;
      merch?: any;
      variantLabel: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }> = [];

    // 1. Verify prices, quotas & stock from authoritative PostgreSQL rows
    for (const item of input.items) {
      if (item.itemType === 'TICKET') {
        hasTicket = true;
        const tierRes = await dbClient.query(
          'SELECT * FROM ticket_tiers WHERE id = $1 AND is_active = TRUE FOR UPDATE',
          [item.id]
        );
        const tier = tierRes.rows[0];
        if (!tier) {
          throw new Error('Kategori tiket tidak ditemukan atau sudah ditutup.');
        }
        const remaining = tier.quota_total - tier.quota_sold;
        if (remaining < item.quantity) {
          throw new Error(`Kuota "${tier.name}" hanya tersisa ${remaining} tiket.`);
        }
        if (tier.requires_student_id && !input.identityNumber) {
          throw new Error(`Kategori "${tier.name}" wajib menyertakan NISN/NIP Civitas SMAN 1 Gedeg.`);
        }

        await dbClient.query('UPDATE ticket_tiers SET quota_sold = quota_sold + $1 WHERE id = $2', [
          item.quantity,
          tier.id,
        ]);

        const sub = tier.price * item.quantity;
        subtotalAmount += sub;
        resolvedItems.push({
          itemType: 'TICKET',
          tier,
          variantLabel: item.variantLabel || tier.category,
          unitPrice: tier.price,
          quantity: item.quantity,
          subtotal: sub,
        });
      } else {
        hasMerch = true;
        const merchRes = await dbClient.query(
          'SELECT * FROM merch_products WHERE id = $1 AND is_active = TRUE FOR UPDATE',
          [item.id]
        );
        const merch = merchRes.rows[0];
        if (!merch) {
          throw new Error('Produk merchandise tidak ditemukan.');
        }
        if (merch.stock_total < item.quantity) {
          throw new Error(`Stok "${merch.name}" hanya tersisa ${merch.stock_total} pcs.`);
        }

        await dbClient.query('UPDATE merch_products SET stock_total = stock_total - $1 WHERE id = $2', [
          item.quantity,
          merch.id,
        ]);

        const sub = merch.price * item.quantity;
        subtotalAmount += sub;
        totalWeightGrams += (merch.weight_grams || 250) * item.quantity;
        resolvedItems.push({
          itemType: 'MERCH',
          merch,
          variantLabel: item.variantLabel || 'Standar',
          unitPrice: merch.price,
          quantity: item.quantity,
          subtotal: sub,
        });
      }
    }

    const orderType: 'TICKET_ONLY' | 'MERCH_ONLY' | 'MIXED' =
      hasTicket && hasMerch ? 'MIXED' : hasTicket ? 'TICKET_ONLY' : 'MERCH_ONLY';

    // 2. Calculate shipping cost from PostgreSQL zone
    let shippingAmount = 0;
    let zoneId: number | null = null;
    let effectiveFulfillmentMode = input.fulfillmentMode;

    if (!hasMerch) {
      effectiveFulfillmentMode = 'PICKUP_BOOTH';
      shippingAmount = 0;
    } else {
      if (effectiveFulfillmentMode !== 'PICKUP_BOOTH' && (!input.shippingAddress || input.shippingAddress.length < 8)) {
        throw new Error('Alamat pengantaran lengkap wajib diisi untuk pengiriman kurir/ekspedisi.');
      }
      if (input.shippingZoneId) {
        const zRes = await dbClient.query('SELECT * FROM shipping_zones WHERE id = $1 AND is_active = TRUE', [
          input.shippingZoneId,
        ]);
        const zone = zRes.rows[0];
        if (!zone) throw new Error('Zona pengambilan/pengiriman tidak valid.');
        zoneId = zone.id;
        effectiveFulfillmentMode = zone.mode;
        if (zone.mode === 'PICKUP_BOOTH') {
          shippingAmount = 0;
        } else if (zone.mode === 'LOCAL_COURIER') {
          shippingAmount = zone.base_cost;
        } else {
          const weightKg = Math.max(1, Math.ceil(totalWeightGrams / 1000));
          shippingAmount = zone.cost_per_kg * weightKg;
        }
      } else {
        const defaultZone = await dbClient.query(
          'SELECT * FROM shipping_zones WHERE mode = $1 AND is_active = TRUE ORDER BY sort_order ASC LIMIT 1',
          [effectiveFulfillmentMode]
        );
        if (defaultZone.rows[0]) {
          zoneId = defaultZone.rows[0].id;
          const zone = defaultZone.rows[0];
          if (zone.mode === 'LOCAL_COURIER') shippingAmount = zone.base_cost;
          if (zone.mode === 'REGULER_EXPEDITION') {
            const weightKg = Math.max(1, Math.ceil(totalWeightGrams / 1000));
            shippingAmount = zone.cost_per_kg * weightKg;
          }
        }
      }
    }

    const baseAmount = subtotalAmount + shippingAmount;
    const orderCode = `AVR44-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Collision-free 3-digit unique code for QBiz Dynamic QRIS / Transfer
    let uniqueCode = 0;
    if (input.paymentMethod === 'QBIZ_QRIS' || input.paymentMethod === 'MANUAL_TRANSFER') {
      const usedRes = await dbClient.query(
        `SELECT total_amount FROM orders WHERE payment_status = 'PENDING' AND expired_at > NOW()`
      );
      const usedTotals = new Set(usedRes.rows.map((r: any) => Number(r.total_amount)));
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = Math.floor(11 + Math.random() * 880);
        if (!usedTotals.has(baseAmount + candidate)) {
          uniqueCode = candidate;
          break;
        }
      }
      if (uniqueCode === 0) uniqueCode = Math.floor(100 + Math.random() * 899);
    }

    let finalTotal = baseAmount + uniqueCode;
    let qbizInvoiceId: string | null = null;
    let qbizQrisPayload: string | null = null;
    let qbizCheckoutUrl: string | null = null;
    let qbizMode: string | null = null;
    const expiredAt = new Date(Date.now() + (input.paymentMethod === 'QBIZ_QRIS' ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000));

    if (input.paymentMethod === 'QBIZ_QRIS') {
      const inv = await createQrisInvoiceWithFallback(
        {
          orderId: orderCode,
          amount: baseAmount,
          merchantId: process.env.QBIZ_MERCHANT_ID || 'mrc_toko_1',
          callbackUrl: `${PUBLIC_SITE_URL}/api/webhooks/qbiz`,
          redirectUrl: `${PUBLIC_SITE_URL}/?order=${orderCode}`,
          customerName: input.customerName,
          customerEmail: input.customerEmail || undefined,
          customerPhone: input.customerPhone,
          items: resolvedItems.map((it) => ({
            name: `${it.itemType === 'TICKET' ? it.tier.name : it.merch.name} (${it.variantLabel})`,
            quantity: it.quantity,
            price: it.unitPrice,
          })),
        },
        uniqueCode
      );
      qbizInvoiceId = inv.id;
      qbizQrisPayload = inv.qrisPayload;
      qbizCheckoutUrl = inv.checkoutUrl;
      qbizMode = inv.mode || 'QBIZ_LOCAL_COMPAT';
      uniqueCode = inv.uniqueCode;
      finalTotal = inv.totalAmount;
    }

    const pickupQrToken = hasMerch ? signQrPayload('MRC', orderCode, orderCode) : null;

    const orderInsertRes = await dbClient.query(
      `INSERT INTO orders (
        order_code, customer_name, customer_email, customer_phone, customer_type,
        identity_number, kelas_angkatan, order_type, fulfillment_mode,
        shipping_zone_id, shipping_address, shipping_notes, fulfillment_status,
        pickup_qr_token, subtotal_amount, shipping_amount, unique_code, total_amount,
        payment_method, payment_status, qbiz_invoice_id, qbiz_qris_payload,
        qbiz_checkout_url, qbiz_mode, expired_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, 'UNFULFILLED',
        $13, $14, $15, $16, $17,
        $18, 'PENDING', $19, $20,
        $21, $22, $23
      ) RETURNING *`,
      [
        orderCode,
        input.customerName,
        input.customerEmail || null,
        input.customerPhone,
        input.customerType,
        input.identityNumber || null,
        input.kelasAngkatan || null,
        orderType,
        effectiveFulfillmentMode,
        zoneId,
        input.shippingAddress || 'Ambil di Booth OSIS SMAN 1 Gedeg',
        input.shippingNotes || null,
        pickupQrToken,
        subtotalAmount,
        shippingAmount,
        uniqueCode,
        finalTotal,
        input.paymentMethod,
        qbizInvoiceId,
        qbizQrisPayload,
        qbizCheckoutUrl,
        qbizMode,
        expiredAt.toISOString(),
      ]
    );

    const createdOrder = orderInsertRes.rows[0];

    // 4. Insert Order Items + Generate Signed Cryptographic E-Tickets
    const createdTickets: any[] = [];
    let ticketSeq = 1;

    for (const item of resolvedItems) {
      await dbClient.query(
        `INSERT INTO order_items (order_id, item_type, ticket_tier_id, merch_product_id, item_name, variant_label, unit_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          createdOrder.id,
          item.itemType,
          item.tier ? item.tier.id : null,
          item.merch ? item.merch.id : null,
          item.tier ? item.tier.name : item.merch.name,
          item.variantLabel,
          item.unitPrice,
          item.quantity,
          item.subtotal,
        ]
      );

      if (item.itemType === 'TICKET' && item.tier) {
        const seatZone =
          item.tier.category === 'VIP'
            ? 'VIP Royal Stage Depan'
            : item.tier.category === 'INTERNAL'
            ? 'Zona Festival Civitas SMAN 1 Gedeg'
            : item.tier.category === 'BUNDLING'
            ? 'Zona Festival Utama + Booth Merch'
            : 'Zona Festival Alumni & Umum';

        for (let q = 0; q < item.quantity; q++) {
          const suffix = String(ticketSeq++).padStart(2, '0');
          const tktCode = `TKT-${orderCode}-${suffix}`;
          const qrPayload = signQrPayload('TKT', tktCode, orderCode);

          const tRes = await dbClient.query(
            `INSERT INTO issued_tickets (
              ticket_code, order_id, ticket_tier_id, tier_name, tier_category,
              holder_name, holder_phone, holder_identity, seat_zone, qr_payload, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING_PAYMENT')
            RETURNING *`,
            [
              tktCode,
              createdOrder.id,
              item.tier.id,
              item.tier.name,
              item.tier.category,
              input.customerName,
              input.customerPhone,
              input.identityNumber || input.kelasAngkatan || input.customerType,
              seatZone,
              qrPayload,
            ]
          );
          createdTickets.push(tRes.rows[0]);
        }
      }
    }

    await dbClient.query('COMMIT');

    const qrisDataUrl = qbizQrisPayload ? await toQrDataUrl(qbizQrisPayload) : null;

    setCookie(c, 'aversa44_order_access', signWalletAccess('order', createdOrder.order_code), {
      httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 3600, secure: isHttpsRequest(c),
    });
    return c.json({
      success: true,
      order: createdOrder,
      qrisDataUrl,
      tickets: createdTickets,
    }, 201);
  } catch (err: any) {
    await dbClient.query('ROLLBACK');
    return c.json({ success: false, error: err?.message || 'Gagal membuat pesanan.' }, 400);
  } finally {
    dbClient.release();
  }
});

// Lookup order details + live QBiz sync
async function hydrateOrderResponse(orderRow: any) {
  // Poll live QBiz if still pending and in QBIZ_LIVE mode
  if (orderRow.payment_status === 'PENDING' && orderRow.payment_method === 'QBIZ_QRIS' && orderRow.qbiz_invoice_id && orderRow.qbiz_mode === 'QBIZ_LIVE') {
    try {
      const qbiz = new QBizClient({
        apiKey: process.env.QBIZ_API_KEY || 'local_test_only_qbiz_api_key_not_for_production',
        baseUrl: process.env.QBIZ_BASE_URL || 'http://localhost:8000',
      });
      const st = await qbiz.getInvoiceStatus(orderRow.qbiz_invoice_id);
      if (st.status === 'PAID' && Number(st.totalAmount) === Number(orderRow.total_amount)) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          orderRow = await settleOrderPayment(c, orderRow.id, 'QBIZ_POLL_SYNC');
          await c.query('COMMIT');
        } finally {
          c.release();
        }
      }
    } catch {
      // Non-fatal if QBiz service is unreachable
    }
  }

  const [itemsRes, ticketsRes, zoneRes] = await Promise.all([
    pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [orderRow.id]),
    pool.query('SELECT * FROM issued_tickets WHERE order_id = $1 ORDER BY id ASC', [orderRow.id]),
    orderRow.shipping_zone_id
      ? pool.query('SELECT * FROM shipping_zones WHERE id = $1', [orderRow.shipping_zone_id])
      : Promise.resolve({ rows: [] }),
  ]);

  const ticketsWithQr = await Promise.all(
    ticketsRes.rows.map(async (t: any) => ({
      ...t,
      qrDataUrl: t.status === 'ACTIVE' || t.status === 'USED' ? await toQrDataUrl(t.qr_payload) : null,
    }))
  );

  const qrisDataUrl =
    orderRow.qbiz_qris_payload && orderRow.payment_status === 'PENDING'
      ? await toQrDataUrl(orderRow.qbiz_qris_payload)
      : null;

  const pickupQrDataUrl =
    orderRow.pickup_qr_token && orderRow.payment_status === 'PAID'
      ? await toQrDataUrl(orderRow.pickup_qr_token)
      : null;

  return {
    order: orderRow,
    items: itemsRes.rows,
    tickets: ticketsWithQr,
    shippingZone: zoneRes.rows[0] || null,
    qrisDataUrl,
    pickupQrDataUrl,
  };
}

function canReadOrder(c: any, order: any): boolean {
  const orderAccess = verifyWalletAccess(getCookie(c, 'aversa44_order_access'));
  const phoneAccess = verifyWalletAccess(getCookie(c, 'aversa44_wallet_access'));
  return (orderAccess?.kind === 'order' && orderAccess.value === order.order_code) ||
    (phoneAccess?.kind === 'phone' && phoneAccess.value === normalizePhone(order.customer_phone));
}

app.post('/api/wallet/request-code', async (c) => {
  const payload = await c.req.json().catch(() => ({}));
  const challengeError = await checkChallenge(c, payload.turnstileToken, 'wallet');
  if (challengeError) return challengeError;
  const body = z.object({ phone: z.string().max(30) }).safeParse(payload);
  const phone = body.success ? normalizePhone(body.data.phone) : null;
  const botPhone = normalizePhone(process.env.WHATSAPP_BOT_PHONE || '');
  if (!phone) return c.json({ success: false, error: 'Masukkan nomor WhatsApp Indonesia yang valid.' }, 400);
  if (!botPhone || !process.env.WHATSAPP_WEBHOOK_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET.length < 32) {
    return c.json({ success: false, error: 'Verifikasi WhatsApp sementara belum tersedia.' }, 503);
  }
  const challenge = crypto.randomBytes(18).toString('hex');
  const result = await pool.query(
    `INSERT INTO wallet_otp (phone, code_hash, expires_at, next_request_at, attempts, verified)
     VALUES ($1, $2, NOW() + INTERVAL '5 minutes', NOW() + INTERVAL '60 seconds', 0, FALSE)
     ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
       next_request_at = EXCLUDED.next_request_at, attempts = 0, verified = FALSE
     WHERE wallet_otp.next_request_at <= NOW() RETURNING phone`, [phone, otpDigest(phone, challenge)]);
  if (!result.rowCount) return c.json({ success: false, error: 'Tunggu satu menit sebelum meminta tautan baru.' }, 429);
  const message = 'VERIFIKASI AVERSA ' + challenge;
  return c.json({ success: true, challenge, whatsappUrl: 'https://wa.me/' + botPhone + '?text=' + encodeURIComponent(message) });
});

app.post('/api/webhooks/whatsapp', async (c) => {
  const diagnostic = (stage: string) => { if (process.env.WALLET_WEBHOOK_DIAGNOSTICS === '1') console.log('[wallet webhook]', stage); };
  diagnostic('received');
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
  if (secret.length < 32) return c.json({ success: false }, 503);
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > 65536) return c.json({ success: false }, 413);
  const signature = c.req.header('X-Hub-Signature-256') || '';
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return c.json({ success: false }, 401);
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  const provided = Buffer.from(signature.slice(7), 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) { diagnostic('signature rejected'); return c.json({ success: false }, 401); }
  diagnostic('signature accepted');
  let data: any;
  try { data = JSON.parse(raw); } catch { return c.json({ success: false }, 400); }
  if (data.event !== 'message' || data.payload?.is_from_me !== false ||
      (process.env.GOWA_SESSION_ID && data.session_id !== process.env.GOWA_SESSION_ID)) { diagnostic('event or session ignored'); return c.json({ success: true }); }
  const sender = typeof data.payload?.from === 'string' ? data.payload.from : '';
  const chat = typeof data.payload?.chat_id === 'string' ? data.payload.chat_id : '';
  const match = typeof data.payload?.body === 'string' ? /^VERIFIKASI AVERSA ([a-f0-9]{36})$/i.exec(data.payload.body.trim()) : null;
  if (!/^62[0-9]{8,13}@s\.whatsapp\.net$/.test(sender) ||
      !/^62[0-9]{8,13}@s\.whatsapp\.net$/.test(chat) || !match) { diagnostic('sender, chat or message format ignored'); return c.json({ success: true }); }
  const phone = normalizePhone(sender.split('@')[0]);
  const messageId = typeof data.payload?.id === 'string' ? data.payload.id.trim() : '';
  if (!phone || !messageId || messageId.length > 200) { diagnostic('message id missing'); return c.json({ success: true }); }
  const client = await pool.connect();
  let isNew = false, verified = false;
  try {
    await client.query('BEGIN');
    const receipt = await client.query(
      'INSERT INTO wallet_webhook_receipts (session_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING message_id',
      [String(data.session_id || data.device_id || ''), messageId]);
    isNew = Boolean(receipt.rowCount);
    if (isNew) {
      const result = await client.query(
        'UPDATE wallet_otp SET verified = TRUE WHERE phone = $1 AND code_hash = $2 AND expires_at > NOW() RETURNING phone',
        [phone, otpDigest(phone, match[1].toLowerCase())]);
      verified = Boolean(result.rowCount);
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
  if (isNew) {
    diagnostic(verified ? 'challenge verified' : 'challenge not matched');
    try { await sendWalletReply(phone, verified); }
    catch { console.error('[wallet webhook] reply unavailable'); }
  }
  return c.json({ success: true });
});

app.post('/api/wallet/logout', (c) => {
  deleteCookie(c, 'aversa44_wallet_access', { path: '/' });
  deleteCookie(c, 'aversa44_order_access', { path: '/' });
  return c.json({ success: true });
});

app.post('/api/wallet/verify-code', async (c) => {
  const body = z.object({ phone: z.string().max(30), challenge: z.string().regex(/^[a-f0-9]{36}$/) }).safeParse(await c.req.json().catch(() => ({})));
  const phone = body.success ? normalizePhone(body.data.phone) : null;
  if (!phone || !body.success) return c.json({ success: false, error: 'Permintaan verifikasi tidak valid.' }, 400);
  const result = await pool.query(
    'DELETE FROM wallet_otp WHERE phone = $1 AND code_hash = $2 AND verified = TRUE AND expires_at > NOW() RETURNING phone',
    [phone, otpDigest(phone, body.data.challenge)]);
  if (!result.rowCount) return c.json({ success: false, error: 'Pesan belum diterima atau tautan sudah kedaluwarsa.' }, 400);
  setCookie(c, 'aversa44_wallet_access', signWalletAccess('phone', phone), {
    httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 3600, secure: isHttpsRequest(c),
  });
  return c.json({ success: true });
});

app.get('/api/orders/:orderCode', async (c) => {
  const orderCode = c.req.param('orderCode').trim().toUpperCase();
  const res = await pool.query('SELECT * FROM orders WHERE order_code = $1', [orderCode]);
  if (!res.rows[0]) {
    return c.json({ success: false, error: 'Kode pesanan tidak ditemukan.' }, 404);
  }
  if (!canReadOrder(c, res.rows[0])) return c.json({ success: false, error: 'Verifikasi nomor WhatsApp untuk melihat pesanan.' }, 401);
  const hydrated = await hydrateOrderResponse(res.rows[0]);
  return c.json({ success: true, ...hydrated });
});

app.post('/api/orders/lookup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queryText = String(body.query || '').trim();
  if (queryText.length < 4) {
    return c.json({ success: false, error: 'Masukkan Kode Pesanan atau Nomor WhatsApp minimal 4 karakter.' }, 400);
  }

  const access = verifyWalletAccess(getCookie(c, 'aversa44_wallet_access'));
  if (!access || access.kind !== 'phone') return c.json({ success: false, error: 'Verifikasi nomor WhatsApp terlebih dahulu.' }, 401);
  const res = await pool.query(
    `SELECT * FROM orders WHERE
      (UPPER(order_code) = UPPER($1) OR $1 = $2)
      AND (REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') = $2
        OR REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') = '0' || SUBSTRING($2 FROM 3))
      ORDER BY created_at DESC LIMIT 10`,
    [normalizePhone(queryText) || queryText.toUpperCase(), access.value]
  );
  if (res.rows.length === 0) {
    return c.json({ success: false, error: 'Pesanan dengan kode atau nomor WhatsApp tersebut belum ditemukan.' }, 404);
  }

  const hydratedOrders = await Promise.all(res.rows.map((row) => hydrateOrderResponse(row)));
  return c.json({ success: true, results: hydratedOrders });
});

app.post('/api/orders/:orderCode/upload-proof', async (c) => {
  const orderCode = c.req.param('orderCode').trim().toUpperCase();
  const body = await c.req.json().catch(() => ({}));
  const note = String(body.note || '').trim().slice(0, 300);
  if (!note) {
    return c.json({ success: false, error: 'Mohon sertakan nama pengirim / bank / jam transfer.' }, 400);
  }
  const existing = await pool.query('SELECT * FROM orders WHERE order_code = $1', [orderCode]);
  if (!existing.rows[0] || !canReadOrder(c, existing.rows[0])) return c.json({ success: false, error: 'Verifikasi nomor WhatsApp untuk mengubah pesanan.' }, 401);
  const res = await pool.query(
    `UPDATE orders SET payment_proof_note = $1 WHERE order_code = $2 AND payment_status = 'PENDING' RETURNING *`,
    [note, orderCode]
  );
  if (!res.rows[0]) {
    return c.json({ success: false, error: 'Pesanan tidak ditemukan atau sudah berstatus lunas.' }, 404);
  }
  return c.json({ success: true, order: res.rows[0] });
});

// Sandbox helper: dispatches a genuine cryptographically signed QBiz HMAC-SHA256 webhook to /api/webhooks/qbiz
app.post('/api/orders/:orderCode/simulate-qbiz-webhook', async (c) => {
  if (process.env.NODE_ENV === 'production') return c.notFound();
  const orderCode = c.req.param('orderCode').trim().toUpperCase();
  const res = await pool.query('SELECT * FROM orders WHERE order_code = $1', [orderCode]);
  const order = res.rows[0];
  if (!order) {
    return c.json({ success: false, error: 'Pesanan tidak ditemukan.' }, 404);
  }

  const payloadObj = {
    event: 'payment.success',
    invoice_id: order.qbiz_invoice_id || `inv_sim_${Date.now()}`,
    order_id: order.order_code,
    amount_paid: order.total_amount,
    paid_at: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payloadObj);
  const sig = signQbizWebhookBody(rawBody, QBIZ_WEBHOOK_SECRET);

  // Verify using exact QBizClient.verifyWebhookSignature path
  const isValid = await QBizClient.verifyWebhookSignature(rawBody, sig, QBIZ_WEBHOOK_SECRET);
  if (!isValid) {
    return c.json({ success: false, error: 'Internal signature mismatch' }, 500);
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    await settleOrderPayment(dbClient, order.id, 'QBIZ_HMAC_WEBHOOK');
    await dbClient.query('COMMIT');
  } finally {
    dbClient.release();
  }

  const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [order.id]);
  const hydrated = await hydrateOrderResponse(updated.rows[0]);
  return c.json({ success: true, signatureVerified: true, ...hydrated });
});

// ---------------------------------------------------------------------------
// 3. PAYMENT GATEWAY WEBHOOKS (QBiz HMAC-SHA256 & Xendit Callback Token)
// ---------------------------------------------------------------------------

app.post('/api/webhooks/qbiz', async (c) => {
  if (!qrisEnabled) return c.json({ success: false }, 503);
  const rawBody = await c.req.text();
  const signature = c.req.header('X-QBiz-Signature') || c.req.header('x-qbiz-signature') || '';
  const timestamp = c.req.header('X-QBiz-Timestamp') || c.req.header('x-qbiz-timestamp');

  const valid = await QBizClient.verifyWebhookSignature(rawBody, signature, QBIZ_WEBHOOK_SECRET, timestamp);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid X-QBiz-Signature' }, 401);
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return c.json({ success: false, error: 'Malformed JSON body' }, 400);
  }

  if (data.event !== 'payment.success') {
    return c.json({ success: true, ignored: true });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const orderRes = await dbClient.query(
      'SELECT id, order_code, qbiz_invoice_id, total_amount, payment_method FROM orders WHERE order_code = $1 FOR UPDATE',
      [data.order_id]
    );
    if (!orderRes.rows[0]) {
      await dbClient.query('ROLLBACK');
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    const order = orderRes.rows[0];
    if (order.payment_method !== 'QBIZ_QRIS' || !order.qbiz_invoice_id ||
        data.invoice_id !== order.qbiz_invoice_id || !Number.isSafeInteger(data.amount_paid) ||
        data.amount_paid !== Number(order.total_amount)) {
      await dbClient.query('ROLLBACK');
      return c.json({ success: false, error: 'Payment details do not match order.' }, 400);
    }
    const settled = await settleOrderPayment(dbClient, order.id, 'QBIZ_WEBHOOK');
    await dbClient.query('COMMIT');
    return c.json({ success: true, orderCode: settled.order_code, status: settled.payment_status });
  } catch (err: any) {
    await dbClient.query('ROLLBACK');
    return c.json({ success: false, error: err?.message || 'Webhook processing error' }, 500);
  } finally {
    dbClient.release();
  }
});

app.post('/api/webhooks/xendit', async (c) => {
  if (process.env.NODE_ENV === 'production' && !process.env.XENDIT_CALLBACK_TOKEN) return c.json({ success: false }, 503);
  const token = c.req.header('x-callback-token') || '';
  if (!QBizClient.verifyXenditCallbackToken(token, XENDIT_CALLBACK_TOKEN)) {
    return c.json({ success: false, error: 'Invalid x-callback-token' }, 401);
  }
  const data = await c.req.json().catch(() => ({}));
  const orderCode = data.external_id || data.order_id;
  if (!orderCode) return c.json({ success: false, error: 'Missing external_id' }, 400);

  if (data.status === 'PAID' || data.status === 'SETTLED') {
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const ordRes = await dbClient.query('SELECT id, payment_method, total_amount FROM orders WHERE order_code = $1 FOR UPDATE', [orderCode]);
      const order = ordRes.rows[0];
      if (!order || order.payment_method !== 'XENDIT' || !Number.isSafeInteger(data.amount) || data.amount !== Number(order.total_amount)) {
        await dbClient.query('ROLLBACK');
        return c.json({ success: false, error: 'Payment details do not match order.' }, 400);
      }
      await settleOrderPayment(dbClient, order.id, 'XENDIT_WEBHOOK');
      await dbClient.query('COMMIT');
    } finally {
      dbClient.release();
    }
  }
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// 4. STAFF AUTHENTICATION & RBAC
// ---------------------------------------------------------------------------

const loginFailureBuckets = new Map<string, { count: number; until: number }>();

function checkLoginThrottle(ip: string, username: string): boolean {
  const now = Date.now();
  const userKey = `u:${ip}:${username.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const userEntry = loginFailureBuckets.get(userKey);
  const ipEntry = loginFailureBuckets.get(ipKey);
  if ((userEntry && userEntry.until > now && userEntry.count >= 10) || (ipEntry && ipEntry.until > now && ipEntry.count >= 25)) {
    return true;
  }
  return false;
}

function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();
  if (loginFailureBuckets.size >= 10000) {
    for (const [k, v] of loginFailureBuckets) if (v.until <= now) loginFailureBuckets.delete(k);
  }
  for (const key of [`u:${ip}:${username.toLowerCase()}`, `ip:${ip}`]) {
    const cur = loginFailureBuckets.get(key);
    if (!cur || cur.until <= now) loginFailureBuckets.set(key, { count: 1, until: now + 300000 });
    else cur.count += 1;
  }
}

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const challengeError = await checkChallenge(c, body.turnstileToken, 'office_login');
  if (challengeError) return challengeError;
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const clientIp = (c.get('clientIp' as never) as string) || 'unknown';

  if (!username || !password) {
    return c.json({ success: false, error: 'Username dan password wajib diisi.' }, 400);
  }

  if (checkLoginThrottle(clientIp, username)) {
    return c.json({ success: false, error: 'Terlalu banyak percobaan login gagal. Coba lagi dalam 5 menit.' }, 429);
  }

  const res = await pool.query('SELECT * FROM staff_users WHERE username = $1 AND is_active = TRUE', [username]);
  const user = res.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(clientIp, username);
    return c.json({ success: false, error: 'Username atau password salah.' }, 401);
  }
  loginFailureBuckets.delete(`u:${clientIp}:${username.toLowerCase()}`);

  const token = signSessionToken({
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    sessionVersion: user.session_version,
  });

  setCookie(c, 'aversa44_staff_session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 43200,
    secure: isHttpsRequest(c),
  });

  return c.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

app.post('/api/auth/change-password', async (c) => {
  const session = requireRoles(c, ['ADMIN', 'CASHIER', 'SCANNER', 'MEDIA']);
  if (session instanceof Response) return session;
  const parsed = z.object({ currentPassword: z.string().min(1).max(100), newPassword: z.string().min(8).max(100) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'Kata sandi baru harus terdiri dari 8 sampai 100 karakter.' }, 400);
  if (parsed.data.currentPassword === parsed.data.newPassword) return c.json({ success: false, error: 'Gunakan kata sandi baru yang berbeda.' }, 400);
  const result = await pool.query('SELECT password_hash FROM staff_users WHERE id = $1 AND is_active = TRUE', [session.userId]);
  const hash = result.rows[0]?.password_hash;
  if (!hash || !verifyPassword(parsed.data.currentPassword, hash)) return c.json({ success: false, error: 'Kata sandi saat ini salah.' }, 400);
  const changed = await pool.query('UPDATE staff_users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 AND password_hash = $3 AND is_active = TRUE RETURNING session_version', [hashPassword(parsed.data.newPassword), session.userId, hash]);
  if (!changed.rowCount) return c.json({ success: false, error: 'Kata sandi telah berubah. Silakan coba lagi.' }, 409);
  const token = signSessionToken({ userId: session.userId, username: session.username, fullName: session.fullName, role: session.role, sessionVersion: changed.rows[0].session_version });
  setCookie(c, 'aversa44_staff_session', token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 43200, secure: isHttpsRequest(c) });
  return c.json({ success: true });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'aversa44_staff_session', { path: '/' });
  return c.json({ success: true });
});

app.get('/api/auth/me', (c) => {
  const session = getStaffSession(c);
  if (!session) return c.json({ authenticated: false, user: null });
  return c.json({ authenticated: true, user: session });
});

// ---------------------------------------------------------------------------
// 5. GATE & MERCH BOOTH QR SCANNER (WITH ATOMIC ANTI-DOUBLE-SCAN)
// ---------------------------------------------------------------------------

app.post('/api/scanner/inspect', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER', 'SCANNER']);
  if (auth instanceof Response) return auth;

  const body = await c.req.json().catch(() => ({}));
  const rawInput = String(body.qrPayload || '').trim();
  const parsed = verifyQrPayload(rawInput);

  if (!parsed.validFormat || !parsed.validSignature) {
    await pool.query(
      `INSERT INTO scan_audit_logs (scan_type, reference_code, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
       VALUES ('TICKET_CHECKIN', $1, $2, $3, $4, 'INVALID_SIGNATURE', $5)`,
      [rawInput.slice(0, 100), auth.userId, auth.fullName, String(body.gateLocation || 'Gate Utama'), parsed.reason || 'QR tidak valid']
    );
    return c.json({
      success: false,
      verdict: 'INVALID_SIGNATURE',
      message: parsed.reason || 'QR Code ditolak karena gagal verifikasi kriptografis.',
    }, 400);
  }

  if (parsed.type === 'TKT') {
    const tRes = await pool.query(
      `SELECT t.*, o.order_code, o.customer_name, o.customer_email, o.customer_phone, o.customer_type,
              o.identity_number, o.kelas_angkatan, o.payment_status, o.payment_method, o.total_amount,
              o.fulfillment_mode, o.fulfillment_status, o.paid_at
       FROM issued_tickets t
       JOIN orders o ON o.id = t.order_id
       WHERE t.ticket_code = $1`,
      [parsed.code]
    );
    const ticket = tRes.rows[0];
    if (!ticket) {
      return c.json({ success: false, verdict: 'NOT_FOUND', message: 'Tiket tidak ditemukan di database.' }, 404);
    }
    const orderItems = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [ticket.order_id]);

    return c.json({
      success: true,
      scanType: 'TICKET_CHECKIN',
      signatureMode: parsed.isDirectCode ? 'MANUAL_STAFF_CODE' : 'HMAC_SHA256_VERIFIED',
      verdict:
        ticket.payment_status !== 'PAID'
          ? 'UNPAID'
          : ticket.status === 'USED'
          ? 'ALREADY_SCANNED'
          : ticket.status === 'ACTIVE'
          ? 'READY_TO_CHECKIN'
          : ticket.status,
      ticket,
      orderItems: orderItems.rows,
    });
  } else {
    const oRes = await pool.query('SELECT * FROM orders WHERE order_code = $1', [parsed.orderCode || parsed.code]);
    const order = oRes.rows[0];
    if (!order) {
      return c.json({ success: false, verdict: 'NOT_FOUND', message: 'Order pengambilan merch tidak ditemukan.' }, 404);
    }
    const orderItems = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [order.id]);
    const tickets = await pool.query('SELECT * FROM issued_tickets WHERE order_id = $1 ORDER BY id ASC', [order.id]);

    return c.json({
      success: true,
      scanType: 'MERCH_PICKUP',
      signatureMode: parsed.isDirectCode ? 'MANUAL_STAFF_CODE' : 'HMAC_SHA256_VERIFIED',
      verdict:
        order.payment_status !== 'PAID'
          ? 'UNPAID'
          : order.pickup_verified_at
          ? 'ALREADY_SCANNED'
          : 'READY_TO_PICKUP',
      order,
      orderItems: orderItems.rows,
      tickets: tickets.rows,
    });
  }
});

app.post('/api/scanner/execute', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER', 'SCANNER']);
  if (auth instanceof Response) return auth;

  const body = await c.req.json().catch(() => ({}));
  const rawInput = String(body.qrPayload || '').trim();
  const gateLocation = String(body.gateLocation || 'Gate Utama SMAN 1 Gedeg').slice(0, 75);
  const parsed = verifyQrPayload(rawInput);

  if (!parsed.validFormat || !parsed.validSignature) {
    return c.json({ success: false, verdict: 'INVALID_SIGNATURE', message: parsed.reason }, 400);
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    if (parsed.type === 'TKT') {
      // Check ticket & order status first
      const curRes = await dbClient.query(
        `SELECT t.*, o.payment_status FROM issued_tickets t JOIN orders o ON o.id = t.order_id WHERE t.ticket_code = $1`,
        [parsed.code]
      );
      const cur = curRes.rows[0];
      if (!cur) {
        await dbClient.query('ROLLBACK');
        return c.json({ success: false, verdict: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' }, 404);
      }
      if (cur.payment_status !== 'PAID') {
        await dbClient.query(
          `INSERT INTO scan_audit_logs (scan_type, reference_code, order_id, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
           VALUES ('TICKET_CHECKIN', $1, $2, $3, $4, $5, 'UNPAID', 'Tiket belum lunas')`,
          [cur.ticket_code, cur.order_id, auth.userId, auth.fullName, gateLocation]
        );
        await dbClient.query('COMMIT');
        return c.json({ success: false, verdict: 'UNPAID', message: 'Pesanan belum dibayar / menunggu konfirmasi kasir.' }, 409);
      }

      // Atomic status transition preventing double-scan race conditions
      const atomicRes = await dbClient.query(
        `UPDATE issued_tickets
         SET status = 'USED', checked_in_at = NOW(), checked_in_by = $1, gate_name = $2
         WHERE ticket_code = $3 AND status = 'ACTIVE'
         RETURNING *`,
        [auth.fullName, gateLocation, parsed.code]
      );

      if (atomicRes.rowCount === 0) {
        await dbClient.query(
          `INSERT INTO scan_audit_logs (scan_type, reference_code, order_id, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
           VALUES ('TICKET_CHECKIN', $1, $2, $3, $4, $5, 'ALREADY_SCANNED', $6)`,
          [cur.ticket_code, cur.order_id, auth.userId, auth.fullName, gateLocation, `Sudah check-in pada ${cur.checked_in_at}`]
        );
        await dbClient.query('COMMIT');
        return c.json({
          success: false,
          verdict: 'ALREADY_SCANNED',
          message: `DITOLAK! Tiket sudah pernah check-in sebelumnya oleh ${cur.checked_in_by || 'Petugas'} di ${cur.gate_name || 'Gate'}.`,
          ticket: cur,
        }, 409);
      }

      await dbClient.query(
        `INSERT INTO scan_audit_logs (scan_type, reference_code, order_id, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
         VALUES ('TICKET_CHECKIN', $1, $2, $3, $4, $5, 'SUCCESS', $6)`,
        [cur.ticket_code, cur.order_id, auth.userId, auth.fullName, gateLocation, `${cur.holder_name} (${cur.tier_name})`]
      );
      await dbClient.query('COMMIT');
      return c.json({
        success: true,
        verdict: 'SUCCESS',
        message: `CHECK-IN BERHASIL! Selamat datang ${cur.holder_name} (${cur.tier_name}).`,
        ticket: atomicRes.rows[0],
      });
    } else {
      // Merch Pickup atomic verification
      const ordCode = parsed.orderCode || parsed.code;
      const curOrdRes = await dbClient.query('SELECT * FROM orders WHERE order_code = $1', [ordCode]);
      const curOrd = curOrdRes.rows[0];
      if (!curOrd) {
        await dbClient.query('ROLLBACK');
        return c.json({ success: false, verdict: 'NOT_FOUND', message: 'Pesanan merch tidak ditemukan.' }, 404);
      }
      if (curOrd.payment_status !== 'PAID') {
        await dbClient.query('ROLLBACK');
        return c.json({ success: false, verdict: 'UNPAID', message: 'Pembayaran merch belum lunas.' }, 409);
      }

      const atomicPickup = await dbClient.query(
        `UPDATE orders
         SET pickup_verified_at = NOW(), pickup_verified_by = $1, fulfillment_status = 'COMPLETED'
         WHERE order_code = $2 AND pickup_verified_at IS NULL
         RETURNING *`,
        [auth.fullName, ordCode]
      );

      if (atomicPickup.rowCount === 0) {
        await dbClient.query(
          `INSERT INTO scan_audit_logs (scan_type, reference_code, order_id, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
           VALUES ('MERCH_PICKUP', $1, $2, $3, $4, $5, 'ALREADY_SCANNED', 'Merch sudah diserahkan sebelumnya')`,
          [ordCode, curOrd.id, auth.userId, auth.fullName, gateLocation]
        );
        await dbClient.query('COMMIT');
        return c.json({
          success: false,
          verdict: 'ALREADY_SCANNED',
          message: `Merch pesanan ${ordCode} sudah diambil sebelumnya oleh pembeli (diserahkan oleh ${curOrd.pickup_verified_by}).`,
          order: curOrd,
        }, 409);
      }

      await dbClient.query(
        `INSERT INTO scan_audit_logs (scan_type, reference_code, order_id, scanner_user_id, scanner_name, gate_location, scan_result, detail_note)
         VALUES ('MERCH_PICKUP', $1, $2, $3, $4, $5, 'SUCCESS', $6)`,
        [ordCode, curOrd.id, auth.userId, auth.fullName, gateLocation, `Serah terima merch kepada ${curOrd.customer_name}`]
      );
      await dbClient.query('COMMIT');
      return c.json({
        success: true,
        verdict: 'SUCCESS',
        message: `SERAH TERIMA MERCH BERHASIL! Pesanan ${ordCode} (${curOrd.customer_name}) dinyatakan selesai.`,
        order: atomicPickup.rows[0],
      });
    }
  } catch (err: any) {
    await dbClient.query('ROLLBACK');
    return c.json({ success: false, error: err?.message || 'Gagal memproses scan.' }, 500);
  } finally {
    dbClient.release();
  }
});

app.get('/api/scanner/recent', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER', 'SCANNER']);
  if (auth instanceof Response) return auth;

  const [logsRes, statsRes] = await Promise.all([
    pool.query('SELECT * FROM scan_audit_logs ORDER BY scanned_at DESC LIMIT 30'),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_tickets,
        COUNT(*) FILTER (WHERE status = 'USED')::int AS checked_in_tickets,
        COUNT(*)::int AS total_issued_tickets
      FROM issued_tickets
    `),
  ]);

  return c.json({
    success: true,
    logs: logsRes.rows,
    stats: statsRes.rows[0],
  });
});

// ---------------------------------------------------------------------------
// 6. SPONSORSHIP PORTAL & ADMIN / CASHIER POS ENDPOINTS
// ---------------------------------------------------------------------------

const SponsorshipSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().min(2).max(140),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().optional().or(z.literal('')),
  tierInterest: z.enum(['PLATINUM_ROYAL', 'GOLD_MAJESTY', 'SILVER_WONDER', 'UMKM_BAZAAR', 'ALUMNI_DONOR']),
  message: z.string().trim().min(5).max(1000),
});

app.post('/api/sponsorship', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SponsorshipSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Data sponsorship belum lengkap.' }, 400);
  }
  const d = parsed.data;
  const res = await pool.query(
    `INSERT INTO sponsorship_inquiries (company_name, contact_person, phone, email, tier_interest, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [d.companyName, d.contactPerson, d.phone, d.email || null, d.tierInterest, d.message]
  );
  return c.json({ success: true, inquiry: res.rows[0] }, 201);
});

app.get('/api/admin/overview', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER']);
  if (auth instanceof Response) return auth;

  const [metricsRes, ordersRes, tiersRes, merchRes, zonesRes, timelineRes, sponsorsRes, settingsRes, staffRes] =
    await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE payment_status = 'PAID')::int AS paid_orders_count,
          COUNT(*) FILTER (WHERE payment_status = 'PENDING')::int AS pending_orders_count,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'PAID' AND payment_method = 'QBIZ_QRIS'), 0)::bigint AS qris_revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'PAID' AND payment_method = 'CASH_BOOTH'), 0)::bigint AS cash_revenue
        FROM orders
      `),
      pool.query(`
        SELECT o.*, sz.zone_name,
          (SELECT json_agg(oi) FROM order_items oi WHERE oi.order_id = o.id) AS items,
          (SELECT json_agg(it) FROM issued_tickets it WHERE it.order_id = o.id) AS tickets
        FROM orders o
        LEFT JOIN shipping_zones sz ON sz.id = o.shipping_zone_id
        ORDER BY o.created_at DESC
        LIMIT 120
      `),
      pool.query('SELECT * FROM ticket_tiers ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT * FROM merch_products ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT * FROM shipping_zones ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT * FROM event_timeline ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT * FROM sponsorship_inquiries ORDER BY created_at DESC LIMIT 80'),
      pool.query('SELECT value_json FROM site_settings WHERE key = $1', ['public_config']),
      auth.role === 'ADMIN'
        ? pool.query('SELECT id, username, full_name, role, is_active, created_at FROM staff_users ORDER BY id ASC')
        : Promise.resolve({ rows: [] }),
    ]);

  return c.json({
    success: true,
    metrics: metricsRes.rows[0],
    orders: ordersRes.rows,
    ticketTiers: tiersRes.rows,
    merchProducts: merchRes.rows,
    shippingZones: zonesRes.rows,
    timeline: timelineRes.rows,
    sponsorships: sponsorsRes.rows,
    siteSettings: settingsRes.rows[0]?.value_json || {},
    staffUsers: staffRes.rows,
  });
});

app.post('/api/admin/orders/:orderCode/confirm-payment', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER']);
  if (auth instanceof Response) return auth;

  const orderCode = c.req.param('orderCode').trim().toUpperCase();
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const res = await dbClient.query('SELECT id FROM orders WHERE order_code = $1 FOR UPDATE', [orderCode]);
    if (!res.rows[0]) {
      await dbClient.query('ROLLBACK');
      return c.json({ success: false, error: 'Order tidak ditemukan.' }, 404);
    }
    const updated = await settleOrderPayment(dbClient, res.rows[0].id, `${auth.role}:${auth.username}`);
    await dbClient.query('COMMIT');
    return c.json({ success: true, order: updated });
  } catch (err: any) {
    await dbClient.query('ROLLBACK');
    return c.json({ success: false, error: err?.message }, 500);
  } finally {
    dbClient.release();
  }
});

app.post('/api/admin/orders/:orderCode/update-shipping', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER']);
  if (auth instanceof Response) return auth;

  const orderCode = c.req.param('orderCode').trim().toUpperCase();
  const body = await c.req.json().catch(() => ({}));
  const status = String(body.fulfillmentStatus || 'OUT_FOR_DELIVERY');
  const trackingNumber = String(body.trackingNumber || '').trim();

  const res = await pool.query(
    `UPDATE orders SET fulfillment_status = $1, tracking_number = $2 WHERE order_code = $3 RETURNING *`,
    [status, trackingNumber || null, orderCode]
  );
  if (!res.rows[0]) {
    return c.json({ success: false, error: 'Order tidak ditemukan.' }, 404);
  }
  return c.json({ success: true, order: res.rows[0] });
});

// --- TICKET TIERS CRUD ---
const TierMutationSchema = z.object({
  name: z.string().trim().min(2).max(150),
  category: z.enum(['INTERNAL', 'EXTERNAL', 'VIP', 'BUNDLING']),
  description: z.string().trim().min(4).max(800),
  price: z.number().int().min(0).max(50000000),
  original_price: z.number().int().nullable().optional(),
  quota_total: z.number().int().min(1).max(20000),
  requires_student_id: z.boolean().default(false),
  included_merch_info: z.string().trim().max(300).nullable().optional(),
  perks_json: z.array(z.string().trim().min(1)).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(10),
});

app.post('/api/admin/ticket-tiers', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;

  const body = await c.req.json().catch(() => ({}));
  const parsed = TierMutationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input kategori tidak valid' }, 400);
  }
  const d = parsed.data;
  const code = `TKT-${d.category.slice(0, 3)}-${crypto.randomBytes(8).toString('hex')}`;
  const res = await pool.query(
    `INSERT INTO ticket_tiers (code, name, category, description, price, original_price, quota_total, requires_student_id, included_merch_info, perks_json, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12) RETURNING *`,
    [
      code,
      d.name,
      d.category,
      d.description,
      d.price,
      d.original_price ?? null,
      d.quota_total,
      d.requires_student_id,
      d.included_merch_info ?? null,
      JSON.stringify(d.perks_json),
      d.is_active,
      d.sort_order,
    ]
  );
  return c.json({ success: true, tier: res.rows[0] }, 201);
});

app.put('/api/admin/ticket-tiers/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;

  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = TierMutationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input update tier tidak valid.' }, 400);
  }
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM ticket_tiers WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Tier tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  const res = await pool.query(
    `UPDATE ticket_tiers SET
       name = $1,
       category = $2,
       description = $3,
       price = $4,
       original_price = $5,
       quota_total = $6,
       requires_student_id = $7,
       included_merch_info = $8,
       perks_json = $9::jsonb,
       is_active = $10,
       sort_order = $11
     WHERE id = $12 RETURNING *`,
    [
      d.name ?? ex.name,
      d.category ?? ex.category,
      d.description ?? ex.description,
      d.price ?? ex.price,
      d.original_price !== undefined ? d.original_price : ex.original_price,
      d.quota_total ?? ex.quota_total,
      d.requires_student_id !== undefined ? d.requires_student_id : ex.requires_student_id,
      d.included_merch_info !== undefined ? d.included_merch_info : ex.included_merch_info,
      JSON.stringify(d.perks_json !== undefined ? d.perks_json : ex.perks_json || []),
      d.is_active !== undefined ? d.is_active : ex.is_active,
      d.sort_order ?? ex.sort_order,
      id,
    ]
  );
  return c.json({ success: true, tier: res.rows[0] });
});

app.delete('/api/admin/ticket-tiers/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const used = await pool.query('SELECT 1 FROM order_items WHERE ticket_tier_id = $1 LIMIT 1', [id]);
  if (used.rowCount && used.rowCount > 0) {
    const res = await pool.query('UPDATE ticket_tiers SET is_active = FALSE WHERE id = $1 RETURNING *', [id]);
    return c.json({ success: true, softDeactivated: true, tier: res.rows[0] });
  }
  await pool.query('DELETE FROM ticket_tiers WHERE id = $1', [id]);
  return c.json({ success: true, deleted: true });
});

// --- MERCHANDISE PRODUCTS CRUD ---
const MerchMutationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(40),
  short_spec: z.string().trim().min(2).max(200),
  full_description: z.string().trim().min(4).max(1000),
  material_spec: z.string().trim().min(2).max(400),
  price: z.number().int().min(0).max(50000000),
  stock_total: z.number().int().min(0).max(50000),
  weight_grams: z.number().int().min(10).max(50000).default(250),
  image_url: z.string().trim().min(2).max(500),
  variants_json: z.array(z.string().trim().min(1)).default(['Standar']),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(10),
});

app.post('/api/admin/merch', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = MerchMutationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input merch tidak valid' }, 400);
  }
  const d = parsed.data;
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Math.floor(100 + Math.random() * 899)}`;
  const res = await pool.query(
    `INSERT INTO merch_products (slug, name, category, short_spec, full_description, material_spec, price, stock_total, weight_grams, image_url, variants_json, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13) RETURNING *`,
    [
      slug,
      d.name,
      d.category.toUpperCase(),
      d.short_spec,
      d.full_description,
      d.material_spec,
      d.price,
      d.stock_total,
      d.weight_grams,
      d.image_url,
      JSON.stringify(d.variants_json),
      d.is_active,
      d.sort_order,
    ]
  );
  return c.json({ success: true, merch: res.rows[0] }, 201);
});

app.put('/api/admin/merch/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = MerchMutationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input update merch tidak valid.' }, 400);
  }
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM merch_products WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Produk merch tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  const res = await pool.query(
    `UPDATE merch_products SET
       name = $1,
       category = $2,
       short_spec = $3,
       full_description = $4,
       material_spec = $5,
       price = $6,
       stock_total = $7,
       weight_grams = $8,
       image_url = $9,
       variants_json = $10::jsonb,
       is_active = $11,
       sort_order = $12
     WHERE id = $13 RETURNING *`,
    [
      d.name ?? ex.name,
      d.category ? d.category.toUpperCase() : ex.category,
      d.short_spec ?? ex.short_spec,
      d.full_description ?? ex.full_description,
      d.material_spec ?? ex.material_spec,
      d.price ?? ex.price,
      d.stock_total ?? ex.stock_total,
      d.weight_grams ?? ex.weight_grams,
      d.image_url ?? ex.image_url,
      JSON.stringify(d.variants_json !== undefined ? d.variants_json : ex.variants_json || []),
      d.is_active !== undefined ? d.is_active : ex.is_active,
      d.sort_order ?? ex.sort_order,
      id,
    ]
  );
  return c.json({ success: true, merch: res.rows[0] });
});

app.delete('/api/admin/merch/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const used = await pool.query('SELECT 1 FROM order_items WHERE merch_product_id = $1 LIMIT 1', [id]);
  if (used.rowCount && used.rowCount > 0) {
    const res = await pool.query('UPDATE merch_products SET is_active = FALSE WHERE id = $1 RETURNING *', [id]);
    return c.json({ success: true, softDeactivated: true, merch: res.rows[0] });
  }
  await pool.query('DELETE FROM merch_products WHERE id = $1', [id]);
  return c.json({ success: true, deleted: true });
});

// --- SHIPPING ZONES CRUD ---
const ZoneMutationSchema = z.object({
  mode: z.enum(['PICKUP_BOOTH', 'LOCAL_COURIER', 'REGULER_EXPEDITION']),
  zone_name: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(500),
  base_cost: z.number().int().min(0).max(5000000),
  cost_per_kg: z.number().int().min(0).max(5000000),
  estimated_days: z.string().trim().min(2).max(80),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(10),
});

app.post('/api/admin/shipping-zones', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = ZoneMutationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input zona tidak valid.' }, 400);
  }
  const d = parsed.data;
  const code = `ZONE-${d.mode.slice(0, 4)}-${Math.floor(100 + Math.random() * 899)}`;
  const res = await pool.query(
    `INSERT INTO shipping_zones (code, mode, zone_name, description, base_cost, cost_per_kg, estimated_days, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [code, d.mode, d.zone_name, d.description, d.base_cost, d.cost_per_kg, d.estimated_days, d.is_active, d.sort_order]
  );
  return c.json({ success: true, zone: res.rows[0] }, 201);
});

app.put('/api/admin/shipping-zones/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = ZoneMutationSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Input zona tidak valid.' }, 400);
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM shipping_zones WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Zona tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  const res = await pool.query(
    `UPDATE shipping_zones SET
       mode = $1, zone_name = $2, description = $3, base_cost = $4,
       cost_per_kg = $5, estimated_days = $6, is_active = $7, sort_order = $8
     WHERE id = $9 RETURNING *`,
    [
      d.mode ?? ex.mode,
      d.zone_name ?? ex.zone_name,
      d.description ?? ex.description,
      d.base_cost ?? ex.base_cost,
      d.cost_per_kg ?? ex.cost_per_kg,
      d.estimated_days ?? ex.estimated_days,
      d.is_active !== undefined ? d.is_active : ex.is_active,
      d.sort_order ?? ex.sort_order,
      id,
    ]
  );
  return c.json({ success: true, zone: res.rows[0] });
});

app.delete('/api/admin/shipping-zones/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const used = await pool.query('SELECT 1 FROM orders WHERE shipping_zone_id = $1 LIMIT 1', [id]);
  if (used.rowCount && used.rowCount > 0) {
    const res = await pool.query('UPDATE shipping_zones SET is_active = FALSE WHERE id = $1 RETURNING *', [id]);
    return c.json({ success: true, softDeactivated: true, zone: res.rows[0] });
  }
  await pool.query('DELETE FROM shipping_zones WHERE id = $1', [id]);
  return c.json({ success: true, deleted: true });
});

// --- EVENT TIMELINE CRUD ---
const TimelineMutationSchema = z.object({
  title: z.string().trim().min(3).max(180),
  subtitle: z.string().trim().min(3).max(180),
  date_label: z.string().trim().min(2).max(80),
  start_date: z.string().trim().min(8).max(20).default('2026-12-01'),
  end_date: z.string().trim().min(8).max(20).default('2026-12-17'),
  category: z.string().trim().min(2).max(40),
  venue: z.string().trim().min(2).max(180),
  description: z.string().trim().min(5).max(1000),
  badge_text: z.string().trim().min(2).max(60).default('Agenda'),
  cta_label: z.string().trim().min(2).max(60).default('Lihat Detail'),
  cta_target: z.string().trim().min(2).max(60).default('timeline'),
  sort_order: z.number().int().default(10),
  is_active: z.boolean().default(true),
});

app.post('/api/admin/timeline', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = TimelineMutationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input agenda tidak valid.' }, 400);
  }
  const d = parsed.data;
  const slug = `evt-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}-${Math.floor(100 + Math.random() * 899)}`;
  const res = await pool.query(
    `INSERT INTO event_timeline (slug, title, subtitle, date_label, start_date, end_date, category, venue, description, badge_text, cta_label, cta_target, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [
      slug,
      d.title,
      d.subtitle,
      d.date_label,
      d.start_date,
      d.end_date,
      d.category.toUpperCase(),
      d.venue,
      d.description,
      d.badge_text,
      d.cta_label,
      d.cta_target,
      d.sort_order,
      d.is_active,
    ]
  );
  return c.json({ success: true, event: res.rows[0] }, 201);
});

app.put('/api/admin/timeline/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = TimelineMutationSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Input update agenda tidak valid.' }, 400);
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM event_timeline WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Agenda tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  const res = await pool.query(
    `UPDATE event_timeline SET
       title = $1, subtitle = $2, date_label = $3, start_date = $4, end_date = $5,
       category = $6, venue = $7, description = $8, badge_text = $9,
       cta_label = $10, cta_target = $11, sort_order = $12, is_active = $13
     WHERE id = $14 RETURNING *`,
    [
      d.title ?? ex.title,
      d.subtitle ?? ex.subtitle,
      d.date_label ?? ex.date_label,
      d.start_date ?? ex.start_date,
      d.end_date ?? ex.end_date,
      d.category ? d.category.toUpperCase() : ex.category,
      d.venue ?? ex.venue,
      d.description ?? ex.description,
      d.badge_text ?? ex.badge_text,
      d.cta_label ?? ex.cta_label,
      d.cta_target ?? ex.cta_target,
      d.sort_order ?? ex.sort_order,
      d.is_active !== undefined ? d.is_active : ex.is_active,
      id,
    ]
  );
  return c.json({ success: true, event: res.rows[0] });
});

app.delete('/api/admin/timeline/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  await pool.query('DELETE FROM event_timeline WHERE id = $1', [id]);
  return c.json({ success: true, deleted: true });
});

// --- SITE SETTINGS CMS (HERO, GUEST STARS, ANATOMY, CREDITS, BANK, CONTACTS, SOCIALS) ---
app.put('/api/admin/site-settings', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;

  const patch = await c.req.json().catch(() => null);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return c.json({ success: false, error: 'Payload pengaturan situs harus berupa objek JSON.' }, 400);
  }

  const cur = await pool.query('SELECT value_json FROM site_settings WHERE key = $1', ['public_config']);
  const existing = cur.rows[0]?.value_json || {};
  const merged = { ...existing, ...patch };

  await pool.query(
    `INSERT INTO site_settings (key, value_json, updated_at)
     VALUES ('public_config', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(merged)]
  );
  return c.json({ success: true, siteSettings: merged });
});

// --- SPONSORSHIP INQUIRIES STATUS ---
app.put('/api/admin/sponsorships/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'CASHIER']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const status = String(body.status || '').toUpperCase();
  if (!['NEW', 'CONTACTED', 'CONFIRMED', 'REJECTED'].includes(status)) {
    return c.json({ success: false, error: 'Status sponsorship tidak valid.' }, 400);
  }
  const res = await pool.query('UPDATE sponsorship_inquiries SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!res.rows[0]) return c.json({ success: false, error: 'Data sponsorship tidak ditemukan.' }, 404);
  return c.json({ success: true, inquiry: res.rows[0] });
});

// --- STAFF USERS RBAC MANAGEMENT ---
const StaffCreateSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9_.-]+$/i, 'Username hanya huruf, angka, titik, atau garis bawah.'),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'CASHIER', 'SCANNER', 'MEDIA']),
  password: z.string().min(6).max(100),
});

app.post('/api/admin/staff', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = StaffCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input akun petugas tidak valid.' }, 400);
  }
  const d = parsed.data;
  const dup = await pool.query('SELECT 1 FROM staff_users WHERE LOWER(username) = LOWER($1)', [d.username]);
  if (dup.rowCount && dup.rowCount > 0) {
    return c.json({ success: false, error: 'Username sudah terdaftar.' }, 409);
  }
  const res = await pool.query(
    `INSERT INTO staff_users (username, full_name, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id, username, full_name, role, is_active, created_at`,
    [d.username.toLowerCase(), d.full_name, d.role, hashPassword(d.password)]
  );
  return c.json({ success: true, staff: res.rows[0] }, 201);
});

app.put('/api/admin/staff/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const cur = await pool.query('SELECT * FROM staff_users WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Akun tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  if (id === auth.userId && body.is_active === false) {
    return c.json({ success: false, error: 'Tidak dapat menonaktifkan akun yang sedang Anda gunakan.' }, 400);
  }

  const nextHash =
    typeof body.password === 'string' && body.password.trim().length >= 6
      ? hashPassword(body.password.trim())
      : ex.password_hash;

  const res = await pool.query(
    `UPDATE staff_users SET
       full_name = $1,
       role = $2,
       is_active = $3,
       password_hash = $4,
       session_version = session_version + 1
     WHERE id = $5
     RETURNING id, username, full_name, role, is_active, created_at`,
    [
      body.full_name ? String(body.full_name).trim() : ex.full_name,
      ['ADMIN', 'CASHIER', 'SCANNER', 'MEDIA'].includes(body.role) ? body.role : ex.role,
      typeof body.is_active === 'boolean' ? body.is_active : ex.is_active,
      nextHash,
      id,
    ]
  );
  return c.json({ success: true, staff: res.rows[0] });
});

// ---------------------------------------------------------------------------
// 6B. MEDIA STUDIO, SPONSOR AUTO-STAMP & OBS LIVE STREAMING KIT (ADMIN & MEDIA)
// ---------------------------------------------------------------------------

const obsSubscribers = new Map<string, Set<(event: string, payload: unknown) => void>>();

function broadcastObsEvent(slug: string, event: string, payload: unknown) {
  const subs = obsSubscribers.get(slug);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(event, payload);
    } catch {
      // ignore disconnected listener
    }
  }
}

function broadcastAllObs(event: string, payload: unknown) {
  for (const slug of obsSubscribers.keys()) {
    broadcastObsEvent(slug, event, payload);
  }
}

function verifyObsTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function buildObsPublicPayload(overlayRow: any) {
  const [settingsRes, timelineRes, sponsorsRes] = await Promise.all([
    pool.query(`SELECT value_json || jsonb_build_object('officialMediaPartner', COALESCE((SELECT value_json FROM site_settings WHERE key = 'official_media_partner'), '""'::jsonb)) AS value_json FROM site_settings WHERE key = $1`, ['public_config']),
    pool.query('SELECT * FROM event_timeline WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM media_sponsors WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
  ]);
  const { access_token: _secret, ...safeOverlay } = overlayRow;
  return {
    overlay: safeOverlay,
    eventMeta: settingsRes.rows[0]?.value_json || {},
    timeline: timelineRes.rows,
    sponsors: sponsorsRes.rows,
  };
}

app.get('/api/obs/state', async (c) => {
  const slug = String(c.req.query('overlay') || '').trim();
  const token = String(c.req.query('token') || '').trim();
  if (!slug || !token) {
    return c.json({ success: false, error: 'Parameter overlay dan token wajib disertakan.' }, 401);
  }
  const res = await pool.query('SELECT * FROM obs_overlays WHERE slug = $1 AND is_active = TRUE', [slug]);
  const row = res.rows[0];
  if (!row || !verifyObsTokenMatch(token, row.access_token)) {
    return c.json({ success: false, error: 'Token OBS tidak valid atau overlay tidak aktif.' }, 403);
  }
  const data = await buildObsPublicPayload(row);
  return c.json({ success: true, ...data });
});

app.get('/api/obs/stream', async (c) => {
  const slug = String(c.req.query('overlay') || '').trim();
  const token = String(c.req.query('token') || '').trim();
  if (!slug || !token) {
    return c.json({ success: false, error: 'Parameter overlay dan token wajib disertakan.' }, 401);
  }
  const res = await pool.query('SELECT * FROM obs_overlays WHERE slug = $1 AND is_active = TRUE', [slug]);
  const row = res.rows[0];
  if (!row || !verifyObsTokenMatch(token, row.access_token)) {
    return c.json({ success: false, error: 'Token OBS tidak valid.' }, 403);
  }

  if ((obsSubscribers.get(slug)?.size || 0) >= 50) {
    return c.json({ success: false, error: 'Terlalu banyak koneksi pemantau OBS aktif.' }, 429);
  }

  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    let closed = false;
    let pending = Promise.resolve();
    let resolveDone: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pingTimer);
      const subscribers = obsSubscribers.get(slug);
      subscribers?.delete(listener);
      if (subscribers?.size === 0) obsSubscribers.delete(slug);
      resolveDone?.();
    };
    const send = (event: string, payload: unknown) => {
      pending = pending.then(async () => {
        if (!closed) await stream.writeSSE({ event, data: JSON.stringify(payload) });
      }).catch(cleanup);
    };
    const listener = (event: string, payload: unknown) => send(event, payload);
    const pingTimer = setInterval(() => send('ping', Date.now()), 25000);
    if (!obsSubscribers.has(slug)) obsSubscribers.set(slug, new Set());
    obsSubscribers.get(slug)!.add(listener);
    stream.onAbort(cleanup);
    try {
      send('connected', { slug, ts: Date.now() });
      await donePromise;
    } finally {
      cleanup();
    }
  });
});

app.get('/api/admin/media-partner', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const result = await pool.query("SELECT value_json FROM site_settings WHERE key = 'official_media_partner'");
  return c.json({ success: true, url: result.rows[0]?.value_json || '' });
});

app.put('/api/admin/media-partner', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const parsed = z.object({ url: z.union([z.literal(''), z.string().max(500).regex(/^\/uploads\/media\/[a-zA-Z0-9_.-]+$/)]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'Logo harus berasal dari unggahan media.' }, 400);
  await pool.query("INSERT INTO site_settings (key, value_json, updated_at) VALUES ('official_media_partner', $1::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()", [JSON.stringify(parsed.data.url)]);
  broadcastAllObs('sponsors_updated', {});
  return c.json({ success: true, url: parsed.data.url });
});

app.get('/api/admin/media-overview', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;

  const [overlaysRes, sponsorsRes, settingsRes, timelineRes, tiersRes, merchRes] = await Promise.all([
    pool.query('SELECT * FROM obs_overlays ORDER BY id ASC'),
    pool.query('SELECT * FROM media_sponsors ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT value_json FROM site_settings WHERE key = $1', ['public_config']),
    pool.query('SELECT * FROM event_timeline WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM ticket_tiers WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
    pool.query('SELECT * FROM merch_products WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC'),
  ]);

  return c.json({
    success: true,
    obsOverlays: overlaysRes.rows,
    mediaSponsors: sponsorsRes.rows,
    siteSettings: settingsRes.rows[0]?.value_json || {},
    timeline: timelineRes.rows,
    ticketTiers: tiersRes.rows,
    merchProducts: merchRes.rows,
  });
});

const ObsOverlayCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  layout_preset: z
    .enum(['lower_third', 'corner_bug', 'guest_spotlight', 'rundown_schedule', 'standby_soon', 'sponsor_wall', 'full_frame'])
    .default('lower_third'),
  theme_mode: z.enum(['dark', 'light']).default('dark'),
  transition_preset: z
    .enum(['broadcast_wipe', 'slide_edge', 'zoom_pop', 'fade_smooth', 'cut'])
    .default('broadcast_wipe'),
  lower_third_title: z.string().trim().min(2).max(160).default('Dies Natalis ke-44 SMAN 1 Gedeg'),
  lower_third_subtitle: z.string().trim().max(200).default('AVERSA • Action, Compassion, Celebration'),
  corner_bug_text: z.string().trim().max(80).default('LIVE • AVERSA 44'),
  show_countdown: z.boolean().default(true),
  show_sponsors: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

const cloudStreamKeySchema = z.object({
  youtubeStreamKey: z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

app.get('/api/admin/cloud-stream/config', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const result = await pool.query("SELECT key, value_json, updated_at FROM site_settings WHERE key IN ('cloud_stream_config', 'cloud_stream_status')");
  const config = result.rows.find((row) => row.key === 'cloud_stream_config')?.value_json || {};
  const status = result.rows.find((row) => row.key === 'cloud_stream_status');
  const engine = status && Date.now() - new Date(status.updated_at).getTime() < 15000 ? status.value_json : null;
  const ingestHost = process.env.CLOUD_STREAM_TAILSCALE_IP || '';
  const octets = ingestHost.split('.').map(Number);
  const validHost = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  const ingestUser = process.env.CLOUD_STREAM_INGEST_USER || '';
  return c.json({ success: true, configured: Boolean(config.youtube_key_encrypted), desired: config.desired === true, audioConfigured: Boolean(config.audio_filename && process.env.CLOUD_STREAM_DATA_DIR && fs.existsSync(path.join(process.env.CLOUD_STREAM_DATA_DIR, 'fallback.wav'))), engine: engine?.state || 'unavailable', obs: engine?.obs === true, ingestHost: validHost ? ingestHost : '', ingestUser: /^[A-Za-z0-9_-]{3,64}$/.test(ingestUser) ? ingestUser : '' });
});

app.put('/api/admin/cloud-stream/config', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const masterKey = process.env.CLOUD_STREAM_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(masterKey)) return c.json({ success: false, error: 'Penyimpanan kunci siaran belum dikonfigurasi.' }, 503);
  const body = cloudStreamKeySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ success: false, error: 'Kunci siaran tidak valid.' }, 400);
  const encrypted = sealCloudSecret(body.data.youtubeStreamKey, masterKey);
  await pool.query(
    `INSERT INTO site_settings (key, value_json) VALUES ('cloud_stream_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = site_settings.value_json || EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify({ youtube_key_encrypted: encrypted })],
  );
  return c.json({ success: true, configured: true });
});

app.put('/api/admin/cloud-stream/state', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const parsed = z.object({ desired: z.boolean() }).strict().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'Status siaran tidak valid.' }, 400);
  const result = await pool.query("SELECT value_json FROM site_settings WHERE key = 'cloud_stream_config'");
  if (parsed.data.desired && !result.rows[0]?.value_json?.youtube_key_encrypted) {
    return c.json({ success: false, error: 'Simpan kunci YouTube terlebih dahulu.' }, 400);
  }
  if (parsed.data.desired) {
    const worker = await pool.query("SELECT 1 FROM site_settings WHERE key = 'cloud_stream_status' AND updated_at > NOW() - INTERVAL '15 seconds'");
    if (!worker.rowCount) return c.json({ success: false, error: 'Mesin siaran belum tersedia.' }, 503);
  }
  await pool.query(
    `INSERT INTO site_settings (key, value_json) VALUES ('cloud_stream_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = site_settings.value_json || EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify({ desired: parsed.data.desired })],
  );
  return c.json({ success: true, desired: parsed.data.desired });
});

function isPlayablePcmWav(data: Buffer): boolean {
  if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') return false;
  const end = data.readUInt32LE(4) + 8;
  if (end > data.length || end < 44) return false;
  let formatOk = false;
  let hasSamples = false;
  for (let offset = 12; offset + 8 <= end;) {
    const name = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size > end - start) return false;
    if (name === 'fmt ' && size >= 16) {
      const encoding = data.readUInt16LE(start);
      const channels = data.readUInt16LE(start + 2);
      const rate = data.readUInt32LE(start + 4);
      const alignment = data.readUInt16LE(start + 12);
      const bits = data.readUInt16LE(start + 14);
      formatOk = (encoding === 1 || encoding === 3) && channels >= 1 && channels <= 2 && rate >= 8000 && rate <= 192000 && alignment > 0 && alignment <= 16 && [8, 16, 24, 32].includes(bits);
    }
    if (name === 'data' && size > 0) hasSamples = true;
    offset = start + size + (size % 2);
  }
  return formatOk && hasSamples;
}

app.use('/api/admin/cloud-stream/audio', bodyLimit({ maxSize: 32 * 1024 * 1024, onError: (c) => c.json({ success: false, error: 'Audio maksimal 32 MB.' }, 413) }));
app.post('/api/admin/cloud-stream/audio', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const current = await pool.query("SELECT value_json FROM site_settings WHERE key = 'cloud_stream_config'");
  if (current.rows[0]?.value_json?.desired === true) {
    return c.json({ success: false, error: 'Hentikan siaran sebelum mengganti audio cadangan.' }, 409);
  }
  const directory = process.env.CLOUD_STREAM_DATA_DIR;
  if (!directory) return c.json({ success: false, error: 'Penyimpanan audio siaran belum dikonfigurasi.' }, 503);
  const form = await c.req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File) || audio.size < 44 || audio.size > 31 * 1024 * 1024) {
    return c.json({ success: false, error: 'Pilih audio WAV yang ukurannya maksimal 31 MB.' }, 400);
  }
  const data = Buffer.from(await audio.arrayBuffer());
  if (!isPlayablePcmWav(data)) {
    return c.json({ success: false, error: 'Berkas audio harus berformat WAV.' }, 400);
  }
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.audio-${crypto.randomBytes(12).toString('hex')}.tmp`);
  try {
    await fs.promises.writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temporary, path.join(directory, 'fallback.wav'));
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  await pool.query(
    `INSERT INTO site_settings (key, value_json) VALUES ('cloud_stream_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = site_settings.value_json || EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify({ audio_filename: 'fallback.wav', audio_revision: crypto.randomBytes(12).toString('hex') })],
  );
  return c.json({ success: true, audioConfigured: true });
});

app.post('/api/admin/obs-overlays', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = ObsOverlayCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input overlay tidak valid.' }, 400);
  }
  const d = parsed.data;
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}-${Math.floor(100 + Math.random() * 899)}`;
  const token = crypto.randomBytes(16).toString('hex');
  const res = await pool.query(
    `INSERT INTO obs_overlays
      (slug, name, access_token, layout_preset, theme_mode, transition_preset, lower_third_title, lower_third_subtitle, corner_bug_text, show_countdown, show_sponsors, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      slug,
      d.name,
      token,
      d.layout_preset,
      d.theme_mode,
      d.transition_preset,
      d.lower_third_title,
      d.lower_third_subtitle,
      d.corner_bug_text,
      d.show_countdown,
      d.show_sponsors,
      d.is_active,
    ]
  );
  return c.json({ success: true, overlay: res.rows[0] }, 201);
});

app.put('/api/admin/obs-overlays/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = ObsOverlayCreateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Input update overlay tidak valid.' }, 400);
  }
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM obs_overlays WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Overlay tidak ditemukan.' }, 404);
  const ex = cur.rows[0];

  const res = await pool.query(
    `UPDATE obs_overlays SET
       name = $1, layout_preset = $2, theme_mode = $3, transition_preset = $4,
       lower_third_title = $5, lower_third_subtitle = $6, corner_bug_text = $7,
       show_countdown = $8, show_sponsors = $9, is_active = $10, updated_at = NOW()
     WHERE id = $11 RETURNING *`,
    [
      d.name ?? ex.name,
      d.layout_preset ?? ex.layout_preset,
      d.theme_mode ?? ex.theme_mode,
      d.transition_preset ?? ex.transition_preset,
      d.lower_third_title ?? ex.lower_third_title,
      d.lower_third_subtitle ?? ex.lower_third_subtitle,
      d.corner_bug_text ?? ex.corner_bug_text,
      d.show_countdown !== undefined ? d.show_countdown : ex.show_countdown,
      d.show_sponsors !== undefined ? d.show_sponsors : ex.show_sponsors,
      d.is_active !== undefined ? d.is_active : ex.is_active,
      id,
    ]
  );
  const updated = res.rows[0];
  broadcastObsEvent(updated.slug, 'state_updated', await buildObsPublicPayload(updated));
  return c.json({ success: true, overlay: updated });
});

app.post('/api/admin/obs-overlays/:id/stinger', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const label = String(body.label || 'LIVE • AVERSA 44').trim().slice(0, 60);
  const cur = await pool.query('SELECT slug FROM obs_overlays WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Overlay tidak ditemukan.' }, 404);
  broadcastObsEvent(cur.rows[0].slug, 'stinger', { label, ts: Date.now() });
  return c.json({ success: true, label });
});

app.post('/api/admin/obs-overlays/:id/regenerate-token', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const nextToken = crypto.randomBytes(16).toString('hex');
  const res = await pool.query(
    'UPDATE obs_overlays SET access_token = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [nextToken, id]
  );
  if (!res.rows[0]) return c.json({ success: false, error: 'Overlay tidak ditemukan.' }, 404);
  return c.json({ success: true, overlay: res.rows[0] });
});

app.delete('/api/admin/obs-overlays/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  await pool.query('DELETE FROM obs_overlays WHERE id = $1', [id]);
  return c.json({ success: true, deleted: true });
});

const SponsorMutationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tier: z.string().trim().min(2).max(32).default('GOLD'),
  logo_url: z.string().trim().min(2).max(500),
  dark_logo_url: z.string().trim().max(500).nullable().optional(),
  boxed: z.boolean().default(false),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(10),
});

app.post('/api/admin/media-sponsors', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = SponsorMutationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message || 'Input sponsor tidak valid.' }, 400);
  }
  const d = parsed.data;
  const res = await pool.query(
    `INSERT INTO media_sponsors (name, tier, logo_url, dark_logo_url, boxed, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.name, d.tier.toUpperCase(), d.logo_url, d.dark_logo_url ?? null, d.boxed, d.is_active, d.sort_order]
  );
  broadcastAllObs('sponsors_updated', { ts: Date.now() });
  return c.json({ success: true, sponsor: res.rows[0] }, 201);
});

app.put('/api/admin/media-sponsors/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const parsed = SponsorMutationSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Input update sponsor tidak valid.' }, 400);
  const d = parsed.data;
  const cur = await pool.query('SELECT * FROM media_sponsors WHERE id = $1', [id]);
  if (!cur.rows[0]) return c.json({ success: false, error: 'Sponsor tidak ditemukan.' }, 404);
  const ex = cur.rows[0];
  const res = await pool.query(
    `UPDATE media_sponsors SET
       name = $1, tier = $2, logo_url = $3, dark_logo_url = $4,
       boxed = $5, is_active = $6, sort_order = $7
     WHERE id = $8 RETURNING *`,
    [
      d.name ?? ex.name,
      d.tier ? d.tier.toUpperCase() : ex.tier,
      d.logo_url ?? ex.logo_url,
      d.dark_logo_url !== undefined ? d.dark_logo_url : ex.dark_logo_url,
      d.boxed !== undefined ? d.boxed : ex.boxed,
      d.is_active !== undefined ? d.is_active : ex.is_active,
      d.sort_order ?? ex.sort_order,
      id,
    ]
  );
  broadcastAllObs('sponsors_updated', { ts: Date.now() });
  return c.json({ success: true, sponsor: res.rows[0] });
});

app.delete('/api/admin/media-sponsors/:id', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;
  const id = Number(c.req.param('id'));
  await pool.query('DELETE FROM media_sponsors WHERE id = $1', [id]);
  broadcastAllObs('sponsors_updated', { ts: Date.now() });
  return c.json({ success: true, deleted: true });
});

app.use('/api/admin/media/upload', bodyLimit({ maxSize: 9 * 1024 * 1024, onError: (c) => c.json({ success: false, error: 'Ukuran file maksimal 8 MB.' }, 413) }));
app.post('/api/admin/media/upload', async (c) => {
  const auth = requireRoles(c, ['ADMIN', 'MEDIA']);
  if (auth instanceof Response) return auth;

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return c.json({ success: false, error: 'File gambar wajib dipilih.' }, 400);
  }
  if (file.size > 8 * 1024 * 1024) {
    return c.json({ success: false, error: 'Ukuran file maksimal 8 MB.' }, 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const isPng = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';

  if (!isPng && !isJpg && !isWebp) {
    return c.json({ success: false, error: 'Hanya file gambar PNG, JPG, atau WebP yang diizinkan.' }, 400);
  }

  const ext = isPng ? 'png' : isJpg ? 'jpg' : 'webp';
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'media');
  fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const fullPath = path.join(uploadDir, filename);
  fs.writeFileSync(fullPath, buf);

  return c.json({ success: true, url: `/uploads/media/${filename}` }, 201);
});

// ---------------------------------------------------------------------------
// 7. SEO CRAWLER ENDPOINTS (/sitemap.xml, /robots.txt) & PRODUCTION ASSETS
// ---------------------------------------------------------------------------

app.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.body(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (c) => {
  c.header('Content-Type', 'application/xml; charset=utf-8');
  const today = new Date().toISOString().slice(0, 10);
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${PUBLIC_SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${PUBLIC_SITE_URL}/#tiket</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${PUBLIC_SITE_URL}/#merch</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${PUBLIC_SITE_URL}/#rangkaian</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${PUBLIC_SITE_URL}/#sponsorship</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
</urlset>`);
});

// Serve uploaded media assets dynamically in both dev and production
app.use('/uploads/*', async (c, next) => {
  await next();
  if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=86400');
});
app.use('/uploads/*', serveStatic({ root: './public' }));

// Branded HTTP Error Pages (400, 403, 404, 500, 502, 503, 505)
app.get('/error/:code', (c) => {
  const code = resolveErrorCode(c.req.param('code'));
  return c.html(renderBrandedErrorHtml(code), code);
});
app.use('/errors/*', serveStatic({ root: './public' }));

app.onError((err, c) => {
  console.error('[AVERSA 44] Unhandled error:', err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Terjadi gangguan server sementara.' }, 500);
  }
  return c.html(renderBrandedErrorHtml(500), 500);
});

const SPA_ROUTES = new Set(['/', '/tiket', '/tickets', '/merch', '/dompet-tiket', '/wallet', '/obs', '/office']);
const isKnownSpaPath = (pathname: string): boolean => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return SPA_ROUTES.has(clean) || clean.startsWith('/office/');
};

// Serve static files cleanly in both dev & production
const distClientDir = path.resolve(process.cwd(), 'dist/client');

if (fs.existsSync(distClientDir)) {
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', async (c, next) => {
    await next();
    if (c.res.status === 200 && !c.req.path.startsWith('/api/') && !c.req.path.startsWith('/assets/') && !c.res.headers.get('Cache-Control')) {
      c.header('Cache-Control', 'public, max-age=86400');
    }
  });
  app.use('/*', serveStatic({ root: './dist/client' }));
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ success: false, error: 'Endpoint tidak ditemukan.' }, 404);
    }
    if (!isKnownSpaPath(c.req.path)) {
      return c.html(renderBrandedErrorHtml(404), 404);
    }
    const htmlPath = path.join(distClientDir, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
} else {
  app.use('/assets/*', serveStatic({ root: './public' }));
  app.use('/og-banner-aversa44.png', serveStatic({ path: './public/og-banner-aversa44.png' }));
  app.use('/twitter-banner-aversa44.png', serveStatic({ path: './public/twitter-banner-aversa44.png' }));
  app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }));
  app.use('/favicon.png', serveStatic({ path: './public/favicon.png' }));
  app.use('/favicon-32x32.png', serveStatic({ path: './public/favicon-32x32.png' }));
  app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }));
  app.use('/apple-touch-icon.png', serveStatic({ path: './public/apple-touch-icon.png' }));
}

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Endpoint tidak ditemukan.' }, 404);
  }
  return c.html(renderBrandedErrorHtml(404), 404);
});

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const url = new URL(PUBLIC_SITE_URL);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (process.env.ALLOW_INSECURE_LOCAL_DEV === '1' && isLocal && url.protocol === 'http:') {
    console.warn('[AVERSA 44] Local-only production configuration bypass is enabled.');
    return;
  }
  if (!turnstileEnabled) throw new Error('TURNSTILE_ENABLED cannot be disabled in production.');
  for (const name of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
    const value = process.env[name] || '';
    if (!value.trim()) throw new Error(`${name} is missing from the container environment.`);
    if (value !== value.trim()) throw new Error(`${name} must not contain leading or trailing whitespace.`);
    if (/^(1x|2x|3x)0{10}/.test(value)) throw new Error(`${name} must use a live key in production.`);
  }
  if (!trustedProxies.length || trustedProxies.length !== (process.env.TRUSTED_PROXY_IPS || '').split(',').length) throw new Error('TRUSTED_PROXY_IPS must list the exact proxy peer addresses.');
  if (url.protocol !== 'https:' || isLocal || url.username || url.password) {
    throw new Error('PUBLIC_SITE_URL must be a public HTTPS origin in production.');
  }
  for (const name of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
    if (!process.env[name]?.trim()) throw new Error(`${name} must be set in production.`);
  }
  if (qrisEnabled) {
    for (const name of ['QBIZ_BASE_URL', 'QBIZ_API_KEY', 'QBIZ_MERCHANT_ID']) {
      if (!process.env[name]?.trim()) throw new Error(`${name} must be set when QRIS is enabled.`);
    }
  }
  const secrets = ['SESSION_SECRET', 'TICKET_HMAC_SECRET', ...(qrisEnabled ? ['QBIZ_WEBHOOK_SECRET'] : []), ...(process.env.XENDIT_CALLBACK_TOKEN ? ['XENDIT_CALLBACK_TOKEN'] : [])];
  const values = secrets.map((name) => {
    const value = process.env[name] || '';
    if (value.length < 32 || /aversa44|example|changeme|replace|placeholder/i.test(value)) {
      throw new Error(`${name} must be an explicit strong production secret.`);
    }
    return value;
  });
  if (new Set(values).size !== values.length) throw new Error('Production secrets must be distinct.');
}

async function bootstrap() {
  try {
    validateProductionConfiguration();
    await initDatabase();
    console.log(`[AVERSA 44] PostgreSQL ready (${process.env.PGDATABASE || 'aversa44_db'}).`);
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(`[AVERSA 44] Hono Server listening on http://localhost:${info.port}`);
    });
  } catch (err) {
    console.error('[AVERSA 44] Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
