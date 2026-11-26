import { SceneMotion } from './components/motion/SceneMotion.tsx';
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useParallaxStage } from './hooks/useParallaxStage.ts';
import { StageHomeSection } from './components/StageHomeSection.tsx';
import { TicketingSection } from './components/TicketingSection.tsx';
import { MerchStoreSection } from './components/MerchStoreSection.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { TicketWalletSection } from './components/TicketWalletSection.tsx';
const OfficePortal = lazy(() => import('./components/OfficePortal.tsx').then(m => ({ default: m.OfficePortal })));
const ObsOverlayDisplay = lazy(() => import('./pages/ObsOverlayDisplay.tsx').then(m => ({ default: m.ObsOverlayDisplay })));
import type {
  ActiveTab,
  CartItem,
  CatalogResponse,
  HydratedOrder,
  MerchProduct,
  StaffUser,
  TicketTier,
} from './types.ts';
import { formatRupiah } from './types.ts';

const TAB_TO_PATH: Record<ActiveTab, string> = {
  stage: '/',
  tickets: '/tiket',
  merch: '/merch',
  wallet: '/dompet-tiket',
};

function resolveTabFromPath(path: string): ActiveTab {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/tiket' || clean === '/tickets') return 'tickets';
  if (clean === '/merch') return 'merch';
  if (clean === '/dompet-tiket' || clean === '/wallet') return 'wallet';
  return 'stage';
}

