---
trigger: always_on
---

# AVERSA 44 Strict Workspace Rules

Always read and obey `AGENTS.md`, `DESIGN.md`, and `PRD.md` at the repository root before editing any code in `/Users/ardianryan/Documents/aversa44`.

## Non-Negotiable Constraints
1. **Color Discipline**: Only use the Royal Plum & Gold palette (`#1A021D`, `#18021B`, `#140117`, `#0D010F`, `#250428`, `#26042A`, `#360538`, `#310603`, `#F5C538`, `#E09D17`, `#F7D160`, `#FDF39D`, `#FFF5D6`, `#A0D9CA`, `#F5B8CB`, `#7D1B05`). Never introduce Tailwind `slate-*`, `gray-*`, `zinc-*`, `indigo-*`, white backgrounds, or unapproved neon colors.
2. **Sheet vs Modal**: Every form and detail drawer MUST use `ResponsiveSheet` (`src/client/components/ui/ResponsiveSheet.tsx`) so mobile renders a bottom sheet and desktop renders a right drawer. Only simple yes/no confirmations may use `ConfirmModal`.
3. **Refresh-Safe `/slug` Routing**: All public tabs (`/`, `/tiket`, `/merch`, `/dompet-tiket`, `/obs`) and all 13 `/office/*` modules MUST preserve state across browser reloads via URL pathname routing.
4. **Public UI Hygiene**: Zero `/office` links, zero internal jargon (`Master V6`, `PostgreSQL`, `HMAC`, `EMVCo`), zero em dashes (`—` U+2014) anywhere in `src/` or `index.html`.
5. **Logo & Favicon Integrity**: Preserve transparent crests (`logo_smansage.png`, `logo-provinsi-jawa-timur.png`) and multi-format AVERSA 44 favicons (`?v=44`).
6. **RBAC & Crypto Safety**: Enforce `ADMIN`, `CASHIER`, `SCANNER`, `MEDIA` permissions server-side, validate inputs with Zod, use `crypto.timingSafeEqual`, and never expose `password_hash` or raw secrets.
7. **Verification Gate**: After any code edit, run and pass:
   `! grep -rn "—" src/ index.html && npx tsc -p tsconfig.json --noEmit && npm run build && npx tsx scripts/verify-e2e.ts`
