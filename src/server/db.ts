import crypto from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword, signQrPayload } from './crypto-ticket.ts';
import { buildEmvQrisPayload } from './sdk/qbiz.ts';

const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = Number(process.env.PGPORT || 5432);
const PGUSER = process.env.PGUSER || 'ardianryan';
const PGPASSWORD = process.env.PGPASSWORD || '';
const PGDATABASE = process.env.PGDATABASE || 'aversa44_db';

export const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  max: 15,
});

async function ensureDatabaseExists() {
  const adminPool = new Pool({
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    password: PGPASSWORD,
    database: 'postgres',
  });
  try {
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [PGDATABASE]);
    if (res.rowCount === 0) {
      // Safe identifier quoting for fixed config db name
      await adminPool.query(`CREATE DATABASE "${PGDATABASE.replace(/"/g, '')}"`);
      console.log(`[DB] Created PostgreSQL database "${PGDATABASE}".`);
    }
  } finally {
    await adminPool.end();
  }
}

export async function initDatabase() {
  await ensureDatabaseExists();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      role VARCHAR(24) NOT NULL CHECK (role IN ('ADMIN', 'CASHIER', 'SCANNER', 'MEDIA')),
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_otp (
      phone VARCHAR(20) PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      next_request_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    ALTER TABLE wallet_otp ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS wallet_webhook_receipts (
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS event_timeline (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(64) UNIQUE NOT NULL,
      title VARCHAR(180) NOT NULL,
      subtitle VARCHAR(180) NOT NULL,
      date_label VARCHAR(80) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      category VARCHAR(40) NOT NULL,
      venue VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      badge_text VARCHAR(60) NOT NULL,
      cta_label VARCHAR(60) NOT NULL,
      cta_target VARCHAR(60) NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ticket_tiers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      category VARCHAR(32) NOT NULL CHECK (category IN ('INTERNAL', 'EXTERNAL', 'VIP', 'BUNDLING')),
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      original_price INTEGER,
      quota_total INTEGER NOT NULL,
      quota_sold INTEGER NOT NULL DEFAULT 0,
      requires_student_id BOOLEAN DEFAULT FALSE,
      included_merch_info TEXT,
      perks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS merch_products (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(180) NOT NULL,
      category VARCHAR(40) NOT NULL,
      short_spec VARCHAR(200) NOT NULL,
      full_description TEXT NOT NULL,
      material_spec TEXT NOT NULL,
      price INTEGER NOT NULL,
      stock_total INTEGER NOT NULL,
      weight_grams INTEGER NOT NULL DEFAULT 250,
      image_url TEXT NOT NULL,
      variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shipping_zones (
      id SERIAL PRIMARY KEY,
      code VARCHAR(64) UNIQUE NOT NULL,
      mode VARCHAR(32) NOT NULL CHECK (mode IN ('PICKUP_BOOTH', 'LOCAL_COURIER', 'REGULER_EXPEDITION')),
      zone_name VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      base_cost INTEGER NOT NULL DEFAULT 0,
      cost_per_kg INTEGER NOT NULL DEFAULT 0,
      estimated_days VARCHAR(64) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code VARCHAR(48) UNIQUE NOT NULL,
      customer_name VARCHAR(150) NOT NULL,
      customer_email VARCHAR(150),
      customer_phone VARCHAR(40) NOT NULL,
      customer_type VARCHAR(32) NOT NULL DEFAULT 'UMUM',
      identity_number VARCHAR(64),
      kelas_angkatan VARCHAR(64),
      order_type VARCHAR(32) NOT NULL CHECK (order_type IN ('TICKET_ONLY', 'MERCH_ONLY', 'MIXED')),
      fulfillment_mode VARCHAR(32) NOT NULL CHECK (fulfillment_mode IN ('PICKUP_BOOTH', 'LOCAL_COURIER', 'REGULER_EXPEDITION')),
      shipping_zone_id INTEGER REFERENCES shipping_zones(id),
      shipping_address TEXT,
      shipping_notes TEXT,
      tracking_number VARCHAR(100),
      fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'UNFULFILLED',
      pickup_qr_token TEXT,
      pickup_verified_at TIMESTAMPTZ,
      pickup_verified_by VARCHAR(120),
      subtotal_amount INTEGER NOT NULL,
      shipping_amount INTEGER NOT NULL DEFAULT 0,
      unique_code INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('QBIZ_QRIS', 'XENDIT', 'CASH_BOOTH', 'MANUAL_TRANSFER')),
      payment_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED', 'REJECTED')),
      qbiz_invoice_id VARCHAR(120),
      qbiz_qris_payload TEXT,
      qbiz_checkout_url TEXT,
      qbiz_mode VARCHAR(32),
      payment_proof_note TEXT,
      payment_proof_url TEXT,
      paid_at TIMESTAMPTZ,
      verified_by VARCHAR(120),
      expired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_type VARCHAR(16) NOT NULL CHECK (item_type IN ('TICKET', 'MERCH')),
      ticket_tier_id INTEGER REFERENCES ticket_tiers(id),
      merch_product_id INTEGER REFERENCES merch_products(id),
      item_name VARCHAR(200) NOT NULL,
      variant_label VARCHAR(120),
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issued_tickets (
      id SERIAL PRIMARY KEY,
      ticket_code VARCHAR(48) UNIQUE NOT NULL,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      ticket_tier_id INTEGER NOT NULL REFERENCES ticket_tiers(id),
      tier_name VARCHAR(160) NOT NULL,
      tier_category VARCHAR(32) NOT NULL,
      holder_name VARCHAR(150) NOT NULL,
      holder_phone VARCHAR(40) NOT NULL,
      holder_identity VARCHAR(64),
      seat_zone VARCHAR(80) NOT NULL,
      qr_payload TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'USED', 'REVOKED')),
      checked_in_at TIMESTAMPTZ,
      checked_in_by VARCHAR(120),
      gate_name VARCHAR(80),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scan_audit_logs (
      id SERIAL PRIMARY KEY,
      scan_type VARCHAR(24) NOT NULL CHECK (scan_type IN ('TICKET_CHECKIN', 'MERCH_PICKUP')),
      reference_code VARCHAR(120) NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      scanner_user_id INTEGER REFERENCES staff_users(id),
      scanner_name VARCHAR(120) NOT NULL,
      gate_location VARCHAR(80) NOT NULL,
      scan_result VARCHAR(32) NOT NULL,
      detail_note TEXT,
      scanned_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(64) PRIMARY KEY,
      value_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsorship_inquiries (
      id SERIAL PRIMARY KEY,
      company_name VARCHAR(180) NOT NULL,
      contact_person VARCHAR(150) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      email VARCHAR(150),
      tier_interest VARCHAR(64) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'NEW',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS obs_overlays (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      access_token VARCHAR(120) NOT NULL,
      layout_preset VARCHAR(32) NOT NULL DEFAULT 'lower_third',
      theme_mode VARCHAR(16) NOT NULL DEFAULT 'dark',
      transition_preset VARCHAR(32) NOT NULL DEFAULT 'broadcast_wipe',
      lower_third_title VARCHAR(160) NOT NULL DEFAULT 'Dies Natalis ke-44 SMAN 1 Gedeg',
      lower_third_subtitle VARCHAR(200) NOT NULL DEFAULT 'AVERSA • Action, Compassion, Celebration',
      corner_bug_text VARCHAR(80) NOT NULL DEFAULT 'LIVE • AVERSA 44',
      show_countdown BOOLEAN DEFAULT TRUE,
      show_sponsors BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS media_sponsors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      tier VARCHAR(32) NOT NULL DEFAULT 'GOLD',
      logo_url TEXT NOT NULL,
      dark_logo_url TEXT,
      boxed BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 10
    );

    ALTER TABLE event_timeline ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
    ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check CHECK (role IN ('ADMIN', 'CASHIER', 'SCANNER', 'MEDIA'));
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED', 'REJECTED'));
  `);

  await seedInitialData();
}

async function seedInitialData() {
  // 1. Seed Staff Users if empty, and ensure default MEDIA crew account exists
  const staffCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM staff_users');
  if (staffCount.rows[0].cnt === 0 && process.env.NODE_ENV === 'production') {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase() || '';
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
    if (!/^[a-z0-9_.-]{3,40}$/.test(username) || password.length < 12 || password.length > 100) {
      throw new Error('Database panitia kosong. Atur BOOTSTRAP_ADMIN_USERNAME dan BOOTSTRAP_ADMIN_PASSWORD (12-100 karakter) sebelum memulai produksi.');
    }
    await pool.query(
      "INSERT INTO staff_users (username, full_name, role, password_hash) VALUES ($1, $2, 'ADMIN', $3) ON CONFLICT (username) DO NOTHING",
      [username, process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrator AVERSA 44', hashPassword(password)]
    );
  } else if (staffCount.rows[0].cnt === 0) {
    await pool.query(
      `INSERT INTO staff_users (username, full_name, role, password_hash) VALUES
        ($1, $2, 'ADMIN', $3),
        ($4, $5, 'CASHIER', $6),
        ($7, $8, 'SCANNER', $9),
        ($10, $11, 'MEDIA', $12)`,
      [
        'admin',
        'Ryan Ardian (Koordinator Panitia)',
        hashPassword('Aversa44!'),
        'kasir',
        'Bendahara Booth OSIS',
        hashPassword('Kasir44!'),
        'scanner',
        'Petugas Gate Utama & Merch',
        hashPassword('Gate44!'),
        'media',
        'Tim Media & Broadcast AVERSA 44',
        hashPassword('Media44!'),
      ]
    );
  } else if (process.env.NODE_ENV !== 'production') {
    await pool.query(
      `INSERT INTO staff_users (username, full_name, role, password_hash)
       VALUES ($1, $2, 'MEDIA', $3)
       ON CONFLICT (username) DO NOTHING`,
      ['media', 'Tim Media & Broadcast AVERSA 44', hashPassword('Media44!')]
    );
  }

  // Seed default OBS Overlay channel if absent
  const obsCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM obs_overlays');
  if (obsCount.rows[0].cnt === 0) {
    const token = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO obs_overlays (slug, name, access_token, layout_preset, theme_mode, transition_preset)
       VALUES ($1, $2, $3, 'lower_third', 'dark', 'broadcast_wipe')`,
      ['panggung-utama', 'Panggung Utama Broadcast', token]
    );
  }

  // 2. Seed Official Event Timeline (verified from referensi desain/5.svg & 3.svg)
  const timelineCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM event_timeline');
  if (timelineCount.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO event_timeline (slug, title, subtitle, date_label, start_date, end_date, category, venue, description, badge_text, cta_label, cta_target, sort_order) VALUES
      ('pendaftaran-svc', 'Pendaftaran SVC (Smansage Volleyball Competition)', 'Turnamen Bola Voli Pelajar Tingkat SMP/MTs Se-Jawa Timur', '12 - 31 Oktober 2026', '2026-10-12', '2026-10-31', 'KOMPETISI', 'Sekretariat OSIS & Portal Resmi SMAN 1 Gedeg', 'Pendaftaran tim putra dan putri turnamen bola voli bergengsi antar pelajar dalam rangka menyemarakkan Dies Natalis ke-44 SMA Negeri 1 Gedeg.', 'Pendaftaran', 'Lihat Info Lomba', 'timeline', 1),
      ('pelaksanaan-svc', 'Pelaksanaan SVC (Smansage Volleyball Competition)', 'Babak Penyisihan Hingga Grand Final Piala Bergilir', '27 - 29 November 2026', '2026-11-27', '2026-11-29', 'KOMPETISI', 'GOR & Lapangan Voli SMA Negeri 1 Gedeg', 'Tiga hari pertandingan sengit antar sekolah unggulan dengan dukungan suporter kreatif, bazar kuliner, dan penampilan maskot SVC.', 'Kompetisi', 'Pesan Merch SVC', 'merch', 2),
      ('baksos-sco-ctf', 'Bakti Sosial Donor Darah & SCO-CTF', 'Aksi Kemanusiaan PMI & Smansage Cybersecurity Competition', '1 - 16 Desember 2026', '2026-12-01', '2026-12-16', 'SOSIAL & SAINS', 'Aula Graha & Lab Komputer SMAN 1 Gedeg', 'Sinergi kepedulian sosial melalui donor darah sukarela bersama PMI Mojokerto sekaligus kompetisi keamanan siber SCO-CTF bagi talenta digital muda.', 'Sosial & IT', 'Gabung Kontribusi', 'sponsorship', 3),
      ('puncak-aversa-44', 'Puncak Aversa 44 SMA Negeri 1 Gedeg', 'Malam Inagurasi & Konser Akbar: Niken Salindry & Kembange Jagad', '17 Desember 2026', '2026-12-17', '2026-12-17', 'PUNCAK ACARA', 'Lapangan Utama & Panggung Teater SMAN 1 Gedeg', 'Puncak perayaan 44 tahun SMA Negeri 1 Gedeg (1982 - 2026) menghadirkan panggung teatrikal AVERSA bersama bintang tamu spesial Niken Salindry & Kembange Jagad.', 'Puncak Acara', 'Ambil E-Ticket', 'tickets', 4)
    `);
  }

  // 3. Seed 4 Default Ticket Tiers (Dynamic & Editable by Admin)
  const tierCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM ticket_tiers');
  if (tierCount.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO ticket_tiers (code, name, category, description, price, original_price, quota_total, quota_sold, requires_student_id, included_merch_info, perks_json, sort_order) VALUES
      ('TKT-INT-CIVITAS', 'Pass Internal Civitas SMAN 1 Gedeg', 'INTERNAL', 'Tiket khusus siswa aktif, guru, dan tenaga kependidikan SMA Negeri 1 Gedeg. Wajib mencantumkan NISN/NIP saat pemesanan.', 35000, 45000, 850, 0, TRUE, NULL, '["Akses penuh Puncak Aversa 17 Desember 2026", "Area Festival Civitas", "QR Code Check-In terenkripsi"]', 1),
      ('TKT-EXT-PRESALE', 'Presale Alumni & Umum (Festival Pass)', 'EXTERNAL', 'Terbuka untuk alumni lintas angkatan (1982 - 2025) dan masyarakat umum menikmati konser Niken Salindry & Kembange Jagad.', 55000, 75000, 500, 0, FALSE, NULL, '["Akses Panggung Utama Puncak Aversa 44", "Akses area Bazar Kuliner & Photobooth", "QR Gate Instan siap scan"]', 2),
      ('TKT-VIP-GOLDEN', 'The Golden Ticket VIP Pass', 'VIP', 'Tiket kehormatan bernuansa Golden Ticket Gala dengan posisi pandang terdepan, jalur fast-track, dan cinderamata eksklusif.', 150000, NULL, 100, 0, FALSE, 'Pin Enamel 24K + Lanyard Satin VIP', '["Area duduk VIP tepat di depan panggung utama", "Jalur masuk Fast-Track tanpa antre", "Gratis Pin Enamel Sepuh Emas 24K & Lanyard VIP", "Welcome snack bertema Aversa"]', 3),
      ('TKT-BND-AVERSA', 'Paket Bundling Golden Stage + Official Merch', 'BUNDLING', 'Paket hemat tiket masuk Puncak Aversa 44 ditambah Official T-Shirt Cotton Combed 30s & Tote Bag Kanvas Edisi V6.', 165000, 195000, 200, 0, FALSE, '1 T-Shirt Resmi Aversa 44 + 1 Tote Bag Kanvas 14oz', '["1 E-Ticket Puncak Aversa 44 (17 Des 2026)", "1 T-Shirt Resmi Cotton Combed 30s Sablon Emas", "1 Tote Bag Kanvas Organik 14oz", "Hemat Rp 30.000 dibanding beli terpisah"]', 4)
    `);
  }

  // 4. Seed 6 Official Merchandise Products (verified from BRAND_GUIDELINES.md)
  const merchCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM merch_products');
  if (merchCount.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO merch_products (slug, name, category, short_spec, full_description, material_spec, price, stock_total, weight_grams, image_url, variants_json, sort_order) VALUES
      ('polo-panitia-aversa', 'Kaos Berkerah Polo Resmi Aversa 44', 'APPAREL', 'Lacoste Cotton Pique 24s • Bordir Emas 10.000 Stitches', 'Polo shirt resmi Dies Natalis ke-44 SMAN 1 Gedeg dengan bordir komputer presisi benang rayon emas metalik di dada kiri (65 mm) dan bordir SMAN 1 Gedeg di lengan kanan.', 'Lacoste Cotton Pique 24s, Bordir Komputer Rayon Emas 10.000 tusukan', 115000, 180, 300, '/assets/mockups/mockup_kaos_polo.jpg', '["Jet Black • S", "Jet Black • M", "Jet Black • L", "Jet Black • XL", "Jet Black • XXL", "Obsidian Mahogany • M", "Obsidian Mahogany • L", "Obsidian Mahogany • XL", "Broken White • M", "Broken White • L"]', 1),
      ('tshirt-aversa-44', 'T-Shirt Festival Aversa 44', 'APPAREL', 'Cotton Combed 30s Reaktif • Sablon Plastisol Emas', 'Kaos peserta edisi kolektor dengan sablon plastisol emas metalik di depan serta tajuk kemuliaan prestasi di bagian punggung.', 'Cotton Combed 30s Reaktif Jet Black, Sablon Plastisol Emas Metalik', 85000, 300, 220, '/assets/mockups/mockup_kaos_polo.jpg', '["Jet Black • S", "Jet Black • M", "Jet Black • L", "Jet Black • XL", "Jet Black • XXL", "Obsidian Mahogany • L", "Obsidian Mahogany • XL"]', 2),
      ('tumbler-termal-gold', 'Tumbler Termal Stainless Steel 304 (500 ml)', 'DRINKWARE', 'Double-Wall Vacuum • Grafir Laser / UV Gold Foil', 'Botol minum termal menjaga suhu dingin/panas hingga 12 jam dengan finishing matte powder coated dan grafir lambang Rajawali 44 setinggi 80 mm.', 'Stainless Steel 304 Food Grade 500ml, Matte Powder Coated', 95000, 150, 380, '/assets/mockups/mockup_tumbler.jpg', '["Matte Black (Grafir Emas)", "Midnight Plum (UV Foil Gold)"]', 3),
      ('lanyard-idcard-set', 'Lanyard Satin & ID Card PVC Aversa 44', 'ACCESSORY', 'Pita Satin 20mm Sublimasi + Kartu PVC ISO CR-80', 'Set tali lanyard satin polyester dua sisi warna Midnight Plum bertuliskan emas lengkap dengan kait putar nikel dan kartu PVC tebal 0,8 mm.', 'Satin Polyester 20mm x 90cm, Metal Oval Hook, PVC 0,8mm Matte', 35000, 400, 90, '/assets/mockups/mockup_lanyard_idcard.jpg', '["Midnight Plum • Kait Nikel"]', 4),
      ('totebag-kanvas-14oz', 'Tote Bag Kanvas Organik 14 oz', 'ACCESSORY', 'Dimensi 38 x 42 cm • Sablon Foil Emas Lebar 20 cm', 'Tas jinjing kanvas tebal premium berjahitan kuat dengan cetak lambang AVERSA 44 berukuran 20 cm di sisi depan.', 'Kanvas Katun Organik 14 oz (38 x 42 cm, tali 60 cm)', 55000, 220, 260, '/assets/mockups/mockup_totebag_pin.jpg', '["Natural Broken White", "Obsidian Black"]', 5),
      ('pin-enamel-24k', 'Lencana Pin Enamel Sepuh Emas 24K', 'COLLECTIBLE', 'Zinc Alloy Die-Struck 30mm • Epoxy Dome', 'Lencana kehormatan eksklusif berbahan logam sepuh emas 24 karat dengan kubah resin pelindung bening dan pengunci kupu-kupu ganda.', 'Zinc Alloy Die-Struck, 24K Gold Electroplating, Diameter 30mm', 45000, 120, 60, '/assets/mockups/mockup_totebag_pin.jpg', '["24K Gold + Enamel Hitam"]', 6)
    `);
  }

  // 5. Seed 5 Shipping & Booth Pickup Zones
  const zoneCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM shipping_zones');
  if (zoneCount.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO shipping_zones (code, mode, zone_name, description, base_cost, cost_per_kg, estimated_days, sort_order) VALUES
      ('PICKUP_SMANSAGE', 'PICKUP_BOOTH', 'Ambil di Tempat (Booth Panitia SMAN 1 Gedeg)', 'Ambil langsung di Booth Sekretariat OSIS / Gate Merch SMAN 1 Gedeg (Jl. Raya Pendidikan No. 55, Gedeg) dengan menunjukkan QR Pengambilan.', 0, 0, 'Siap diambil saat jam operasional sekolah atau Hari-H', 1),
      ('COURIER_ZONA_1', 'LOCAL_COURIER', 'Antar Lokal Kurir Panitia: Gedeg, Jetis, Kemlagi', 'Diantar langsung oleh kurir panitia OSIS ke rumah/alamat pembeli area Kecamatan Gedeg, Jetis, dan Kemlagi.', 8000, 0, '1 - 2 hari kerja', 2),
      ('COURIER_ZONA_2', 'LOCAL_COURIER', 'Antar Lokal Kurir Panitia: Kota Mojokerto & Sekitar', 'Pengiriman area Kota Mojokerto, Sooko, Puri, Mojoanyar, dan Dawarblandong oleh tim logistik panitia.', 12000, 0, '1 - 2 hari kerja', 3),
      ('EXP_JATIM', 'REGULER_EXPEDITION', 'Ekspedisi Reguler (JNE / J&T): Jawa Timur', 'Pengiriman luar area Mojokerto ke seluruh kabupaten/kota di Provinsi Jawa Timur lengkap dengan nomor resi.', 14000, 14000, '2 - 4 hari kerja', 4),
      ('EXP_NASIONAL', 'REGULER_EXPEDITION', 'Ekspedisi Reguler (JNE / J&T): Luar Jawa Timur', 'Pengiriman ke seluruh Indonesia bagi alumni yang berada di luar Jawa Timur.', 26000, 26000, '3 - 6 hari kerja', 5)
    `);
  }

  // 6. Seed 1 Sample Paid Order (clearly labeled as sample data for testing scanner & wallet immediately)
  const orderCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM orders');
  if (orderCount.rows[0].cnt === 0) {
    const sampleOrderCode = 'AVR44-SAMPLE-001';
    const sampleTicketCode = 'TKT-AVR44-0001';
    const ticketQr = signQrPayload('TKT', sampleTicketCode, sampleOrderCode);
    const pickupQr = signQrPayload('MRC', sampleOrderCode, sampleOrderCode);
    const qrisStr = buildEmvQrisPayload(200321, sampleOrderCode);

    const tierRes = await pool.query('SELECT id, name, category FROM ticket_tiers WHERE code = $1', ['TKT-VIP-GOLDEN']);
    const merchRes = await pool.query('SELECT id, name FROM merch_products WHERE slug = $1', ['totebag-kanvas-14oz']);
    const zoneRes = await pool.query('SELECT id FROM shipping_zones WHERE code = $1', ['PICKUP_SMANSAGE']);

    if (tierRes.rows[0] && merchRes.rows[0] && zoneRes.rows[0]) {
      const ordIns = await pool.query(
        `INSERT INTO orders (
          order_code, customer_name, customer_email, customer_phone, customer_type,
          order_type, fulfillment_mode, shipping_zone_id, shipping_address,
          fulfillment_status, pickup_qr_token, subtotal_amount, shipping_amount,
          unique_code, total_amount, payment_method, payment_status,
          qbiz_invoice_id, qbiz_qris_payload, qbiz_mode, paid_at, verified_by
        ) VALUES (
          $1, $2, $3, $4, 'ALUMNI',
          'MIXED', 'PICKUP_BOOTH', $5, 'Ambil di Booth OSIS SMAN 1 Gedeg',
          'READY_FOR_PICKUP', $6, 205000, 0,
          321, 205321, 'QBIZ_QRIS', 'PAID',
          'inv_sample_aversa44_001', $7, 'QBIZ_LOCAL_COMPAT', NOW(), 'QBIZ_WEBHOOK_DEMO'
        ) RETURNING id`,
        [
          sampleOrderCode,
          '[SAMPLE DATA] Raka Pratama (Alumni 2019)',
          'raka.sample@example.com',
          '081200004400',
          zoneRes.rows[0].id,
          pickupQr,
          qrisStr,
        ]
      );
      const orderId = ordIns.rows[0].id;

      await pool.query(
        `INSERT INTO order_items (order_id, item_type, ticket_tier_id, merch_product_id, item_name, variant_label, unit_price, quantity, subtotal) VALUES
          ($1, 'TICKET', $2, NULL, $3, 'VIP Golden Pass', 150000, 1, 150000),
          ($1, 'MERCH', NULL, $4, $5, 'Natural Broken White', 55000, 1, 55000)`,
        [orderId, tierRes.rows[0].id, tierRes.rows[0].name, merchRes.rows[0].id, merchRes.rows[0].name]
      );

      await pool.query(
        `INSERT INTO issued_tickets (ticket_code, order_id, ticket_tier_id, tier_name, tier_category, holder_name, holder_phone, holder_identity, seat_zone, qr_payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ALUMNI-2019', 'VIP Royal Stage Depan', $8, 'ACTIVE')`,
        [
          sampleTicketCode,
          orderId,
          tierRes.rows[0].id,
          tierRes.rows[0].name,
          tierRes.rows[0].category,
          '[SAMPLE DATA] Raka Pratama',
          '081200004400',
          ticketQr,
        ]
      );

      await pool.query('UPDATE ticket_tiers SET quota_sold = quota_sold + 1 WHERE id = $1', [tierRes.rows[0].id]);
    }
  }

  // Preserve custom CMS copy while updating the previous default to the proposal theme.
  await pool.query(`UPDATE site_settings SET value_json = jsonb_set(value_json, '{heroTitleHighlight}', to_jsonb($1::text)), updated_at = NOW() WHERE key = 'public_config' AND value_json->>'heroTitleHighlight' = $2`, ['Action, Compassion, Celebration', 'Kemuliaan Prestasi, Api Integritas']);

  // 7. Seed Site Settings CMS configuration if absent
  const settingsCheck = await pool.query('SELECT 1 FROM site_settings WHERE key = $1', ['public_config']);
  if (settingsCheck.rowCount === 0) {
    const defaultConfig = {
      school: 'SMA Negeri 1 Gedeg',
      location: 'Kabupaten Mojokerto, Jawa Timur',
      address: 'Jl. Raya Pendidikan No. 55, Gedeg, Kabupaten Mojokerto, Jawa Timur 61351',
      era: '1982 - 2026',
      edition: 'Dies Natalis ke-44',
      themeName: 'AVERSA',
      heroBadgeText: 'SMA Negeri 1 Gedeg • 1982 - 2026',
      heroTitlePrefix: 'Dies Natalis ke-44',
      heroTitleHighlight: 'Action, Compassion, Celebration',
      heroDescription:
        'Perayaan puncak 44 tahun SMA Negeri 1 Gedeg pada 17 Desember 2026 bersama bintang tamu Niken Salindry dan Kembange Jagad. Pesan E-Ticket resmi dan koleksi merchandise eksklusif AVERSA 44 di sini.',
      peakDateIso: '2026-12-17T19:00:00+07:00',
      peakDateLabel: '17 Desember 2026',
      guestStar1Name: 'Niken Salindry',
      guestStar2Name: 'Kembange Jagad',
      guestStarDescription:
        'Malam puncak perayaan Dies Natalis ke-44 SMA Negeri 1 Gedeg menghadirkan perpaduan panggung budaya Jawa, campursari modern, dan tata panggung teatrikal AVERSA bersama Niken Salindry dan ensambel Kembange Jagad.',
      guestStarVenue: 'Lapangan Tengah SMAN 1 Gedeg',
      guestStarAccessNote: 'E-Ticket QR Terenkripsi',
      bankPaymentInfo:
        'Transfer ke Rekening Bendahara Panitia Dies Natalis 44 SMAN 1 Gedeg (Bank Jatim 0123-44-2026 a.n. Panitia AVERSA 44) atau kanal Xendit.',
      sponsorshipHeadline: 'Bermitra Bersama Perayaan 44 Tahun SMAN 1 Gedeg',
      sponsorshipDescription:
        'Kami membuka kesempatan bagi perusahaan, instansi, UMKM, dan alumni untuk menjalin kemitraan sponsorship dan stan bazar pada rangkaian Dies Natalis ke-44 AVERSA.',
      sponsorshipContacts: [
        {
          name: 'Pak Shofy',
          phoneDisplay: '0856-4878-4500',
          whatsapp: '6285648784500',
          role: 'Koordinator Sponsorship & Kemitraan',
        },
        {
          name: 'Bu Whenna',
          phoneDisplay: '0856-3310-519',
          whatsapp: '628563310519',
          role: 'Humas & Sponsorship SMA Negeri 1 Gedeg',
        },
      ],
      socials: {
        website: 'https://www.sman1gedeg.sch.id',
        instagram: '@smansagemoker',
        tiktok: '@sman1gedeg',
        facebook: 'SMA Negeri 1 Gedeg',
        humas: 'Humas SMAN 1 Gedeg',
      },
      anatomyItems: [
        {
          id: 'all',
          label: 'Diagram Lengkap',
          title: 'Anatomi Keseluruhan Lambang AVERSA 44',
          image: '/assets/anatomy/diagram_anatomi_lengkap.png',
          desc: 'Sinergi figur kembar angka 44, siluet kepala rajawali, kobaran lidah api abadi, dan sayap akselerasi aerodinamis dalam harmoni rasio keemasan.',
        },
        {
          id: '44',
          label: '01 • Figur 44',
          title: 'Figur Kembar Angka 44 (Zona Inti)',
          image: '/assets/anatomy/fokus_01_figur_kembar_angka_44.png',
          desc: 'Angka 4 pertama berdiri kokoh sebagai pilar tradisi sejak 1982, sementara angka 4 kedua melesat sebagai simbol inovasi dan persatuan lintas generasi.',
        },
        {
          id: 'eagle',
          label: '02 • Rajawali',
          title: 'Tatapan Burung Rajawali (Visi Intelektual)',
          image: '/assets/anatomy/fokus_02_tatapan_burung_rajawali.png',
          desc: 'Paruh tajam dan mata rajawali menatap ke kanan atas melambangkan ketegasan moral, kejujuran akademik, dan keberanian menatap masa depan.',
        },
        {
          id: 'flame',
          label: '03 • Api Abadi',
          title: 'Kobaran Lidah Api Abadi',
          image: '/assets/anatomy/fokus_03_kobaran_lidah_api_abadi.png',
          desc: 'Tiga sulur api bergradasi tembaga ke merah marun menandakan semangat belajar pantang padam, resiliensi, dan daya juang warga SMAN 1 Gedeg.',
        },
        {
          id: 'wing',
          label: '04 • Sayap 45°',
          title: 'Sayap Melesat Aerodinamis (45 Derajat)',
          image: '/assets/anatomy/fokus_04_sayap_melesat_aerodinamis.png',
          desc: 'Kelengkungan sayap luar menyapu kencang ke sudut kanan atas melambangkan percepatan prestasi sains, seni, dan olahraga.',
        },
        {
          id: 'spine',
          label: '05 • Simetri Emas',
          title: 'Garis Tengah Simetris (Medial Spine)',
          image: '/assets/anatomy/fokus_05_garis_tengah_simetris.png',
          desc: 'Rekonstruksi busur konsentris geometris menghasilkan ilusi faset tiga dimensi yang presisi, seimbang, dan bebas distorsi.',
        },
      ],
      creativeCredits: [
        { role: 'Creative Director, Project Initiator, Lead Vector Reconstructionist & Geometry Engineer', name: 'Ryan Ardian', affiliation: 'Guru SMAN 1 Gedeg' },
        { role: 'Lead Concept Artist & Traditional Sketch Visualizer', name: 'Putri Nur Azizah', affiliation: "Angkatan '42 (XII 6)" },
        { role: 'Custom Lettering Artist & Fluid Typographer', name: 'Naysila Zahra Alsabella', affiliation: "Angkatan '43 (XI 1)" },
        { role: 'Digital Colorists & Visual Rendering Artists', name: 'Culvar Zamiiryaser Setyaji & Farel Indra Febrihansen', affiliation: "Angkatan '42 (XI 4)" },
      ],
    };

    await pool.query(
      'INSERT INTO site_settings (key, value_json) VALUES ($1, $2)',
      ['public_config', JSON.stringify(defaultConfig)]
    );
  } else {
    // One-time cleanup of legacy internal jargon in existing site_settings row
    const curRow = await pool.query('SELECT value_json FROM site_settings WHERE key = $1', ['public_config']);
    const rawStr = JSON.stringify(curRow.rows[0]?.value_json || {});
    if (rawStr.includes('Master V6') || rawStr.includes('Simetri V6') || rawStr.includes('matematis V6')) {
      const cleanedStr = rawStr
        .replace(/edisi Master V6/g, 'eksklusif AVERSA 44')
        .replace(/Anatomi Keseluruhan Master V6/g, 'Anatomi Keseluruhan Lambang AVERSA 44')
        .replace(/05 • Simetri V6/g, '05 • Simetri Emas')
        .replace(/matematis V6/g, 'geometris')
        .replace(/Master V6/g, 'Lambang AVERSA 44');
      await pool.query(
        'UPDATE site_settings SET value_json = $1::jsonb, updated_at = NOW() WHERE key = $2',
        [cleanedStr, 'public_config']
      );
    }
  }

  // Apply the approved proposal once; subsequent CMS edits remain under committee control.
  const proposalMigration = await pool.connect();
  try {
    await proposalMigration.query('BEGIN');
    await proposalMigration.query("SELECT pg_advisory_xact_lock(hashtext('aversa44-proposal-2026'))");
    const applied = await proposalMigration.query("SELECT 1 FROM site_settings WHERE key = 'proposal_2026_aligned'");
    if (!applied.rowCount) {
      const settings = await proposalMigration.query("SELECT value_json FROM site_settings WHERE key = 'public_config' FOR UPDATE");
      const config = settings.rows[0]?.value_json;
      if (config) {
        config.peakDateIso = '2026-12-17T19:00:00+07:00';
        config.guestStarVenue = 'Lapangan Tengah SMAN 1 Gedeg';
        const contacts = Array.isArray(config.sponsorshipContacts) ? config.sponsorshipContacts : [];
        if (!contacts.some((contact: { whatsapp?: string }) => contact.whatsapp === '6285648314532')) {
          contacts.push({ name: 'Pak Candra', phoneDisplay: '0856-4831-4532', whatsapp: '6285648314532', role: 'Humas & Sponsorship SMA Negeri 1 Gedeg' });
        }
        config.sponsorshipContacts = contacts;
        await proposalMigration.query("UPDATE site_settings SET value_json = $1::jsonb, updated_at = NOW() WHERE key = 'public_config'", [JSON.stringify(config)]);
      }
      await proposalMigration.query("UPDATE event_timeline SET is_active = FALSE WHERE slug = 'pendaftaran-svc'");
      await proposalMigration.query(`UPDATE event_timeline SET title = 'Turnamen Voli SMANSAGE Cup', subtitle = 'Kejuaraan Bola Voli SMP/MTs se-Jawa Timur', date_label = '27 - 29 November 2026', start_date = '2026-11-27', end_date = '2026-11-29', venue = 'Lapangan Voli Indoor SMAN 1 Gedeg', description = 'Kejuaraan bola voli tingkat SMP/MTs se-Jawa Timur, pukul 08.00 WIB sampai selesai.', badge_text = 'Olahraga', cta_label = 'Lihat Detail Kegiatan', cta_target = 'timeline', sort_order = 1 WHERE slug = 'pelaksanaan-svc'`);
      await proposalMigration.query(`UPDATE event_timeline SET title = 'Bakti Sosial Donor Darah', subtitle = 'Aksi kepedulian bagi warga sekolah dan masyarakat', date_label = '16 Desember 2026', start_date = '2026-12-16', end_date = '2026-12-16', venue = 'Lab. Bahasa SMAN 1 Gedeg', description = 'Donor darah bagi warga sekolah dan masyarakat, mulai pukul 08.00 WIB sampai selesai.', badge_text = 'Kemanusiaan', cta_label = 'Lihat Detail Kegiatan', cta_target = 'timeline', sort_order = 2 WHERE slug = 'baksos-sco-ctf'`);
      await proposalMigration.query(`UPDATE event_timeline SET title = 'Panggung Hiburan & Pentas Seni', subtitle = 'Niken Salindry & Kembange Jagad', venue = 'Lapangan Tengah SMAN 1 Gedeg', description = 'Pentas seni siswa dan acara puncak pada 17 Desember 2026, pukul 08.00 - 15.00 WIB dan 19.00 WIB sampai selesai.', sort_order = 4 WHERE slug = 'puncak-aversa-44'`);
      await proposalMigration.query(`INSERT INTO event_timeline (slug, title, subtitle, date_label, start_date, end_date, category, venue, description, badge_text, cta_label, cta_target, sort_order, is_active) VALUES ('tasyakuran-44-tumpeng', 'Tasyakuran 44 Tumpeng & Bazar', 'Syukur bersama dan bazar mitra', '17 Desember 2026', '2026-12-17', '2026-12-17', 'SOSIAL & SAINS', 'Lapangan Tengah SMAN 1 Gedeg', 'Tasyakuran 44 tumpeng dan bazar dimulai pukul 08.00 WIB sampai selesai.', 'Syukur & UMKM', 'Lihat Detail Kegiatan', 'timeline', 3, TRUE) ON CONFLICT (slug) DO NOTHING`);
      await proposalMigration.query("INSERT INTO site_settings (key, value_json) VALUES ('proposal_2026_aligned', 'true'::jsonb)");
    }
    await proposalMigration.query("UPDATE obs_overlays SET lower_third_subtitle = 'AVERSA • Action, Compassion, Celebration' WHERE lower_third_subtitle = 'AVERSA • Kemuliaan Prestasi, Api Integritas'");
    await proposalMigration.query('COMMIT');
  } catch (error) {
    await proposalMigration.query('ROLLBACK');
    throw error;
  } finally {
    proposalMigration.release();
  }
}
