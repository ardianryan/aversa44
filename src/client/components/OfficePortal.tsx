import { ResponsiveSheet } from './ui/ResponsiveSheet.tsx';
import { MediaLogosView } from './media/MediaLogosView.tsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScannerAndAdminSection } from './ScannerAndAdminSection.tsx';
import {
  OfficeAnatomyCreditsCmsView,
  OfficeHeroSettingsCmsView,
  OfficeMerchCmsView,
  OfficeOrdersView,
  OfficeOverviewView,
  OfficeCouponsCmsView,
  OfficeShippingCmsView,
  OfficeSponsorshipCmsView,
  OfficeStaffRbacView,
  OfficeTicketsCmsView,
  OfficeTimelineCmsView,
} from './OfficeCmsModules.tsx';
import { MediaStudioView } from './media/MediaStudioView.tsx';
import { ObsControllerView } from './media/ObsControllerView.tsx';
import { AuroraBackground } from './reactbits/AuroraBackground.tsx';
import { SpotlightCard } from './reactbits/SpotlightCard.tsx';
import { ShinyText } from './reactbits/ShinyText.tsx';
import type { StaffUser } from '../types.ts';

interface OfficePortalProps {
  staffUser: StaffUser | null;
  onAuthChange: (user: StaffUser | null) => void;
  onCatalogRefresh: () => void;
  onBackPublic: () => void;
}

type OfficeSectionId =
  | 'overview'
  | 'scanner'
  | 'orders'
  | 'tickets'
  | 'merch'
  | 'shipping'
  | 'coupons'
  | 'hero-settings'
  | 'timeline'
  | 'anatomy-credits'
  | 'media-studio'
  | 'logo-media'
  | 'live-kit'
  | 'sponsorship'
  | 'staff';

const OFFICE_SLUGS: Record<OfficeSectionId, string> = {
  overview: '/office/ringkasan',
  scanner: '/office/scanner',
  orders: '/office/pesanan',
  tickets: '/office/tiket',
  merch: '/office/merch',
  shipping: '/office/pengiriman',
  coupons: '/office/kupon',
  'hero-settings': '/office/panggung',
  timeline: '/office/timeline',
  'anatomy-credits': '/office/anatomi',
  'media-studio': '/office/media-studio',
  'logo-media': '/office/logo-media',
  'live-kit': '/office/live-kit',
  sponsorship: '/office/sponsorship',
  staff: '/office/panitia',
};

function parseOfficeSectionFromPath(path: string, fallback: OfficeSectionId): OfficeSectionId {
  const clean = path.replace(/\/+$/, '');
  for (const [id, slugPath] of Object.entries(OFFICE_SLUGS)) {
    if (clean === slugPath) return id as OfficeSectionId;
  }
  return fallback;
}

interface NavItemDef {
  id: OfficeSectionId;
  label: string;
  shortDesc: string;
  roles: Array<StaffUser['role']>;
  icon: React.ReactNode;
}

