# AGENTS.md - AVERSA 44 Strict Engineering & Design Constitution

This document is the binding rulebook for every AI coding agent, subagent, and contributor working in `/Users/ardianryan/Documents/aversa44`.
All changes MUST comply with this file, `PRD.md`, and `DESIGN.md`.

---

## 1. Project Identity & Stack Baseline
- **Event**: AVERSA 44 (Dies Natalis ke-44 SMA Negeri 1 Gedeg, Kabupaten Mojokerto).
- **Runtime**: Hono API + SSR/SPA static host on port `4400` (`src/server/index.ts`), PostgreSQL (`aversa44_db` via `src/server/db.ts`), Vite + React 19 + Tailwind CSS v4 + Three.js (`src/client/`).
- **Primary Reference Directories**:
  - `DESIGN.md` (Visual & token specification)
  - `PRD.md` (Product requirements, user flows, RBAC & acceptance criteria)
  - `referensi desain/` (Official Canva visual references & graphic assets synced into `public/assets/`)

---

## 2. Strict Color & Visual Token Rules (ZERO DEVIATION)
Never invent generic SaaS/AI colors (no Tailwind `slate-*`, `gray-*`, `zinc-*`, `indigo-*`, `violet-*`, `#FFFFFF` stark white backgrounds, or `#000000` flat black cards). Every surface, border, text, and badge MUST use the AVERSA 44 Royal Plum & Gold palette defined in `src/client/index.css` and `DESIGN.md`:

### Approved Surface & Background Hexes
- `#1A021D` : Deep Velvet Stage (Primary page/canvas background)
- `#18021B` : Sidebar & Inset Card Surface
- `#140117` : Deep Plum Scrollbar Track & Recessed Well
- `#0D010F` : Footer Deep Plum Base
- `#250428` / `#26042A` : Elevated Panel / Sheet / Modal Surface
- `#360538` : Midnight Imperial Plum (Primary brand plum gradient/accent)
- `#310603` : Obsidian Mahogany (Active nav pills, crimson-tinted card highlights)

### Approved Gold, Cream & Accent Hexes
- `#F5C538` : Vivid Royal Gold (Primary CTA, active highlights, focus rings)
- `#E09D17` : Marigold Warm Gold (Secondary gold, scrollbar thumb hover, borders)
- `#F7D160` : Champagne Gold (Display titles, metallic headings)
- `#FDF39D` : Pale Canary (Subtle highlight text & specular edge)
- `#FFF5D6` : Vanilla Custard Cream (Primary body text on dark plum)
- `#A0D9CA` : Mint / Teal (Verified/success states, positive status badges)
- `#F5B8CB` : Cotton Candy Pink (Secondary festival accent)
- `#7D1B05` : Deep Crimson (Destructive actions, errors, `ConfirmModal` danger confirm)

### Contrast & Typography Enforcement
- All text pairings MUST pass **WCAG AAA / AA** (`>= 4.5:1` for normal text, `>= 3.0:1` for large headings/UI). Verify new pairings with `python3 ~/.gemini/config/skills/antislop-human/contrast-check.py` if unsure.
- Approved font families (`src/client/index.css`):
  - Display / Royal Headings: `Cinzel`, `Playfair Display`
  - UI & Body Copy: `Plus Jakarta Sans`
  - Playful / Badge Accent: `DynaPuff`
- Scrollbars MUST preserve the dark-plum track (`#140117`) and royal-gold thumb (`#E09D17` / `#F5C538`) defined in `src/client/index.css`.
- Respect `@media (prefers-reduced-motion: reduce)` on all animations and 3D/parallax effects.

---

## 3. UX, Layout & Component Rules
1. **Forms & Drawers (`ResponsiveSheet` vs `ConfirmModal`)**:
   - ALL forms, editors, checkout flows, and detail panels MUST use `src/client/components/ui/ResponsiveSheet.tsx` (renders via `createPortal` as a smooth **Bottom Sheet** on mobile and **Right-Side Drawer** on desktop).
   - Centered modals are **FORBIDDEN** for forms. Use `src/client/components/ui/ConfirmModal.tsx` **ONLY** for simple yes/no/destructive confirmations.
