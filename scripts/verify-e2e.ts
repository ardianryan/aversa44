import 'dotenv/config';
import { signQbizWebhookBody } from '../src/server/sdk/qbiz.ts';

const BASE = `http://localhost:${process.env.PORT || 4400}`;
const QBIZ_WEBHOOK_SECRET = process.env.QBIZ_WEBHOOK_SECRET || 'local_test_only_qbiz_webhook_secret_not_for_production';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function run() {
  console.log('--- AVERSA 44 E2E VERIFICATION SUITE ---');

  // 1. Health & Catalog & SEO
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert(health.ok === true, 'Health endpoint & PostgreSQL connection OK');

  const catalog = await (await fetch(`${BASE}/api/catalog`)).json();
  assert(
    catalog.success && Array.isArray(catalog.ticketTiers) && catalog.merchProducts.length >= 1 && catalog.shippingZones.length >= 1,
    `Catalog loaded (${catalog.ticketTiers.length} ticket tiers, ${catalog.merchProducts.length} merch items, ${catalog.shippingZones.length} shipping zones)`
  );

  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  assert(robots.includes('Sitemap:'), 'SEO /robots.txt served cleanly');
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert(sitemap.includes('<urlset'), 'SEO /sitemap.xml served cleanly');
  const ogImg = await fetch(`${BASE}/og-banner-aversa44.png`);
  assert(ogImg.status === 200, 'OpenGraph 1200x630 Social Banner accessible (HTTP 200)');

  for (const assetPath of [
    '/favicon.svg',
    '/favicon.png',
    '/favicon-32x32.png',
    '/favicon.ico',
    '/assets/extracted/logo-sman1gedeg.png',
  ]) {
    const res = await fetch(`${BASE}${assetPath}`);
    assert(res.status === 200, `Brand asset ${assetPath} accessible (HTTP 200)`);
  }

  const rootHtml = await (await fetch(`${BASE}/`)).text();
  assert(rootHtml.includes('/favicon.svg?v=44') && !rootHtml.includes('Office &amp; Scanner'), 'Public HTML wires AVERSA 44 SVG favicon without exposing /office');

  const officePage = await fetch(`${BASE}/office`);
  const officeHtml = await officePage.text();
  assert(officePage.status === 200 && officeHtml.includes('<div id="root"></div>'), 'Dedicated /office route serves SPA HTML (HTTP 200)');

  for (const slugRoute of [
    '/tiket',
    '/merch',
    '/dompet-tiket',
    '/office/tiket',
    '/office/merch',
    '/office/panggung',
    '/office/media-studio',
    '/office/live-kit',
    '/obs',
  ]) {
    const r = await fetch(`${BASE}${slugRoute}`);
    const h = await r.text();
    assert(r.status === 200 && h.includes('<div id="root"></div>'), `Refreshable slug route ${slugRoute} serves SPA HTML (HTTP 200)`);
  }

  // 2. Order Creation with QBiz Dynamic QRIS (Mixed Ticket + Merch Pick-Up Booth)
  let tierExt = catalog.ticketTiers.find(
    (t: any) => !t.requires_student_id && t.quota_total - t.quota_sold >= 1
  );
  let tempTierId: number | null = null;
  let preAdminCookie = '';
  if (!tierExt) {
    const tmpLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Aversa44!' }),
    });
    preAdminCookie = tmpLogin.headers.get('set-cookie')?.split(';')[0] || '';
    const tmpCreate = await fetch(`${BASE}/api/admin/ticket-tiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: preAdminCookie },
      body: JSON.stringify({
        name: 'E2E Temporary Pass',
        category: 'EXTERNAL',
        description: 'Tiket uji coba E2E otomatis',
        price: 115000,
        quota_total: 20,
        requires_student_id: false,
        perks_json: ['Akses Gate Uji E2E'],
        is_active: true,
        sort_order: 98,
      }),
    });
    const tmpJson = await tmpCreate.json();
    tierExt = tmpJson.tier;
    tempTierId = tierExt?.id ?? null;
    assert(Boolean(tempTierId), 'Created temporary EXTERNAL ticket tier for E2E checkout check');
  }
  const merchPolo = catalog.merchProducts[0];
  const boothZone = catalog.shippingZones.find((z: any) => z.mode === 'PICKUP_BOOTH') || catalog.shippingZones[0];

  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'E2E Tester Aversa',
      customerPhone: '081234567899',
      customerEmail: 'tester@example.com',
      customerType: 'ALUMNI',
      fulfillmentMode: 'PICKUP_BOOTH',
      shippingZoneId: boothZone.id,
      paymentMethod: 'QBIZ_QRIS',
      items: [
        { itemType: 'TICKET', id: tierExt.id, quantity: 1 },
        { itemType: 'MERCH', id: merchPolo.id, variantLabel: 'Jet Black • L', quantity: 1 },
      ],
    }),
  });
  const orderData = await orderRes.json();
  assert(orderRes.status === 201 && orderData.success, `Order created: ${orderData.order?.order_code}`);
  assert(
    orderData.order.total_amount === orderData.order.subtotal_amount + orderData.order.shipping_amount + orderData.order.unique_code,
    `QBiz Dynamic QRIS total_amount (${orderData.order.total_amount}) equals base + 3-digit unique_code (${orderData.order.unique_code})`
  );
  assert(typeof orderData.qrisDataUrl === 'string' && orderData.qrisDataUrl.startsWith('data:image/png'), 'QBiz EMVCo QRIS Data URL generated');

  const orderCode = orderData.order.order_code;
  const ticketQr = orderData.tickets[0].qr_payload;
  const merchPickupQr = orderData.order.pickup_qr_token;

  // 3. Cryptographic Webhook Security Test
  const webhookBody = JSON.stringify({
    event: 'payment.success',
    invoice_id: orderData.order.qbiz_invoice_id,
    order_id: orderCode,
    amount_paid: orderData.order.total_amount,
    paid_at: new Date().toISOString(),
  });

  // 3a. Forged Signature must be rejected 401
  const badWebhook = await fetch(`${BASE}/api/webhooks/qbiz`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-QBiz-Signature': 'forged_invalid_signature_0000',
    },
    body: webhookBody,
  });
  assert(badWebhook.status === 401, 'QBiz Webhook rejects forged X-QBiz-Signature with HTTP 401');

  // A correctly signed webhook must still match the stored invoice and amount.
  for (const mismatch of [{ amount_paid: orderData.order.total_amount + 1 }, { invoice_id: 'wrong-invoice' }]) {
    const mismatchedBody = JSON.stringify({ ...JSON.parse(webhookBody), ...mismatch });
    const response = await fetch(`${BASE}/api/webhooks/qbiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-QBiz-Signature': signQbizWebhookBody(mismatchedBody, QBIZ_WEBHOOK_SECRET) },
      body: mismatchedBody,
    });
    assert(response.status === 400, 'Signed QBiz webhook with mismatched payment details rejected');
  }

  // 3b. Valid HMAC-SHA256 Signature settles order and activates ticket + merch pickup QR
  const validSig = signQbizWebhookBody(webhookBody, QBIZ_WEBHOOK_SECRET);
  const goodWebhook = await fetch(`${BASE}/api/webhooks/qbiz`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-QBiz-Signature': validSig,
    },
    body: webhookBody,
  });
  const goodData = await goodWebhook.json();
  assert(goodWebhook.status === 200 && goodData.status === 'PAID', 'QBiz Webhook accepts valid HMAC-SHA256 and marks order PAID');

  // 4. Staff Scanner RBAC Auth & Anti-Double-Scan Gate Test
  const unauthScan = await fetch(`${BASE}/api/scanner/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrPayload: ticketQr }),
  });
  assert(unauthScan.status === 401, 'Unauthenticated scanner request rejected with HTTP 401');

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'scanner', password: 'Gate44!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert(loginRes.status === 200 && cookieHeader.includes('aversa44_staff_session'), 'Scanner staff logged in with HttpOnly cookie');

  // 4a. Tampered QR signature rejected
  const tamperedQr = ticketQr.slice(0, -1) + (ticketQr.endsWith('A') ? 'B' : 'A');
  const tamperInspect = await fetch(`${BASE}/api/scanner/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: tamperedQr }),
  });
  const tamperJson = await tamperInspect.json();
  assert(tamperInspect.status === 400 && tamperJson.verdict === 'INVALID_SIGNATURE', 'Tampered QR Code rejected (INVALID_SIGNATURE)');

  // 4b. Valid Ticket Inspect -> First Check-In SUCCESS -> Second Check-In ALREADY_SCANNED
  const inspectRes = await fetch(`${BASE}/api/scanner/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: ticketQr }),
  });
  const inspectJson = await inspectRes.json();
  assert(inspectJson.verdict === 'READY_TO_CHECKIN' && inspectJson.orderItems.length === 2, 'Ticket QR inspection displays complete ticket + merch items');

  const firstExec = await fetch(`${BASE}/api/scanner/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: ticketQr, gateLocation: 'Gate E2E Test' }),
  });
  const firstJson = await firstExec.json();
  assert(firstExec.status === 200 && firstJson.verdict === 'SUCCESS', 'First ticket check-in succeeds atomically');

  const secondExec = await fetch(`${BASE}/api/scanner/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: ticketQr, gateLocation: 'Gate E2E Test' }),
  });
  const secondJson = await secondExec.json();
  assert(secondExec.status === 409 && secondJson.verdict === 'ALREADY_SCANNED', 'Second ticket check-in blocked (ALREADY_SCANNED anti-double-scan)');

  // 4c. Merch Booth Pickup QR Scan -> Handover SUCCESS -> Double Pickup blocked
  const merchExec1 = await fetch(`${BASE}/api/scanner/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: merchPickupQr, gateLocation: 'Booth Merch E2E' }),
  });
  const merchJson1 = await merchExec1.json();
  assert(merchExec1.status === 200 && merchJson1.verdict === 'SUCCESS', 'Booth Merch Pickup QR scan succeeds');

  const merchExec2 = await fetch(`${BASE}/api/scanner/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ qrPayload: merchPickupQr, gateLocation: 'Booth Merch E2E' }),
  });
  const merchJson2 = await merchExec2.json();
  assert(merchExec2.status === 409 && merchJson2.verdict === 'ALREADY_SCANNED', 'Duplicate Merch Pickup blocked (ALREADY_SCANNED)');

  // 5. Cash POS Order + Local Courier Shipping + Cashier Confirmation
  const courierZone = catalog.shippingZones.find((z: any) => z.mode === 'LOCAL_COURIER');
  const cashOrderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Siswa SMANSAGE E2E',
      customerPhone: '085611223344',
      customerType: 'SISWA',
      identityNumber: '0089123456',
      kelasAngkatan: 'XI 2',
      fulfillmentMode: 'LOCAL_COURIER',
      shippingZoneId: courierZone.id,
      shippingAddress: 'Jl. Pendidikan 12 Gedeg Mojokerto',
      paymentMethod: 'CASH_BOOTH',
      items: [{ itemType: 'MERCH', id: merchPolo.id, variantLabel: 'Jet Black • M', quantity: 1 }],
    }),
  });
  const cashOrderData = await cashOrderRes.json();
  assert(cashOrderRes.status === 201 && cashOrderData.order.shipping_amount === courierZone.base_cost, 'Local Courier shipping cost calculated correctly on server');

  const kasirLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kasir', password: 'Kasir44!' }),
  });
  const kasirCookie = kasirLogin.headers.get('set-cookie')?.split(';')[0] || '';
  const confirmCashRes = await fetch(`${BASE}/api/admin/orders/${cashOrderData.order.order_code}/confirm-payment`, {
    method: 'POST',
    headers: { Cookie: kasirCookie },
  });
  const confirmCashJson = await confirmCashRes.json();
  assert(confirmCashRes.status === 200 && confirmCashJson.order.payment_status === 'PAID', 'Cashier POS confirms CASH_BOOTH order to PAID');

  // 6. Office Admin CMS CRUD, Public Catalog Sync & RBAC Guards
  // 6a. Scanner role must be blocked (403) from Admin CMS routes
  const scannerBlockedSettings = await fetch(`${BASE}/api/admin/site-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ heroTitleHighlight: 'Hacker Override' }),
  });
  assert(scannerBlockedSettings.status === 403, 'Scanner role blocked with HTTP 403 on PUT /api/admin/site-settings');

  const scannerBlockedTier = await fetch(`${BASE}/api/admin/ticket-tiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({
      name: 'Unauthorized Tier',
      category: 'EXTERNAL',
      description: 'Should fail RBAC',
      price: 1000,
      quota_total: 10,
    }),
  });
  assert(scannerBlockedTier.status === 403, 'Scanner role blocked with HTTP 403 on POST /api/admin/ticket-tiers');

  // 6b. Login as ADMIN
  const adminLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Aversa44!' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] || '';
  assert(adminLogin.status === 200 && adminCookie.includes('aversa44_staff_session'), 'Admin logged in cleanly');

  const overviewRes = await fetch(`${BASE}/api/admin/overview`, { headers: { Cookie: adminCookie } });
  const overviewJson = await overviewRes.json();
  assert(
    overviewRes.status === 200 &&
      overviewJson.success &&
      Array.isArray(overviewJson.staffUsers) &&
      overviewJson.staffUsers.every((u: any) => !('password_hash' in u)),
    'Admin overview returns full CMS state without exposing password_hash'
  );

  // 6c. Dynamic Ticket Tier CRUD + Active/Inactive Public Visibility
  const newTierRes = await fetch(`${BASE}/api/admin/ticket-tiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'E2E Backstage Temporary',
      category: 'VIP',
      description: 'Tiket uji coba CMS dinamis',
      price: 175000,
      quota_total: 50,
      requires_student_id: false,
      perks_json: ['Akses Depan Panggung'],
      is_active: true,
      sort_order: 99,
    }),
  });
  const newTierJson = await newTierRes.json();
  assert(newTierRes.status === 201 && newTierJson.tier?.id, 'Admin creates dynamic Ticket Tier');

  const catAfterTierCreate = await (await fetch(`${BASE}/api/catalog`)).json();
  assert(
    catAfterTierCreate.ticketTiers.some((t: any) => t.id === newTierJson.tier.id),
    'Newly created active Ticket Tier immediately visible on public /api/catalog'
  );

  const deactivateTierRes = await fetch(`${BASE}/api/admin/ticket-tiers/${newTierJson.tier.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ is_active: false, price: 185000 }),
  });
  const deactivateTierJson = await deactivateTierRes.json();
  assert(deactivateTierRes.status === 200 && deactivateTierJson.tier.is_active === false, 'Admin deactivates & edits Ticket Tier');

  const catAfterTierDeactivate = await (await fetch(`${BASE}/api/catalog`)).json();
  assert(
    !catAfterTierDeactivate.ticketTiers.some((t: any) => t.id === newTierJson.tier.id),
    'Deactivated Ticket Tier hidden from public /api/catalog'
  );

  const delTierRes = await fetch(`${BASE}/api/admin/ticket-tiers/${newTierJson.tier.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert(delTierRes.status === 200, 'Admin cleans up temporary Ticket Tier');

  // 6d. Dynamic Merch Product CRUD + Active/Inactive Public Visibility
  const newMerchRes = await fetch(`${BASE}/api/admin/merch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'E2E Pin Enamel Aversa',
      category: 'AKSESORIS',
      short_spec: 'Logam Kuningan Gold',
      full_description: 'Pin edisi uji coba CMS merch',
      material_spec: 'Alloy berlapis emas matte',
      price: 29000,
      stock_total: 40,
      weight_grams: 50,
      image_url: '/assets/png/logo-symbol-color.png',
      variants_json: ['Gold Edition'],
      is_active: true,
      sort_order: 99,
    }),
  });
  const newMerchJson = await newMerchRes.json();
  assert(newMerchRes.status === 201 && newMerchJson.merch?.id, 'Admin creates dynamic Merch Product');

  const disableMerchRes = await fetch(`${BASE}/api/admin/merch/${newMerchJson.merch.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ is_active: false }),
  });
  assert(disableMerchRes.status === 200, 'Admin deactivates Merch Product');

  const catAfterMerchDisable = await (await fetch(`${BASE}/api/catalog`)).json();
  assert(
    !catAfterMerchDisable.merchProducts.some((m: any) => m.id === newMerchJson.merch.id),
    'Deactivated Merch Product hidden from public /api/catalog'
  );

  const delMerchRes = await fetch(`${BASE}/api/admin/merch/${newMerchJson.merch.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert(delMerchRes.status === 200, 'Admin cleans up temporary Merch Product');

  // 6e. Dynamic Timeline & Shipping Zone CRUD
  const newZoneRes = await fetch(`${BASE}/api/admin/shipping-zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      mode: 'LOCAL_COURIER',
      zone_name: 'Zona Uji CMS Kemlagi',
      description: 'Pengantaran uji coba CMS',
      base_cost: 9000,
      cost_per_kg: 2000,
      estimated_days: '1 hari',
      is_active: false,
      sort_order: 99,
    }),
  });
  const newZoneJson = await newZoneRes.json();
  assert(newZoneRes.status === 201 && newZoneJson.zone?.id, 'Admin creates Shipping Zone');
  await fetch(`${BASE}/api/admin/shipping-zones/${newZoneJson.zone.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });

  const newEvtRes = await fetch(`${BASE}/api/admin/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      title: 'E2E Gladi Bersih Panggung',
      subtitle: 'Persiapan Sound System',
      date_label: '16 Desember 2026',
      category: 'PUNCAK ACARA',
      venue: 'Lapangan Utama',
      description: 'Agenda uji coba CMS timeline',
      badge_text: 'Uji CMS',
      cta_label: 'Lihat Detail',
      cta_target: 'timeline',
      sort_order: 99,
      is_active: false,
    }),
  });
  const newEvtJson = await newEvtRes.json();
  assert(newEvtRes.status === 201 && newEvtJson.event?.id, 'Admin creates Timeline Event');
  await fetch(`${BASE}/api/admin/timeline/${newEvtJson.event.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });

  // 6f. Dynamic Site Settings CMS & Restore
  const origHighlight = overviewJson.siteSettings?.heroTitleHighlight || 'Kemuliaan Prestasi, Api Integritas';
  const tempHighlight = 'Cahaya Prestasi 44 Tahun Gedeg';
  const patchSettingsRes = await fetch(`${BASE}/api/admin/site-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ heroTitleHighlight: tempHighlight }),
  });
  assert(patchSettingsRes.status === 200, 'Admin updates site_settings CMS configuration');

  const catAfterSettings = await (await fetch(`${BASE}/api/catalog`)).json();
  assert(
    catAfterSettings.eventMeta.heroTitleHighlight === tempHighlight,
    'Public /api/catalog dynamically reflects edited heroTitleHighlight from site_settings'
  );

  // Restore original heroTitleHighlight and deactivate temporary E2E tier if created
  await fetch(`${BASE}/api/admin/site-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ heroTitleHighlight: origHighlight }),
  });

  if (tempTierId) {
    await fetch(`${BASE}/api/admin/ticket-tiers/${tempTierId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
  }

  // 7. Media Crew RBAC, Media Overview & OBS Live Overlay Token Security
  const mediaLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'media', password: 'Media44!' }),
  });
  const mediaCookie = mediaLogin.headers.get('set-cookie')?.split(';')[0] || '';
  assert(mediaLogin.status === 200 && mediaCookie.includes('aversa44_staff_session'), 'Media crew logged in cleanly');

  const mediaBlockedOverview = await fetch(`${BASE}/api/admin/overview`, { headers: { Cookie: mediaCookie } });
  assert(mediaBlockedOverview.status === 403, 'MEDIA role blocked with HTTP 403 on financial GET /api/admin/overview');

  const mediaOverviewRes = await fetch(`${BASE}/api/admin/media-overview`, { headers: { Cookie: mediaCookie } });
  const mediaOverviewJson = await mediaOverviewRes.json();
  assert(
    mediaOverviewRes.status === 200 && mediaOverviewJson.success && Array.isArray(mediaOverviewJson.obsOverlays),
    'MEDIA role accesses /api/admin/media-overview cleanly'
  );

  const defaultOv = mediaOverviewJson.obsOverlays[0];
  assert(Boolean(defaultOv?.slug && defaultOv?.access_token), 'Default OBS overlay seeded with access token');

  const badObsState = await fetch(`${BASE}/api/obs/state?overlay=${defaultOv.slug}&token=invalid_token_000`);
  assert(badObsState.status === 403, 'OBS state endpoint rejects forged token with HTTP 403');

  const goodObsState = await fetch(
    `${BASE}/api/obs/state?overlay=${encodeURIComponent(defaultOv.slug)}&token=${encodeURIComponent(defaultOv.access_token)}`
  );
  const goodObsJson = await goodObsState.json();
  assert(goodObsState.status === 200 && goodObsJson.overlay?.slug === defaultOv.slug, 'OBS state endpoint returns live overlay state for valid token');

  const tmpOvRes = await fetch(`${BASE}/api/admin/obs-overlays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: mediaCookie },
    body: JSON.stringify({ name: 'E2E Test Camera Feed' }),
  });
  const tmpOvJson = await tmpOvRes.json();
  assert(tmpOvRes.status === 201 && tmpOvJson.overlay?.id, 'MEDIA role creates OBS overlay channel');
  await fetch(`${BASE}/api/admin/obs-overlays/${tmpOvJson.overlay.id}`, {
    method: 'DELETE',
    headers: { Cookie: mediaCookie },
  });

  // 8. Branded Error Pages (403, 404, 500, 502, 503, 505) & Brute-Force Throttle
  for (const errCode of [403, 404, 500, 502, 503, 505]) {
    const errRes = await fetch(`${BASE}/error/${errCode}`);
    const errHtml = await errRes.text();
    assert(errRes.status === errCode && errHtml.includes(`AVERSA 44`) && errHtml.includes(String(errCode)), `Branded error page /error/${errCode} returns HTTP ${errCode}`);
  }
  const unknownPageRes = await fetch(`${BASE}/halaman-tidak-ada-404`);
  assert(unknownPageRes.status === 404, 'Unknown browser route returns HTTP 404 branded error page');

  let throttledStatus = 0;
  for (let i = 0; i < 11; i++) {
    const failRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'e2e_bruteforce_probe', password: 'wrong' }),
    });
    throttledStatus = failRes.status;
  }
  assert(throttledStatus === 429, 'Login brute-force protection throttles repeated failures with HTTP 429');

  // 9. Static-to-Dynamic QRIS Fallback, Proof Upload & WA Admin Approval
  const sampleStatic = '00020101021138590014ID.CO.QRIS.WWW0215ID10200845344330303UMI51440014ID.CO.QRIS.WWW0215ID10200845344330303UMI5204581253033605802ID5920Resto Ayam Bakar Cbk6009Mojokerto610561300630448B5';
  const origFallback = {
    fallbackQrisStaticPayload: overviewJson.siteSettings?.fallbackQrisStaticPayload || '',
    fallbackQrisForce: Boolean(overviewJson.siteSettings?.fallbackQrisForce),
    adminPaymentWhatsapp: overviewJson.siteSettings?.adminPaymentWhatsapp || '',
  };
  const cfgFallbackRes = await fetch(`${BASE}/api/admin/site-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      fallbackQrisStaticPayload: sampleStatic,
      fallbackQrisForce: true,
      adminPaymentWhatsapp: '6285611112222',
    }),
  });
  assert(cfgFallbackRes.status === 200, 'Admin configures Static QRIS Fallback & Admin WhatsApp');

  const fbOrderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Uji Fallback QRIS',
      customerPhone: '085633334444',
      customerType: 'UMUM',
      fulfillmentMode: 'PICKUP_BOOTH',
      paymentMethod: 'QBIZ_QRIS',
      items: [{ itemType: 'MERCH', id: catalog.merchProducts[0].id, variantLabel: 'Jet Black • M', quantity: 1 }],
    }),
  });
  const fbOrderJson = await fbOrderRes.json();
  const fbOrderCookie = fbOrderRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert(
    fbOrderRes.status === 201 && fbOrderJson.order?.qbiz_mode === 'STATIC_DYNAMIC_FALLBACK' && fbOrderJson.order?.qbiz_qris_payload?.includes('010212'),
    'Fallback order generates Dynamic QRIS (Tag 01=12) from Static QRIS'
  );

  // Upload a tiny valid 1x1 PNG proof (stored to S3 if configured, or local fallback)
  const tinyPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
  const proofForm = new FormData();
  proofForm.append('proofFile', new Blob([tinyPng], { type: 'image/png' }), 'bukti-e2e.png');
  proofForm.append('note', 'BCA a.n. E2E Tester');
  const proofUploadRes = await fetch(`${BASE}/api/orders/${fbOrderJson.order.order_code}/upload-proof`, {
    method: 'POST',
    headers: { Cookie: fbOrderCookie },
    body: proofForm,
  });
  const proofUploadJson = await proofUploadRes.json();
  assert(
    proofUploadRes.status === 200 && Boolean(proofUploadJson.order?.payment_proof_url),
    `Transfer proof uploaded cleanly (${proofUploadJson.order?.payment_proof_url})`
  );

  // Restore original fallback settings
  await fetch(`${BASE}/api/admin/site-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify(origFallback),
  });

  console.log('--- ALL E2E TESTS PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
