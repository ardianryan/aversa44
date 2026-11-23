# DESIGN.md — Dies Natalis ke-44 SMA Negeri 1 Gedeg "AVERSA"

Dial: ENERGY 3 / RHYTHM 3 / MOTION 3

## Design Read
Reading this as: Theatrical Festival, E-Ticketing & Official Merchandise Platform for SMA Negeri 1 Gedeg students, teachers, alumni, sponsors, and general public, in a Wonka-inspired Imperial Velvet & Molten Gold Confectionery Stage visual language, dial ENERGY 3 / RHYTHM 3 / MOTION 3.

## Brand Identity & Direction
- **Source of Truth**: project assets in `public/assets/`, reference posters in `referensi desain/`, and the original brand kit where available. Original local paths are not portable; see `docs/ARSITEKTUR.md`.
- **Core Palette (R-29)**:
  - Primary Stage Canvas: `#360538` (Midnight Imperial Plum) & `#1A021D` (Deep Velvet Stage)
  - Secondary Dark Surface: `#310603` (Obsidian Mahogany) & `#220519` (Dark Velvet Card)
  - Primary Accent Gold: `#F5C538` (Vivid Royal Gold) & `#E09D17` (Marigold Warm Gold)
  - High-Contrast Light Ink: `#FDF39D` (Pale Canary) & `#FFF5D6` (Vanilla Custard Cream, >12:1 contrast against `#360538` / `#1A021D`)
  - Theatrical Secondary Accents: `#A0D9CA` (Confectionery Mint), `#F5B8CB` (Cotton Candy Pink), `#7D1B05` (Deep Crimson Rust).

## Typography Mandate (R-06 & R-37 Override)
From `BRAND_GUIDELINES.md` Section 4:
1. **Plus Jakarta Sans** (400, 500, 600, 700, 800): Primary UI, navigation, forms, ticket tiers, merchandise specifications, and body prose.
2. **Cinzel** (ALL CAPS with +0.18em to +0.22em letter-spacing): Explicitly mandated by `BRAND_GUIDELINES.md` for Golden Ticket badges, ceremonial titles, and VIP credentials. Note for `/antislop` `R-06`/`R-37`: wide-tracked uppercase Cinzel is a documented brand-book identity choice for ceremonial tags and Golden Tickets, never used as generic "HOW IT WORKS" monospace slop.
3. **Playfair Display** + **AVERSA Hand-Drawn Liquid Gold Wordmark**: Theatrical stage headlines and guest star showcases.

## Purpose-Gate Written Reasons (R-31)
- **Color & Gradients (R-01)**: Midnight Imperial Plum (`#360538`) paired with Radial Crimson/Magenta stage spotlights creates >7:1 contrast so the Vivid Gold emblem (`#F5C538`) pops cleanly without color drowning.
- **Layout & Section Rhythm (R-05, RHYTHM 3)**: Alternating full-bleed 3D Hero Stage, asymmetrical Guest Star split showcase, ribbon-anchored Event Timeline, 3D Golden Ticket interactive preview + grid, staggered Merchandise Mockup store, Anatomy V6 Museum switcher, and Sponsorship / Scanner / Admin command views.
- **Typography (R-06)**: `Plus Jakarta Sans` ensures legible Indonesian copy on small 375px phone screens, while `Cinzel` and `Playfair Display` carry the 44-year academic grandeur and theatrical festival voice.
- **Background Texture (R-07)**: Custom `theater-curtain-drape-premium.svg`, `hypnotic-swirl-disc.svg`, and `watermark-arcs-gold.png` directly from `diesnat44project` anchor the stage aesthetic instead of generic dot/grid patterns.
- **Button Arrows & Badges (R-08, R-09)**: Real status labels (`Tersedia`, `Terbatas`, `Terverifikasi`, `Sudah Check-In`) mark live PostgreSQL quota and cryptographic state; buttons use action verbs without decorative arrows on every CTA.
- **Glassmorphism & Glow Dose Caps (R-10, R-12, R-13)**: Frosted backdrop blur (`backdrop-blur-md`) is capped to the floating top bar and mobile bottom navigation bar; gold glow is reserved exclusively for the Hero 3D emblem and the active 3D Golden Ticket card.
- **Feature Cards (R-14)**: Ticket tiers and event items vary in prominence (VIP Golden Ticket and Peak Event 17 Desember receive full-feature gold frame treatment while regular schedule items sit in an editorial timeline).
- **Animations & Motion (R-19, MOTION 3)**: Three.js 3D Emblem rotation, Interactive 3D Golden Ticket spin, and multi-layer CSS `translate3d` scroll parallax guide attention down the theatrical narrative, include a visible Pause/Play 3D control (`R-39`), and disable cleanly under `prefers-reduced-motion: reduce`.
- **Icons & Illustrations (R-04, R-22)**: All festival motifs (`item-magic-top-hat.svg`, `item-golden-ticket-badge.svg`, `item-swirl-lollipop.svg`, `item-golden-cane.svg`, `item-confectionery-rose.svg`, `svc-standalone-color.svg`) originate from the official `diesnat44project` vector kit.
- **Copywriting (R-02, R-15, R-16, R-17, R-18, R-38)**: Zero em dashes (`—`), zero invented statistics or testimonials, authentic event facts, and Indonesian EYD copywriting with specific action CTAs (`Ambil Tiket`, `Pesan Merch`, `Verifikasi QR`).


