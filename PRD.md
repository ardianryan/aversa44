# PRD.md - AVERSA 44 (Dies Natalis ke-44 SMA Negeri 1 Gedeg)

## 1. Product Vision & Scope
**AVERSA 44** is the official digital festival platform for Dies Natalis ke-44 SMA Negeri 1 Gedeg, Kabupaten Mojokerto.
It unifies:
1. **Public Festival Portal** (3D Stage experience, E-Ticketing, Official Merchandise, and Digital Ticket Wallet).
2. **Staff & Operations Backoffice (`/office`)** (Ticketing CMS, Merch & Shipping Operations, Gate/Booth QR Scanner, POS & Sponsorship, and Site Content Management).
3. **Media Studio & Live Streaming Kit (`/office/media-studio`, `/office/live-kit`, `/obs`)** so the media committee can generate brand-consistent Canva-grade social graphics/videos and drive transparent OBS Browser Source overlays without manual per-item editing.

---

## 2. Target Personas & RBAC Matrix (`staff_users`)
| Role | Default / Example Scope | Allowed `/office/*` Modules | Restrictions |
| :--- | :--- | :--- | :--- |
| **Pengunjung / Siswa / Alumni** | Public web (`/`..`/dompet-tiket`) | None (Public routes only) | Zero access to `/office` or `/api/admin/*`; `/office` links hidden from public UI |
| **`ADMIN`** | Ketua / Inti Panitia | All modules: `ringkasan`, `scanner`, `pesanan`, `tiket`, `merch`, `pengiriman`, `panggung`, `timeline`, `anatomi`, `media-studio`, `logo-media`, `live-kit`, `sponsorship`, `panitia` | Full CRUD & staff management |
| **`CASHIER`** | Kasir & Sponsorship Booth | `ringkasan`, `scanner`, `pesanan`, `sponsorship` | Cannot edit system anatomy, stage CMS, or staff accounts |
| **`SCANNER`** | Petugas Gate / Check-in | `scanner` | Gate & booth verification only |
| **`MEDIA`** | Tim Pubdok & Live Broadcast | `media-studio`, `logo-media`, `live-kit` | Receives `HTTP 403` on `/api/admin/overview` and financial/ticket CRUD |

---

## 3. Information Architecture & Refresh-Safe Routing
Every view MUST preserve its state across browser reload via URL pathname slugs:

### Public Routes
- `/` -> **Panggung Utama (`stage`)**: Hero 3D visual, festival timeline, event anatomy, sponsor showcase, and smart navigation.
- `/tiket` -> **E-Ticket (`tickets`)**: Active ticket tiers (`Pass Internal`, `Presale`, `VIP`, etc.) with live interactive Golden Ticket preview and smart empty state when `tickets.length === 0`.
- `/merch` -> **Official Merch (`merch`)**: Merchandise catalog with size/variant selection, delivery options, and smart empty state when `merch.length === 0`.
- `/dompet-tiket` -> **Dompet Tiketku (`wallet`)**: Order lookup & cryptographic E-Ticket QR wallet for gate entry and merch pickup.
- `/obs` -> **OBS Transparent Browser Source**: `/obs?overlay=<slug>&token=<token>` driven by Server-Sent Events (SSE) for real-time lower-thirds, scoreboard/stage status, and broadcast overlays.

### Staff Office Routes (`/office/<slug>`)
Grouped in a collapsible sidebar across 5 operational groups:
1. **Operasional**: `ringkasan`, `scanner`, `pesanan`
2. **Katalog & Logistik**: `tiket`, `merch`, `pengiriman`
3. **Konten Situs**: `panggung`, `timeline`, `anatomi`
4. **Media & Siaran**: `media-studio`, `logo-media`, `live-kit`
5. **Kemitraan & Akses**: `sponsorship`, `panitia`

---

## 4. Functional Requirements

### FR-01: Public 3D Stage & Festival Showcase (`/`)
- Interactive Three.js / parallax festival hero styled strictly in Royal Plum (`#1A021D`, `#360538`) and Royal Gold (`#F5C538`, `#F7D160`).
- Use the transparent school crest and approved AVERSA identity; do not display the provincial logo.
- Public footer displays official school channels, address, and public quick-links ONLY (zero `/office` link or internal technical stack jargon).

### FR-02: Smart E-Ticketing & Merchandise Catalog (`/tiket`, `/merch`)
- Live catalog synced with PostgreSQL (`aversa44_db`).
- **Smart Empty States**: If active ticket tiers = `0` or active merch items = `0`, hide checkout triggers/buttons for that empty category and show a clear, polished notice ("Belum ada penjualan tiket/merch untuk saat ini").
- Variants, stock checks, and unique payment codes are verified server-side.