export function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveTabFromPath(window.location.pathname || '/')
  );
  const [pausedMotion, setPausedMotion] = useState(false);
  const parallax = useParallaxStage(pausedMotion);

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recentOrderCodes, setRecentOrderCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('aversa44_recent_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [walletOrderTarget, setWalletOrderTarget] = useState<string | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const navigatePath = (targetPath: string) => {
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setPathname(targetPath);
    window.scrollTo({ top: 0, behavior: parallax.reducedMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const onPopState = () => {
      const next = window.location.pathname || '/';
      setPathname(next);
      if (!next.startsWith('/office')) {
        setActiveTab(resolveTabFromPath(next));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    setCatalogError('');
    try {
      const res = await fetch('/api/catalog');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat katalog AVERSA 44.');
      }
      setCatalog(data);
    } catch (err: any) {
      setCatalogError(err?.message || 'Tidak dapat terhubung ke server AVERSA 44.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (!window.location.pathname.startsWith('/obs')) fetchCatalog();
    if (window.location.pathname.startsWith('/office')) fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user) setStaffUser(d.user);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const ordParam = params.get('order');
    if (ordParam) {
      setWalletOrderTarget(ordParam);
      setActiveTab('wallet');
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const addTicketToCart = (tier: TicketTier, qty: number) => {
    const key = `TKT-${tier.id}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) => (c.key === key ? { ...c, quantity: c.quantity + qty } : c));
      }
      return [
        ...prev,
        {
          key,
          itemType: 'TICKET',
          id: tier.id,
          name: tier.name,
          variantLabel: tier.category,
          unitPrice: tier.price,
          quantity: qty,
          requiresStudentId: tier.requires_student_id,
        },
      ];
    });
    showToast(`${qty}x ${tier.name} ditambahkan ke keranjang.`);
  };

  const addMerchToCart = (product: MerchProduct, variantLabel: string, qty: number) => {
    const key = `MRC-${product.id}-${variantLabel}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) => (c.key === key ? { ...c, quantity: c.quantity + qty } : c));
      }
      return [
        ...prev,
        {
          key,
          itemType: 'MERCH',
          id: product.id,
          name: product.name,
          variantLabel,
          unitPrice: product.price,
          quantity: qty,
          weightGrams: product.weight_grams,
          imageUrl: product.image_url,
        },
      ];
    });
    showToast(`${qty}x ${product.name} (${variantLabel}) masuk keranjang.`);
  };

  const updateCartQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.key === key ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const handleOrderCreated = (hydrated: HydratedOrder) => {
    const code = hydrated.order.order_code;
    setRecentOrderCodes((prev) => {
      const next = [code, ...prev.filter((c) => c !== code)].slice(0, 6);
      try {
        localStorage.setItem('aversa44_recent_orders', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
    fetchCatalog();
  };

  // Route /obs -> Transparent OBS Live Streaming Browser Source Overlay
  if (pathname.startsWith('/obs')) {
    return <Suspense fallback={null}><ObsOverlayDisplay /></Suspense>;
  }

  // Route /office -> Unified Staff Login & Back-Office Portal
  if (pathname.startsWith('/office')) {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-[#1A021D]" />}><OfficePortal
        staffUser={staffUser}
        onAuthChange={setStaffUser}
        onCatalogRefresh={fetchCatalog}
        onBackPublic={() => { fetchCatalog(); navigatePath('/'); }}
      /></Suspense>
    );
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const hasActiveTickets = (catalog?.ticketTiers.length ?? 0) > 0;
  const hasActiveMerch = (catalog?.merchProducts.length ?? 0) > 0;

  // Clean public navigation with /slug persistence & smart hiding when tickets/merch are unavailable
  const navItems: Array<{ id: ActiveTab; label: string; shortLabel: string; slug: string }> = [
    { id: 'stage', label: 'Panggung Utama', shortLabel: 'Beranda', slug: '/' },
    ...(catalog && !hasActiveTickets ? [] : [{ id: 'tickets' as const, label: 'E-Ticket', shortLabel: 'Tiket', slug: '/tiket' }]),
    ...(catalog && !hasActiveMerch ? [] : [{ id: 'merch' as const, label: 'Official Merch', shortLabel: 'Merch', slug: '/merch' }]),
    { id: 'wallet', label: 'Dompet Tiketku', shortLabel: 'Tiketku', slug: '/dompet-tiket' },
  ];

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    const targetSlug = TAB_TO_PATH[tab];
    if (window.location.pathname !== targetSlug) {
      window.history.pushState({}, '', targetSlug);
      setPathname(targetSlug);
    }
    window.scrollTo({ top: 0, behavior: parallax.reducedMotion ? 'auto' : 'smooth' });
  };

  const navigateToStageSection = (sectionId?: string) => {
    setActiveTab('stage');
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
      setPathname('/');
    }
    if (!sectionId) {
      window.scrollTo({ top: 0, behavior: parallax.reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    window.setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: parallax.reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }, 60);
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#1A021D] text-[#FFF5D6]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#F5C538] focus:text-[#310603] focus:font-bold"
      >
        Langsung ke konten utama
      </a>

      {/* Compact Sticky Top Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-[#F5C538]/30 bg-[#1A021D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              switchTab('stage');
            }}
            className="flex items-center gap-2.5 min-w-0 min-h-[44px]"
          >
            <img
              src="/assets/png/logo-symbol-color.png"
              alt="Lambang Dies Natalis 44"
              width={40}
              height={40}
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
            />
            <div className="min-w-0">
              <div className="font-ceremonial text-xs sm:text-sm font-extrabold tracking-[0.14em] text-[#FDF39D] truncate">
                AVERSA 44
              </div>
              <div className="text-[10px] sm:text-xs text-[#F5B8CB] truncate">
                SMAN 1 Gedeg • Mojokerto
              </div>
            </div>
          </a>

          {/* Desktop Public Navigation Tabs */}
          <nav aria-label="Navigasi Utama Desktop" className="hidden lg:flex items-center gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#F5C538] text-[#310603]'
                    : 'text-[#FFF5D6]/90 hover:bg-[#360538] hover:text-[#FDF39D]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Action Controls: Cart Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-[#E09D17] to-[#F5C538] text-[#310603] text-xs font-extrabold flex items-center gap-2 hover:brightness-105"
            >
              <span>Keranjang</span>
              <span className="px-2 py-0.5 rounded-full bg-[#310603] text-[#FDF39D] text-[11px] tabular-nums">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Feedback Toast */}
      {toastMsg && (
        <div
          role="status"
          className="fixed top-20 right-4 z-50 max-w-xs rounded-xl border-2 border-[#A0D9CA] bg-[#0F2F28] px-4 py-3 text-xs font-bold text-[#A0D9CA] shadow-lg"
        >
          {toastMsg}
        </div>
      )}

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 pb-10">
        {loadingCatalog ? (
          <div className="py-24 px-4 text-center space-y-3">
            <img
              src="/assets/png/logo-symbol-color.png"
              alt="Memuat Aversa 44"
              width={72}
              height={72}
              className="w-16 h-16 mx-auto"
            />
            <p className="text-sm font-bold text-[#FDF39D]">
              Memuat panggung AVERSA 44, jadwal acara, E-Ticket, dan katalog merchandise...
            </p>
          </div>
        ) : catalogError || !catalog ? (
          <div
            role="alert"
            className="max-w-lg mx-auto my-16 p-6 rounded-2xl border border-[#F5B8CB] bg-[#310603] text-center space-y-4"
          >
            <h1 className="text-xl font-extrabold text-[#F5B8CB]">Gagal Memuat Portal AVERSA 44</h1>
            <p className="text-sm text-[#FFF5D6]/85">{catalogError || 'Data katalog tidak tersedia.'}</p>
            <button
              type="button"
              onClick={fetchCatalog}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold"
            >
              Muat Ulang Halaman
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'stage' && (
              <StageHomeSection
                catalog={catalog}
                pausedMotion={pausedMotion}
                onToggleMotion={() => setPausedMotion((p) => !p)}
                pointerX={parallax.pointerX}
                pointerY={parallax.pointerY}
                reducedMotion={parallax.reducedMotion}
                onNavigateTickets={() => switchTab('tickets')}
                onNavigateMerch={() => switchTab('merch')}
              />
            )}

            {activeTab === 'tickets' && (
              <SceneMotion key="tickets" disabled={pausedMotion || parallax.reducedMotion}>
                <TicketingSection
                  tiers={catalog.ticketTiers}
                  pausedMotion={pausedMotion || parallax.reducedMotion}
                  onAddTicket={addTicketToCart}
                  onBackHome={() => switchTab('stage')}
                />
              </SceneMotion>
            )}

            {activeTab === 'merch' && (
              <SceneMotion key="merch" disabled={pausedMotion || parallax.reducedMotion}>
                <MerchStoreSection
                  products={catalog.merchProducts}
                  pausedMotion={pausedMotion || parallax.reducedMotion}
                  onAddMerch={addMerchToCart}
                  onBackHome={() => switchTab('stage')}
                />
              </SceneMotion>
            )}

            {activeTab === 'wallet' && (
              <SceneMotion key="wallet" disabled={pausedMotion || parallax.reducedMotion}>
                <TicketWalletSection
                  recentOrderCodes={recentOrderCodes}
                  initialOrderCode={walletOrderTarget}
                  pausedMotion={pausedMotion || parallax.reducedMotion}
                />
              </SceneMotion>
            )}
          </>
        )}
      </main>

      {/* Redesigned Theatrical Footer without internal links or jargon */}
      <footer className="border-t border-[#F5C538]/30 bg-gradient-to-b from-[#17021A] to-[#0D010F] px-4 sm:px-6 lg:px-10 pt-12 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* Left Column: Official Brand & School Identity Lockup */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3.5">
                <img
                  src="/assets/extracted/logo-sman1gedeg.png"
                  alt="Logo SMA Negeri 1 Gedeg"
                  width={44}
                  height={46}
                  className="h-11 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
                />
                <img
                  src="/assets/svg/logo-symbol-tight.svg"
                  alt="Lambang AVERSA 44"
                  width={38}
                  height={48}
                  className="h-11 w-auto object-contain drop-shadow-[0_4px_12px_rgba(245,197,56,0.28)]"
                />
                <span className="hidden sm:block h-8 w-px bg-[#F5C538]/25" aria-hidden="true" />
                <img
                  src="/assets/png/aversa-logotype-horizontal.png"
                  alt="AVERSA Dies Natalis ke-44"
                  width={180}
                  height={53}
                  className="h-9 w-auto object-contain"
                />
              </div>

              <div>
                <div className="font-theatrical text-lg font-extrabold text-[#FDF39D]">
                  {catalog?.eventMeta.school || 'SMA Negeri 1 Gedeg'}
                </div>
                <div className="text-xs font-semibold text-[#A0D9CA] mt-0.5">
                  {catalog?.eventMeta.edition || 'Dies Natalis ke-44'} •{' '}
                  {catalog?.eventMeta.era || '1982 - 2026'}
                </div>
              </div>

              <p className="text-xs text-[#FFF5D6]/80 leading-relaxed max-w-md">
                {catalog?.eventMeta.address ||
                  'Jl. Raya Pendidikan No. 55, Gedeg, Kabupaten Mojokerto, Jawa Timur 61351'}
              </p>

              <div className="rounded-2xl bg-[#1F0424]/90 border border-[#F5C538]/30 px-4 py-3 space-y-1 max-w-md">
                <div className="font-ceremonial text-[11px] font-bold tracking-[0.16em] text-[#F5C538] uppercase">
                  Puncak Perayaan
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#FFF5D6]">
                  {catalog?.eventMeta.peakDateLabel || '17 Desember 2026'} •{' '}
                  {catalog?.eventMeta.guestStarVenue || 'Lapangan Tengah SMAN 1 Gedeg'}
                </div>
              </div>
            </div>

            {/* Middle Column: Public Event Navigation */}
            <div className="lg:col-span-3 space-y-3">
              <div className="font-ceremonial text-xs font-bold tracking-[0.18em] text-[#F5C538] uppercase">
                Navigasi Perayaan
              </div>
              <ul className="space-y-1">
                {[
                  { label: 'Panggung Utama', action: () => navigateToStageSection() },
                  { label: 'Rangkaian Acara', action: () => navigateToStageSection('rangkaian') },
                  { label: 'Filosofi Lambang', action: () => navigateToStageSection('filosofi') },
                  ...(hasActiveTickets ? [{ label: 'Loket E-Ticket', action: () => switchTab('tickets') }] : []),
                  ...(hasActiveMerch ? [{ label: 'Official Merchandise', action: () => switchTab('merch') }] : []),
                  { label: 'Dompet Tiketku', action: () => switchTab('wallet') },
                  { label: 'Kemitraan Sponsorship', action: () => navigateToStageSection('sponsorship') },
                ].map((linkItem) => (
                  <li key={linkItem.label}>
                    <button
                      type="button"
                      onClick={linkItem.action}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-semibold text-[#FFF5D6]/85 hover:text-[#FDF39D] hover:bg-[#26042A] transition-colors flex items-center justify-between"
                    >
                      <span>{linkItem.label}</span>
                      <span aria-hidden="true" className="text-[#F5C538]/70 text-xs">
                        &rsaquo;
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Column: Official Channels & Direct Contacts */}
            <div className="lg:col-span-4 space-y-3">
              <div className="font-ceremonial text-xs font-bold tracking-[0.18em] text-[#F5C538] uppercase">
                Kanal Resmi &amp; Narahubung
              </div>

              <div className="rounded-2xl bg-[#18021B] border border-[#F5C538]/25 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#FFF5D6]/70">Website</span>
                  <a
                    href={
                      catalog?.eventMeta.socials.website?.startsWith('http')
                        ? catalog.eventMeta.socials.website
                        : `https://${catalog?.eventMeta.socials.website || 'www.sman1gedeg.sch.id'}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#A0D9CA] font-bold underline truncate"
                  >
                    {catalog?.eventMeta.socials.website || 'www.sman1gedeg.sch.id'}
                  </a>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[#FFF5D6]/70">Instagram</span>
                  <span className="font-bold text-[#FFF5D6]">
                    {catalog?.eventMeta.socials.instagram || '@smansagemoker'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[#FFF5D6]/70">TikTok</span>
                  <span className="font-bold text-[#FFF5D6]">
                    {catalog?.eventMeta.socials.tiktok || '@sman1gedeg'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[#FFF5D6]/70">Facebook</span>
                  <span className="font-bold text-[#FFF5D6] text-right">
                    {catalog?.eventMeta.socials.facebook || 'SMA Negeri 1 Gedeg'}
                  </span>
                </div>
              </div>

              {catalog?.eventMeta.sponsorshipContacts?.length ? (
                <div className="space-y-2">
                  {catalog.eventMeta.sponsorshipContacts.map((cp) => (
                    <a
                      key={cp.whatsapp}
                      href={`https://wa.me/${cp.whatsapp}?text=${encodeURIComponent(
                        'Halo Panitia Dies Natalis ke-44 AVERSA SMAN 1 Gedeg, saya ingin bertanya seputar acara.'
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 min-h-[48px] px-3.5 py-2 rounded-xl bg-[#18021B] border border-[#F5C538]/25 hover:border-[#A0D9CA]/60 transition-colors text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#FDF39D] truncate">{cp.name}</div>
                        <div className="text-[11px] text-[#FFF5D6]/70 truncate">{cp.role}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#A0D9CA] text-[#1A021D] font-extrabold shrink-0">
                        {cp.phoneDisplay}
                      </span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Bottom Legal & Back-to-Top Row */}
          <div className="mt-10 pt-6 border-t border-[#F5C538]/15 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#FFF5D6]/70">
            <p className="text-center sm:text-left">
              &copy; 2026 Panitia Dies Natalis ke-44 {catalog?.eventMeta.school || 'SMA Negeri 1 Gedeg'} •
              AVERSA. Seluruh hak cipta dilindungi.
            </p>
            <button
              type="button"
              onClick={() =>
                window.scrollTo({ top: 0, behavior: parallax.reducedMotion ? 'auto' : 'smooth' })
              }
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#F5C538]/35 text-xs font-bold text-[#FDF39D] hover:bg-[#26042A] transition-colors"
            >
              Kembali ke Atas &uarr;
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Bottom Cart Pill (Visible whenever cart has items & checkout is closed) */}
      {cartCount > 0 && !checkoutOpen && (
        <div className="fixed bottom-[76px] lg:bottom-6 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-40 pointer-events-none">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            aria-label={`Buka keranjang belanja, ${cartCount} item, total ${formatRupiah(cartSubtotal)}`}
            className="pointer-events-auto w-full min-h-[54px] px-2.5 sm:px-3.5 py-2 rounded-full bg-[#250428]/95 backdrop-blur-md border border-[#F5C538]/75 shadow-[0_14px_38px_rgba(0,0,0,0.65)] flex items-center justify-between gap-2 sm:gap-3 hover:border-[#FDF39D] active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-[#310603] border border-[#F5C538]/55 text-[11px] font-black text-[#F5C538] shrink-0">
                {cartCount} Item
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-[#FFF5D6] whitespace-nowrap">
                Total<span className="hidden sm:inline"> Belanja</span>
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <span className="text-xs sm:text-base font-black text-[#F7D160]">
                {formatRupiah(cartSubtotal)}
              </span>
              <span className="px-3 sm:px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#E09D17] via-[#F5C538] to-[#F7D160] text-[#310603] text-xs font-black">
                Checkout &rarr;
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Mobile-First Thumb-Zone Bottom Navigation Bar (Adapts cleanly to active tabs) */}
      <nav
        aria-label="Navigasi Cepat Mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#F5C538]/40 bg-[#1A021D]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div
          className={`grid gap-1 px-2 py-1.5 ${
            navItems.length === 2
              ? 'grid-cols-2'
              : navItems.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-4'
          }`}
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[48px] px-2 py-1.5 rounded-xl flex flex-col items-center justify-center text-xs font-extrabold transition-colors ${
                  active
                    ? 'bg-[#F5C538] text-[#310603]'
                    : 'text-[#FFF5D6]/85 hover:bg-[#360538]'
                }`}
              >
                <span className="leading-tight text-center">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Checkout & Hybrid Payment Modal */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        shippingZones={catalog?.shippingZones || []}
        qrisEnabled={catalog?.qrisEnabled ?? false}
        xenditEnabled={catalog?.xenditEnabled ?? false}
        bankPaymentInfo={catalog?.eventMeta.bankPaymentInfo}
        onUpdateQty={updateCartQty}
        onClearCart={() => setCart([])}
        onOrderCreated={handleOrderCreated}
        onOpenWallet={(code) => {
          setWalletOrderTarget(code);
          switchTab('wallet');
        }}
      />
    </div>
  );
}

export default App;