---

## Strict Design Enforcement Rules (Non-Negotiable)

### 1. Approved vs Forbidden Color Matrix
| Role | Approved Hex / Token | Forbidden Alternatives |
| :--- | :--- | :--- |
| **Stage / Canvas Base** | `#1A021D` | `#000000`, `#FFFFFF`, `bg-slate-950`, `bg-zinc-950`, `bg-neutral-900` |
| **Sidebar / Inset Well** | `#18021B`, `#140117` | `bg-slate-900`, `bg-gray-900`, `bg-zinc-900` |
| **Footer Base** | `#0D010F` | Stark black or light gray footers |
| **Elevated Panel / Sheet** | `#250428`, `#26042A`, `#360538` | `bg-white`, `bg-slate-800`, generic glassmorphism with gray tint |
| **Active Pill / Highlight** | `#310603` + `#F5C538` border/text | Generic `bg-indigo-600`, `bg-violet-600`, `bg-blue-600` |
| **Primary Gold CTA & Accent** | `#F5C538`, `#E09D17`, `#F7D160`, `#FDF39D` | `amber-400` without brand calibration, neon cyan/lime |
| **Primary Body Ink** | `#FFF5D6` | Pure `#FFFFFF` on `#1A021D`, low-contrast `text-gray-400`/`text-slate-500` |
| **Status Accents** | `#A0D9CA` (Verified/Success), `#F5B8CB` (Festival Pink), `#7D1B05` (Danger) | Generic Tailwind `emerald-500`, `rose-500`, `red-600` |

### 2. Sheet vs Modal Interaction Matrix
| Use Case | Required Component | Behavior |
| :--- | :--- | :--- |
| **Checkout, Ticket/Merch Forms, CMS Editors, Detail Drawers** | `ResponsiveSheet` (`src/client/components/ui/ResponsiveSheet.tsx`) | `createPortal` Bottom Sheet on mobile (`< 768px`), Right-Side Drawer on desktop (`>= 768px`), smooth enter/exit transitions |
| **Delete / Reset / Irreversible Yes-No Confirmation** | `ConfirmModal` (`src/client/components/ui/ConfirmModal.tsx`) | Centered lightweight confirmation dialog ONLY |
| **Centered Form Popups** | **FORBIDDEN** | Never render multi-field forms inside a centered modal |

### 3. Scrollbar, Crest & Public Copy Guardrails
- **Custom Scrollbars**: Track `#140117`, Thumb `#E09D17` -> `#F5C538` hover (`src/client/index.css`). Never revert to default OS/browser gray scrollbars inside dark plum containers.
- **Crest & Favicon Transparency**: The school crest MUST remain alpha-transparent with zero black/white bounding boxes; the provincial logo is not used; `index.html` keeps multi-format AVERSA 44 favicons (`?v=44`).
- **Public Copy Blacklist**: NEVER render `/office`, `/api/admin/*`, `Master V6`, `PostgreSQL`, `HMAC`, `SHA256`, `EMVCo`, or internal architecture terms in public UI or footer.
- **Canva Reference Fidelity**: All Media Studio templates (`4:5`, `1:1`, `9:16`, `16:9`) and hero graphics must stay faithful to `referensi desain/` assets and typography (`Cinzel`, `Playfair Display`, `Plus Jakarta Sans`, `DynaPuff`).