### FR-03: Checkout & Hybrid Payment Flow (`CheckoutModal` on `ResponsiveSheet`)
- Checkout opens inside `ResponsiveSheet` (Bottom Sheet on mobile `375px`, Right Drawer on desktop `>= 768px`), never a centered form popup.
- Supports dynamic QBiz QRIS (with unique nominal code), booth cash verification, bank transfer, and gateway/VA flows.
- Server validates prices, stock, and order totals via Zod schemas before issuing orders.

### FR-04: Cryptographic Ticket Wallet & Atomic Gate Scanner (`/dompet-tiket`, `/office/scanner`)
- Paid orders issue signed cryptographic QR tokens (`src/server/crypto-ticket.ts`) verified using `crypto.timingSafeEqual`.
- Gate check-in executes atomically in PostgreSQL to prevent double-entry race conditions.

### FR-05: Collapsible Sidebar Office CMS (`/office/*`)
- Smooth sidebar expand/collapse and responsive mobile drawer navigation.
- Every create/edit form inside `/office/*` opens in `ResponsiveSheet`.
- Every destructive or irreversible confirmation uses `ConfirmModal`.

### FR-06: Media Studio (`/office/media-studio`)
- Built directly around `referensi desain/` Canva visual standards and synced graphic assets.
- Supports multi-ratio canvas presets: `4:5` (IG Feed), `1:1` (Square), `9:16` (Story/Reels), and `16:9` (YouTube/Banner).
- Exports crisp `PNG` images and animated `MP4` clips with optional sound effects directly from the browser for the Media team (`ADMIN` and `MEDIA` roles). Music is added later on the social platform.

### FR-07: OBS Live Streaming Kit (`/office/live-kit` & `/obs`)
- Controller UI in `/office/live-kit` manages live broadcast scenes, lower-thirds, announcements, and overlay toggles.
- Real-time updates push over SSE to `/obs?overlay=<slug>&token=<token>`, rendering a zero-background transparent layer ready for OBS Studio Browser Source.
- Protected by per-stream token verification (`crypto.timingSafeEqual`).

---

## 5. Non-Functional Requirements
- **Visual Consistency**: 100% adherence to `DESIGN.md` & `AGENTS.md` Royal Plum & Gold palette; zero generic Tailwind `slate`/`gray`/`indigo` UI drift.
- **Accessibility**: WCAG AAA/AA text contrast (`>= 4.5:1` normal, `>= 3.0:1` large), `44px x 44px` minimum touch targets, `focus-visible` gold outlines, and full `prefers-reduced-motion` support.
- **Responsiveness**: Zero horizontal overflow at `375px` mobile and `1440px` desktop viewports; themed custom scrollbars (`#140117` track, `#E09D17`/`#F5C538` thumb).
- **SEO & Metadata**: Complete Open Graph metadata, JSON-LD Festival schema, and multi-format AVERSA 44 favicons (`?v=44`) in `index.html`.
- **Code Hygiene**: Zero em dashes (`—`) in `src/` and `index.html`, zero `password_hash` leaks in API payloads.

---

## 6. Acceptance Criteria & Definition of Done
A feature or fix is **DONE** only when:
1. `! grep -rn "—" src/ index.html` exits `0`.
2. `npx tsc -p tsconfig.json --noEmit` exits `0`.
3. `npm run build` exits `0`.
4. `npx tsx scripts/verify-e2e.ts` passes all E2E assertions (`62/62 PASS` or current full suite).
5. Visual QA at `1440x900` and `375x812` confirms `0` console errors, `0` failed network requests, smooth sheet/drawer transitions, and faithful `DESIGN.md` color compliance.

### Pengelolaan logo media dan frame siaran penuh
- `/office/logo-media` berada di grup Tim Media & Siaran, tersedia bagi ADMIN dan MEDIA. Sponsor dan satu Official Media Partner dikelola di sini, terpisah dari kontrol broadcast.
- Urutan sponsor dapat diedit; tiga sponsor aktif pertama mendapat ukuran terbesar pada publikasi dan OBS.
- Preset OBS `full_frame` menempatkan logo sekolah, lambang Dies Natalis ke-44, dan wordmark AVERSA di kiri atas; Official Media Partner di kanan atas; sponsor di bawah. Area video tengah transparan dan seluruh logo berada dalam margin aman.