2. **Refresh-Safe `/slug` Routing**:
   - Every public tab and every `/office` module MUST sync with URL pathnames so browser refresh preserves the active view:
     - Public: `/` (`stage`), `/tiket` (`tickets`), `/merch` (`merch`), `/dompet-tiket` (`wallet`), `/obs` (transparent OBS Browser Source).
     - Staff `/office/*`: `ringkasan`, `scanner`, `pesanan`, `tiket`, `merch`, `pengiriman`, `panggung`, `timeline`, `anatomi`, `media-studio`, `live-kit`, `sponsorship`, `panitia`.
3. **Smart Empty States**:
   - When active ticket tiers (`tickets.length === 0`) or merch items (`merch.length === 0`) are empty, do NOT render broken grids or dead purchase buttons. Hide purchase CTAs and display a clean, on-brand informational state explaining that sales are currently closed or unavailable.
4. **Touch & Interaction**:
   - Minimum interactive touch target: `44px x 44px` on mobile (`375px` viewport baseline).
   - Smooth transitions on sheet/drawer open-close and sidebar collapse/expand.

---

## 4. Brand Assets, Copy & Zero-Oversharing Rules
1. **No Internal Jargon or `/office` Links on Public UI**:
   - NEVER expose `/office`, `/api/admin/*`, `Master V6`, `PostgreSQL`, `HMAC`, `SHA256`, `EMVCo`, or internal stack/architecture terms in public pages, footers, or customer copy.
2. **Transparent Crest & Favicon Integrity**:
   - The school logo MUST have clean alpha transparency with zero black/white rectangular boxes. Do not display the provincial logo.
   - Keep multi-format AVERSA 44 favicons intact in `index.html` and `public/` (`/favicon.svg`, `/favicon.png`, `/favicon-32x32.png`, `/favicon.ico`, `/apple-touch-icon.png`).
3. **Media Studio & Reference Fidelity**:
   - Media templates in `src/client/components/media/MediaStudioView.tsx` MUST match `referensi desain/` layouts, typography, and assets cleanly for `4:5`, `1:1`, `9:16`, and `16:9` exports (PNG & MP4 with optional sound effects; music is added on the social platform).
4. **Zero Em Dashes**:
   - Em dashes (`—`, U+2014) are strictly FORBIDDEN anywhere in `src/` and `index.html`. Use `-`, `:`, or commas instead.

---

## 5. Backend, Database & Security Rules
- **RBAC Enforcement (`staff_users`)**:
  - Roles: `ADMIN`, `CASHIER`, `SCANNER`, `MEDIA`.
  - Enforce server-side route authorization on every `/api/admin/*` and `/api/media/*` endpoint (`MEDIA` role MUST receive `HTTP 403` on `/api/admin/overview` and financial/ticket CRUD).
  - NEVER return `password_hash`, raw signing secrets, or unmasked internal tokens in API responses.
- **Validation & Integrity**:
  - Validate all request payloads with Zod.
  - Use `crypto.timingSafeEqual` for cryptographic ticket/OBS token comparisons (`src/server/crypto-ticket.ts`).
  - Keep gate check-in atomic in PostgreSQL so a ticket cannot be double-redeemed under concurrent requests.
  - Public `/obs?overlay=<slug>&token=<token>` must require a valid stream token and maintain a transparent viewport background for OBS Studio Browser Source.

---

## 6. Mandatory Pre-Completion Verification Gate
Before declaring any code task complete, you MUST run and pass ALL of the following commands without skipping checks:
```bash
! grep -rn "—" src/ index.html
npx tsc -p tsconfig.json --noEmit
npm run build
npx tsx scripts/verify-e2e.ts
```
If UI, layout, `/office`, Media Studio, or `/obs` changed, also verify visually in a real browser at desktop (`1440x900`) and mobile (`375x812`) with zero console/HTTP errors.