interface NavGroupDef {
  group: string;
  items: NavItemDef[];
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

const NAV_GROUPS: NavGroupDef[] = [
  {
    group: 'OPERASIONAL LAPANGAN',
    items: [
      {
        id: 'overview',
        label: 'Ringkasan & KPI',
        shortDesc: 'Pendapatan real-time, pesanan pending, dan ringkasan kuota tiket',
        roles: ['ADMIN', 'CASHIER'],
        icon: (
          <svg {...iconProps}>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        ),
      },
      {
        id: 'scanner',
        label: 'Gate QR Scanner',
        shortDesc: 'Validasi E-Ticket masuk gerbang dan serah terima booth merchandise',
        roles: ['ADMIN', 'CASHIER', 'SCANNER'],
        icon: (
          <svg {...iconProps}>
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
        ),
      },
      {
        id: 'orders',
        label: 'Antrean Pesanan & POS',
        shortDesc: 'Konfirmasi pembayaran tunai/transfer serta transaksi kasir langsung',
        roles: ['ADMIN', 'CASHIER'],
        icon: (
          <svg {...iconProps}>
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'KATALOG & TRANSAKSI',
    items: [
      {
        id: 'tickets',
        label: 'Manajemen E-Ticket',
        shortDesc: 'Tambah, ubah harga, kuota, aktif/nonaktifkan, dan hapus kategori tiket',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
            <path d="M13 5v2" />
            <path d="M13 17v2" />
            <path d="M13 11v2" />
          </svg>
        ),
      },
      {
        id: 'merch',
        label: 'Manajemen Merchandise',
        shortDesc: 'Kelola varian, stok ukuran, harga, foto, dan status produk official',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        ),
      },
      {
        id: 'shipping',
        label: 'Zona Kirim & Booth',
        shortDesc: 'Atur lokasi ambil di booth panitia, ongkir kurir lokal, dan ekspedisi',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
            <path d="M15 18H9" />
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
            <circle cx="17" cy="18" r="2" />
            <circle cx="7" cy="18" r="2" />
          </svg>
        ),
      },
      {
        id: 'coupons',
        label: 'Kupon & Promo',
        shortDesc: 'Kelola kode kupon diskon untuk pembelian tiket dan merchandise',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
            <path d="M13 5v2" />
            <path d="M13 17v2" />
            <path d="M13 11v2" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'KONTEN DEPAN (CMS)',
    items: [
      {
        id: 'hero-settings',
        label: 'Hero, Bintang & Kontak',
        shortDesc: 'Edit judul panggung utama, tanggal countdown, guest star, rekening, & footer',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        ),
      },
      {
        id: 'timeline',
        label: 'Jadwal Event & Timeline',
        shortDesc: 'Kelola agenda perayaan Dies Natalis yang tampil pada linimasa depan',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        id: 'anatomy-credits',
        label: 'Anatomi Logo & Kredit',
        shortDesc: 'Atur 6 slide filosofi Master V6, narasi sponsor, dan daftar tim kreator',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'TIM MEDIA & SIARAN',
    items: [
      {
        id: 'media-studio',
        label: 'Media Studio',
        shortDesc: 'Buat poster dan video Reels/TikTok 3 langkah cepat',
        roles: ['ADMIN', 'MEDIA'],
        icon: (
          <svg {...iconProps}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <circle cx="8.5" cy="9.5" r="2" />
            <path d="m21 15-4.5-4.5L9 17" />
            <path d="M7 21h10" />
          </svg>
        ),
      },
      {
        id: 'logo-media',
        label: 'Logo & Sponsor',
        shortDesc: 'Atur logo Official Media Partner dan urutan 3 sponsor utama',
        roles: ['ADMIN', 'MEDIA'],
        icon: <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m3 18 6-6 4 4 4-5 4 7" /></svg>,
      },
      {
        id: 'live-kit',
        label: 'Live Streaming Kit',
        shortDesc: 'Kontrol layar OBS, stinger bumper, dan mesin siaran cloud',
        roles: ['ADMIN', 'MEDIA'],
        icon: (
          <svg {...iconProps}>
            <path d="m22 8-6 4 6 4V8Z" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'KEMITRAAN & SISTEM',
    items: [
      {
        id: 'sponsorship',
        label: 'Portal Sponsorship',
        shortDesc: 'Tinjau pengajuan sponsor masuk dan perbarui status tindak lanjut panitia',
        roles: ['ADMIN', 'CASHIER'],
        icon: (
          <svg {...iconProps}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        id: 'staff',
        label: 'Akun Panitia & RBAC',
        shortDesc: 'Tambah akun panitia baru, ubah peran akses, atau nonaktifkan petugas',
        roles: ['ADMIN'],
        icon: (
          <svg {...iconProps}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        ),
      },
    ],
  },
];

/**
 * Dedicated Back-Office CMS & Operational Portal at /office.
 * Collapsible desktop sidebar + mobile drawer sheet + role-filtered modules.
 */
export const OfficePortal: React.FC<OfficePortalProps> = ({
  staffUser,
  onAuthChange,
  onCatalogRefresh,
  onBackPublic,
}) => {
  const defaultSection: OfficeSectionId =
    staffUser?.role === 'SCANNER'
      ? 'scanner'
      : staffUser?.role === 'MEDIA'
      ? 'media-studio'
      : 'overview';
  const [activeSection, setActiveSection] = useState<OfficeSectionId>(() =>
    parseOfficeSectionFromPath(window.location.pathname, defaultSection)
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);
  const [mediaData, setMediaData] = useState<any>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [toast, setToast] = useState<{ msg: string; isErr: boolean } | null>(null);

  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLDivElement | null>(null);

  // Sync browser Back/Forward across /office/<slug>
  useEffect(() => {
    const onPopState = () => {
      setActiveSection(parseOfficeSectionFromPath(window.location.pathname, defaultSection));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultSection]);

  // Smooth open/close transition for mobile drawer sheet
  useEffect(() => {
    if (mobileMenuOpen) {
      setDrawerMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setDrawerVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    } else {
      setDrawerVisible(false);
      const timer = window.setTimeout(() => setDrawerMounted(false), 300);
      return () => window.clearTimeout(timer);
    }
  }, [mobileMenuOpen]);

  const visibleGroups = useMemo(() => {
    if (!staffUser) return [];
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => it.roles.includes(staffUser.role)),
    })).filter((g) => g.items.length > 0);
  }, [staffUser]);

  useEffect(() => {
    setOpenGroup(visibleGroups.find(group => group.items.some(item => item.id === activeSection))?.group ?? null);
  }, [activeSection, visibleGroups]);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) { setPasswordError('Konfirmasi kata sandi belum cocok.'); return; }
    setPasswordBusy(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) { setPasswordError(data.error || 'Kata sandi gagal diubah.'); return; }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordOpen(false); setToast({ msg: 'Kata sandi berhasil diubah.', isErr: false });
    } catch { setPasswordError('Tidak dapat terhubung. Silakan coba lagi.'); }
    finally { setPasswordBusy(false); }
  };

  const activeNavMeta = useMemo(() => {
    for (const grp of NAV_GROUPS) {
      const found = grp.items.find((i) => i.id === activeSection);
      if (found) return found;
    }
    return NAV_GROUPS[0].items[0];
  }, [activeSection]);

  const showToast = useCallback((msg: string, isErr = false) => {
    setToast({ msg, isErr });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadAdminOverview = useCallback(async () => {
    if (!staffUser || staffUser.role === 'SCANNER' || staffUser.role === 'MEDIA') return;
    setLoadingAdmin(true);
    setAdminError('');
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          onAuthChange(null);
          return;
        }
        setAdminError(data.error || 'Gagal memuat data Office Dashboard.');
        return;
      }
      setAdminData(data);
    } catch {
      setAdminError('Koneksi ke server Office terputus. Silakan coba lagi.');
    } finally {
      setLoadingAdmin(false);
    }
  }, [staffUser, onAuthChange]);

  const loadMediaOverview = useCallback(async () => {
    if (!staffUser || (staffUser.role !== 'ADMIN' && staffUser.role !== 'MEDIA')) return;
    try {
      const res = await fetch('/api/admin/media-overview');
      const data = await res.json();
      if (res.ok && data.success) {
        setMediaData(data);
      }
    } catch {
      // ignore transient network error
    }
  }, [staffUser]);

  // Keep activeSection valid when role changes / logs in
  useEffect(() => {
    if (!staffUser) {
      setAdminData(null);
      setMediaData(null);
      return;
    }
    const allowedIds = visibleGroups.flatMap((g) => g.items.map((i) => i.id));
    if (!allowedIds.includes(activeSection)) {
      const next: OfficeSectionId =
        staffUser.role === 'SCANNER'
          ? 'scanner'
          : staffUser.role === 'MEDIA'
          ? 'media-studio'
          : 'overview';
      setActiveSection(next);
      window.history.replaceState({}, '', OFFICE_SLUGS[next]);
    } else {
      const cleanPath = window.location.pathname.replace(/\/+$/, '');
      if (cleanPath === '/office') {
        window.history.replaceState({}, '', OFFICE_SLUGS[activeSection]);
      }
    }
    if (staffUser.role === 'ADMIN' || staffUser.role === 'CASHIER') {
      loadAdminOverview();
    }
    if (staffUser.role === 'ADMIN' || staffUser.role === 'MEDIA') {
      loadMediaOverview();
    }
  }, [staffUser, visibleGroups, activeSection, loadAdminOverview, loadMediaOverview]);

  // Close mobile drawer on Escape and return focus to trigger
  useEffect(() => {
    if (!mobileMenuOpen || !drawerMounted) return;
    const focusable = () => Array.from(mobileDrawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileMenuOpen(false);
        requestAnimationFrame(() => mobileTriggerRef.current?.focus());
      } else if (e.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (first && last && e.shiftKey && (document.activeElement === first || !mobileDrawerRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (first && last && !e.shiftKey && (document.activeElement === last || !mobileDrawerRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen, drawerMounted]);

  const handleAuth = (user: StaffUser | null) => {
    onAuthChange(user);
    if (user) {
      const fallback: OfficeSectionId =
        user.role === 'SCANNER' ? 'scanner' : user.role === 'MEDIA' ? 'media-studio' : 'overview';
      const resolved = parseOfficeSectionFromPath(window.location.pathname, fallback);
      setActiveSection(resolved);
      window.history.replaceState({}, '', OFFICE_SLUGS[resolved]);
    } else {
      setAdminData(null);
      setMediaData(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAdminData(null);
    onAuthChange(null);
  };

  const handleSelectSection = (id: OfficeSectionId) => {
    setActiveSection(id);
    const targetSlug = OFFICE_SLUGS[id];
    if (targetSlug && window.location.pathname !== targetSlug) {
      window.history.pushState({}, '', targetSlug);
    }
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
      requestAnimationFrame(() => mobileTriggerRef.current?.focus());
    }
  };

  // Unauthenticated Unified Single Login Portal
  if (!staffUser) {
    return (
      <div className="relative min-h-dvh flex flex-col bg-[#1A021D] text-[#FFF5D6] overflow-x-clip">
        <AuroraBackground />
        <header className="sticky top-0 z-40 border-b border-[#F5C538]/30 bg-[#1A021D]/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/assets/png/logo-symbol-color.png"
                alt="Lambang AVERSA 44"
                width={36}
                height={36}
                className="w-9 h-9 object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="font-ceremonial text-xs sm:text-sm font-extrabold tracking-[0.14em] text-[#FDF39D] truncate">
                  AVERSA 44 • OFFICE PORTAL
                </div>
                <div className="text-[11px] text-[#A0D9CA] truncate">
                  Pusat Kendali Panitia, CMS &amp; Gate Scanner
                </div>
              </div>
            </div>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onBackPublic();
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] flex items-center hover:bg-[#310603]"
            >
              Lihat Web Publik
            </a>
          </div>
        </header>

        <main id="main-content" className="relative z-10 flex-1 py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#26042A] border border-[#F5C538]/40">
                <ShinyText
                  text="Akses Terpadu Panitia"
                  className="font-ceremonial text-[11px] font-bold tracking-[0.18em] uppercase"
                />
              </div>
              <h1 className="font-theatrical text-3xl font-extrabold text-[#FFF5D6]">
                Office Login AVERSA 44
              </h1>
              <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
                Satu pintu masuk untuk Admin CMS, Kasir POS Tunai, dan Petugas Gate QR Scanner.
              </p>
            </div>

            <SpotlightCard className="rounded-3xl border-2 border-[#F5C538]/45 bg-[#26042A]/95">
              <ScannerAndAdminSection
                mode="admin"
                staffUser={null}
                onAuthChange={handleAuth}
                onCatalogRefresh={onCatalogRefresh}
              />
            </SpotlightCard>
          </div>
        </main>
      </div>
    );
  }

  const renderSidebarNav = (isMobileDrawer: boolean) => {
    const isCompact = !isMobileDrawer && sidebarCollapsed;
    return (
      <div className="flex flex-col h-full bg-[#18021B] border-r border-[#F5C538]/25">
        {/* Sidebar Brand & Collapse Toggle */}
        <div
          className={`flex items-center border-b border-[#F5C538]/20 px-3 h-16 shrink-0 ${
            isCompact ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          {!isCompact && (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/png/logo-symbol-color.png"
                alt="Lambang AVERSA 44"
                width={32}
                height={32}
                className="w-8 h-8 object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="font-ceremonial text-xs font-extrabold tracking-[0.14em] text-[#FDF39D] truncate">
                  AVERSA OFFICE
                </div>
                <div className="text-[11px] text-[#A0D9CA] truncate">CMS &amp; Operasional</div>
              </div>
            </div>
          )}

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                requestAnimationFrame(() => mobileTriggerRef.current?.focus());
              }}
              aria-label="Tutup menu navigasi"
              className="min-w-[44px] min-h-[44px] rounded-xl border border-[#F5C538]/30 flex items-center justify-center text-[#FDF39D] hover:bg-[#310603]"
            >
              <svg {...iconProps}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Bentangkan bilah sisi' : 'Ciutkan bilah sisi'}
              title={sidebarCollapsed ? 'Bentangkan Sidebar' : 'Ciutkan Sidebar'}
              className="min-w-[44px] min-h-[44px] rounded-xl border border-[#F5C538]/30 flex items-center justify-center text-[#FDF39D] hover:bg-[#310603] shrink-0"
            >
              <svg {...iconProps}>
                {sidebarCollapsed ? (
                  <>
                    <polyline points="9 18 15 12 9 6" />
                  </>
                ) : (
                  <>
                    <polyline points="15 18 9 12 15 6" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Grouped Navigation Links */}
        <nav
          aria-label="Navigasi Office Dashboard"
          className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5"
        >
          {visibleGroups.map((group) => (
            <div key={group.group} className="space-y-1.5">
              {!isCompact ? (
                <button type="button" aria-expanded={openGroup === group.group}
                  onClick={() => setOpenGroup(openGroup === group.group ? null : group.group)}
                  className="w-full min-h-[44px] px-2.5 flex items-center justify-between gap-2 text-left text-[11px] font-bold tracking-[0.12em] text-[#A0D9CA] uppercase rounded-lg hover:bg-[#26042A]">
                  {group.group}<span aria-hidden="true" className={openGroup === group.group ? 'rotate-180 transition-transform' : 'transition-transform'}>⌄</span>
                </button>
              ) : (
                <button type="button" aria-label={group.group} title={group.group}
                  onClick={() => { setSidebarCollapsed(false); setOpenGroup(group.group); }}
                  className="w-full min-h-[44px] flex items-center justify-center rounded-xl text-[#A0D9CA] hover:bg-[#26042A]">
                  {group.items[0]?.icon}
                </button>
              )}

              <div className="space-y-1" hidden={openGroup !== group.group}>
                {group.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSection(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={isCompact ? item.label : undefined}
                      title={isCompact ? item.label : undefined}
                      className={`relative w-full min-h-[44px] rounded-xl flex items-center transition-colors ${
                        isCompact ? 'justify-center px-2' : 'gap-3 px-3'
                      } ${
                        isActive
                          ? 'bg-[#310603] border border-[#F5C538]/65 text-[#FDF39D] font-bold shadow-[0_0_20px_rgba(245,197,56,0.14)]'
                          : 'border border-transparent text-[#FFF5D6]/85 hover:bg-[#26042A] hover:text-[#FFF5D6]'
                      }`}
                    >
                      {/* Dual active marker (shape + color), remains visible when collapsed */}
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0.5 top-2 bottom-2 w-1 rounded-full bg-[#F5C538]"
                        />
                      )}
                      <span className="shrink-0">{item.icon}</span>
                      {!isCompact && (
                        <span className="text-xs text-left truncate flex-1">{item.label}</span>
                      )}
                      {!isCompact && isActive && (
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full bg-[#F5C538] shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Identity & Actions */}
        <div className="border-t border-[#F5C538]/20 p-3 space-y-2 shrink-0">
          {!isCompact && (
            <div className="rounded-xl bg-[#26042A] border border-[#F5C538]/25 px-3 py-2">
              <div className="text-xs font-bold text-[#FFF5D6] truncate">{staffUser.fullName}</div>
              <div className="text-[11px] font-mono text-[#A0D9CA]">
                @{staffUser.username} ({staffUser.role})
              </div>
            </div>
          )}

          <button type="button" onClick={() => { setPasswordOpen(true); setPasswordError(''); setMobileMenuOpen(false); }}
            aria-label="Ganti kata sandi" title="Ganti kata sandi"
            className="w-full min-h-[44px] rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] hover:bg-[#310603]">
            {isCompact ? '🔒' : 'Ganti kata sandi'}
          </button>
          <div className={`flex ${isCompact ? 'flex-col gap-2' : 'gap-2'}`}>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onBackPublic();
              }}
              aria-label="Lihat Web Publik"
              title="Lihat Web Publik"
              className="flex-1 min-h-[44px] px-2.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] flex items-center justify-center gap-1.5 hover:bg-[#310603]"
            >
              <svg {...iconProps}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {!isCompact && <span>Web Publik</span>}
            </a>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar dari Office"
              title="Keluar"
              className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl border border-[#F5B8CB]/45 text-xs font-bold text-[#F5B8CB] flex items-center justify-center gap-1.5 hover:bg-[#310603]"
            >
              <svg {...iconProps}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {!isCompact && <span>Keluar</span>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderActiveSection = () => {
    if (activeSection === 'scanner') {
      return (
        <ScannerAndAdminSection
          mode="scanner"
          staffUser={staffUser}
          onAuthChange={handleAuth}
          onCatalogRefresh={onCatalogRefresh}
        />
      );
    }

    if (activeSection === 'media-studio' || activeSection === 'live-kit' || activeSection === 'logo-media') {
      if (!mediaData) {
        return (
          <div className="h-64 rounded-2xl bg-[#26042A] border border-[#F5C538]/20 animate-pulse" />
        );
      }
      if (activeSection === 'logo-media') return <MediaLogosView mediaData={mediaData} onRefresh={loadMediaOverview} onNotify={showToast} />;
      if (activeSection === 'media-studio') {
        return <MediaStudioView mediaData={mediaData} onNotify={showToast} />;
      }
      return (
        <ObsControllerView
          mediaData={mediaData}
          onRefresh={loadMediaOverview}
          onNotify={showToast}
        />
      );
    }

    if (loadingAdmin && !adminData) {
      return (
        <div className="space-y-4" aria-busy="true" aria-label="Memuat data CMS Office">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-24 rounded-2xl bg-[#26042A] border border-[#F5C538]/20 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-[#26042A] border border-[#F5C538]/20 animate-pulse" />
        </div>
      );
    }

    if (adminError && !adminData) {
      return (
        <div className="rounded-2xl border border-[#F5B8CB]/50 bg-[#310603]/80 p-6 text-center space-y-3">
          <p className="text-sm font-bold text-[#F5B8CB]">{adminError}</p>
          <button
            type="button"
            onClick={loadAdminOverview}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold"
          >
            Muat Ulang Data
          </button>
        </div>
      );
    }

    if (!adminData) return null;

    const cmsProps = {
      adminData,
      onRefresh: loadAdminOverview,
      onCatalogRefresh,
      onNotify: showToast,
    };

    switch (activeSection) {
      case 'overview':
        return (
          <OfficeOverviewView
            {...cmsProps}
            onSwitchSection={(sec) => handleSelectSection(sec as OfficeSectionId)}
          />
        );
      case 'orders':
        return <OfficeOrdersView {...cmsProps} />;
      case 'tickets':
        return <OfficeTicketsCmsView {...cmsProps} />;
      case 'merch':
        return <OfficeMerchCmsView {...cmsProps} />;
      case 'shipping':
        return <OfficeShippingCmsView {...cmsProps} />;
      case 'coupons':
        return <OfficeCouponsCmsView {...cmsProps} />;
      case 'hero-settings':
        return <OfficeHeroSettingsCmsView {...cmsProps} />;
      case 'timeline':
        return <OfficeTimelineCmsView {...cmsProps} />;
      case 'anatomy-credits':
        return <OfficeAnatomyCreditsCmsView {...cmsProps} />;
      case 'sponsorship':
        return <OfficeSponsorshipCmsView {...cmsProps} />;
      case 'staff':
        return <OfficeStaffRbacView {...cmsProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-dvh flex bg-[#1A021D] text-[#FFF5D6] overflow-x-clip">
      <AuroraBackground />

      <ResponsiveSheet open={passwordOpen} onClose={() => { if (!passwordBusy) { setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); } }} title="Ganti kata sandi" subtitle="Gunakan kata sandi yang berbeda untuk akun Anda.">
        <form onSubmit={changePassword} className="space-y-4">
          {([['Kata sandi saat ini', currentPassword, setCurrentPassword, 'current-password'], ['Kata sandi baru', newPassword, setNewPassword, 'new-password'], ['Ulangi kata sandi baru', confirmPassword, setConfirmPassword, 'new-password']] as const).map(([label, value, setter, autocomplete]) => (
            <label key={label} className="block space-y-2 text-sm font-bold text-[#FFF5D6]">{label}
              <input type="password" required minLength={autocomplete === 'new-password' ? 8 : 1} maxLength={100} autoComplete={autocomplete} value={value} onChange={e => setter(e.target.value)} className="block w-full min-h-[48px] rounded-xl border border-[#F5C538]/45 bg-[#18021B] px-3 text-[#FFF5D6] focus:outline-2 focus:outline-[#F5C538]" />
            </label>
          ))}
          {passwordError && <p role="alert" className="text-sm text-[#F5B8CB]">{passwordError}</p>}
          <button type="submit" disabled={passwordBusy} className="min-h-[44px] rounded-xl bg-[#F5C538] px-5 font-bold text-[#310603] disabled:opacity-60">{passwordBusy ? 'Menyimpan...' : 'Simpan kata sandi'}</button>
        </form>
      </ResponsiveSheet>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block sticky top-0 h-dvh z-30 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarCollapsed ? 'w-[76px]' : 'w-72'
        }`}
      >
        {renderSidebarNav(false)}
      </aside>

      {/* Mobile Slide-Over Sidebar Sheet with Smooth Enter & Exit */}
      {drawerMounted && (
        <div
          ref={mobileDrawerRef}
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi Office Dashboard"
        >
          <div
            aria-hidden="true"
            className={`fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-300 ease-out ${
              drawerVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => {
              setMobileMenuOpen(false);
              requestAnimationFrame(() => mobileTriggerRef.current?.focus());
            }}
          />
          <aside
            className={`relative z-10 w-[85vw] max-w-xs h-full shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              drawerVisible ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {renderSidebarNav(true)}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 border-b border-[#F5C538]/25 bg-[#1A021D]/92 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-expanded={mobileMenuOpen}
              aria-label="Buka menu navigasi Office"
              className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl border border-[#F5C538]/40 bg-[#26042A] text-[#FDF39D] flex items-center justify-center shrink-0"
            >
              <svg {...iconProps}>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>

            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.14em] text-[#A0D9CA] uppercase truncate">
                Office Dashboard / {activeNavMeta.label}
              </div>
              <h1 className="text-sm sm:text-base font-extrabold text-[#FFF5D6] truncate">
                {activeNavMeta.shortDesc}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {staffUser.role !== 'SCANNER' && activeSection !== 'scanner' && (
              <button
                type="button"
                onClick={() => {
                  if (activeSection === 'media-studio' || activeSection === 'live-kit' || activeSection === 'logo-media') {
                    void loadMediaOverview();
                  } else {
                    void loadAdminOverview();
                  }
                }}
                disabled={loadingAdmin}
                className="min-h-[44px] px-3.5 rounded-xl border border-[#A0D9CA]/45 bg-[#26042A] text-xs font-bold text-[#A0D9CA] hover:bg-[#310603] disabled:opacity-60"
              >
                {loadingAdmin ? 'Memuat...' : 'Segarkan Data'}
              </button>
            )}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onBackPublic();
              }}
              className="hidden sm:inline-flex min-h-[44px] px-3.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] items-center hover:bg-[#310603]"
            >
              Lihat Web Publik
            </a>
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-5">
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold ${
                toast.isErr
                  ? 'bg-[#310603] border-[#F5B8CB]/60 text-[#F5B8CB]'
                  : 'bg-[#12332D] border-[#A0D9CA]/60 text-[#A0D9CA]'
              }`}
            >
              <span>{toast.msg}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Tutup notifikasi"
                className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-current/30 text-xs"
              >
                Tutup
              </button>
            </div>
          )}

          <div key={activeSection} className="aversa-panel-enter">
            {renderActiveSection()}
          </div>
        </main>
      </div>
    </div>
  );
};
