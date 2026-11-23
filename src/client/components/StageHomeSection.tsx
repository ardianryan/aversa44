import { SceneMotion } from './motion/SceneMotion.tsx';
import React, { useEffect, useState } from 'react';
import { ResponsiveSheet } from './ui/ResponsiveSheet.tsx';
import { AversaHeroStage3D } from './three/AversaHeroStage3D.tsx';
import { AnimatedTheaterCurtain } from './AnimatedTheaterCurtain.tsx';
import { AuroraBackground } from './reactbits/AuroraBackground.tsx';
import { ShinyText } from './reactbits/ShinyText.tsx';
import { SplitText } from './reactbits/SplitText.tsx';
import { GradientText } from './reactbits/GradientText.tsx';
import { SpotlightCard } from './reactbits/SpotlightCard.tsx';
import { TiltedCard } from './reactbits/TiltedCard.tsx';
import { StarBorder } from './reactbits/StarBorder.tsx';
import { Magnet } from './reactbits/Magnet.tsx';
import type { CatalogResponse, TimelineEvent } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface StageHomeSectionProps {
  catalog: CatalogResponse;
  pausedMotion: boolean;
  onToggleMotion: () => void;
  pointerX: number;
  pointerY: number;
  reducedMotion: boolean;
  onNavigateTickets: () => void;
  onNavigateMerch: () => void;
}

const ANATOMY_ITEMS = [
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
];

export const StageHomeSection: React.FC<StageHomeSectionProps> = ({
  catalog,
  pausedMotion,
  onToggleMotion,
  pointerX,
  pointerY,
  reducedMotion,
  onNavigateTickets,
  onNavigateMerch,
}) => {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [timelineFilter, setTimelineFilter] = useState<string>('SEMUA');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const anatomyList = catalog.eventMeta.anatomyItems?.length
    ? catalog.eventMeta.anatomyItems
    : ANATOMY_ITEMS;
  const [activeAnatomyId, setActiveAnatomyId] = useState<string>(anatomyList[0]?.id || 'all');
  const activeAnatomy = anatomyList.find((item) => item.id === activeAnatomyId) || anatomyList[0];
  const [curtainsClosed, setCurtainsClosed] = useState(false);

  const [sponsorForm, setSponsorForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    tierInterest: 'GOLD_MAJESTY',
    message: '',
  });
  const [sponsorStatus, setSponsorStatus] = useState<{
    type: 'idle' | 'submitting' | 'success' | 'error';
    msg: string;
  }>({
    type: 'idle',
    msg: '',
  });

  useEffect(() => {
    const targetTime = new Date(catalog.eventMeta.peakDateIso).getTime();
    const updateTimer = () => {
      const diff = Math.max(0, targetTime - Date.now());
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      });
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [catalog.eventMeta.peakDateIso]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEvent) {
        setSelectedEvent(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEvent]);

  const timelineCategories = Array.from(
    new Set(['SEMUA', ...catalog.timeline.map((ev) => ev.category).filter(Boolean)])
  );
  const filteredTimeline =
    timelineFilter === 'SEMUA'
      ? catalog.timeline
      : catalog.timeline.filter((ev) => ev.category === timelineFilter);

  const handleSponsorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSponsorStatus({ type: 'submitting', msg: 'Mengirim pengajuan kemitraan...' });
    try {
      const res = await fetch('/api/sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sponsorForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengirim pengajuan sponsor.');
      }
      const picSummary = catalog.eventMeta.sponsorshipContacts.map((c) => c.name).join(' & ');
      setSponsorStatus({
        type: 'success',
        msg: `Terima kasih! Proposal minat sponsorship Anda telah tercatat untuk ditindaklanjuti ${picSummary || 'Tim Sponsorship AVERSA 44'}.`,
      });
      setSponsorForm({
        companyName: '',
        contactPerson: '',
        phone: '',
        email: '',
        tierInterest: 'GOLD_MAJESTY',
        message: '',
      });
    } catch (err: any) {
      setSponsorStatus({ type: 'error', msg: err?.message || 'Terjadi kesalahan saat mengirim.' });
    }
  };

  const hasActiveTickets = catalog.ticketTiers.length > 0;
  const hasSellableTickets = catalog.ticketTiers.some((t) => t.quota_total - t.quota_sold > 0);
  const hasActiveMerch = catalog.merchProducts.length > 0;
  const hasSellableMerch = catalog.merchProducts.some((m) => m.stock_total > 0);

  const minTicketPrice = catalog.ticketTiers.length
    ? Math.min(...catalog.ticketTiers.map((t) => t.price))
    : 35000;

  const motionOff = pausedMotion || reducedMotion;

  return (
    <SceneMotion observe disabled={motionOff} className="relative overflow-x-clip">
      {/* SECTION 1: HERO THEATRICAL STAGE WITH REBUILT ANIMATED CURTAINS, REACTBITS & CENTERED 3D EMBLEM */}
      <section
        aria-label="Panggung Utama AVERSA 44"
        className="relative min-h-[calc(100dvh-72px)] flex flex-col justify-center pt-28 sm:pt-24 lg:pt-24 pb-10 px-6 sm:px-20 lg:px-28 bg-[radial-gradient(circle_at_50%_32%,#58065B_0%,#360538_50%,#1A021D_100%)]"
      >
        {/* ReactBits Aurora Stage Wash */}
        <AuroraBackground paused={motionOff} />

        {/* Subtle Rotating Swirl Backdrop */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src="/assets/brandkit/hypnotic-swirl-disc.svg"
            alt=""
            width={920}
            height={920}
            className="parallax-swirl-spin absolute -top-16 left-1/2 -translate-x-1/2 w-[540px] sm:w-[820px] opacity-15 mix-blend-screen"
          />
          <img
            src="/assets/brandkit/floating-magic-ribbons.svg"
            alt=""
            width={800}
            height={300}
            className="parallax-layer-mid absolute bottom-0 right-10 w-64 sm:w-[420px] opacity-25"
          />
        </div>

        {/* Rebuilt Multi-Layer Animated Theater Curtain System */}
        <AnimatedTheaterCurtain paused={motionOff} curtainsClosed={curtainsClosed} />

        {/* Always-Accessible Curtain Control above z-20 Stage Curtains */}
        <button
          type="button"
          onClick={() => setCurtainsClosed((c) => !c)}
          className="absolute top-[56px] sm:top-[82px] right-4 sm:right-16 lg:right-28 z-30 min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#220519]/95 border border-[#F5C538]/55 text-[11px] font-bold text-[#F5B8CB] hover:border-[#F5C538] transition-colors shadow-lg"
        >
          {curtainsClosed ? 'Buka Tirai Panggung' : 'Tutup Tirai'}
        </button>

        {/* Proscenium Stage Content (safely framed inside the curtains) */}
        <div className="relative z-10 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left Column: Editorial Stage Copy & ReactBits CTAs */}
          <div className="lg:col-span-7 text-center lg:text-left space-y-3.5">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
              <StarBorder disabled={motionOff} color="#F5C538" speed="5s">
                <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-[10px] bg-[#220519]/95">
                  <img
                    src="/assets/extracted/logo-sman1gedeg.png"
                    alt="Logo SMA Negeri 1 Gedeg"
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain shrink-0"
                  />
                  <ShinyText
                    text={catalog.eventMeta.heroBadgeText || `${catalog.eventMeta.school} • ${catalog.eventMeta.era}`}
                    disabled={motionOff}
                    speed={4}
                    className="font-ceremonial text-[10px] sm:text-xs font-bold tracking-[0.14em] uppercase whitespace-nowrap"
                  />
                </div>
              </StarBorder>
            </div>

            <div className="flex justify-center lg:justify-start">
              <img
                src="/assets/png/aversa-logotype-horizontal.png"
                alt="AVERSA Logotype Resmi Dies Natalis 44"
                width={340}
                height={100}
                className="w-52 sm:w-64 lg:w-72 h-auto object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.6)]"
              />
            </div>

            <h1 className="font-theatrical font-extrabold text-[clamp(2rem,4.4vw,3.45rem)] leading-[1.12] text-[#FFF5D6]">
              <SplitText
                text={catalog.eventMeta.heroTitlePrefix || catalog.eventMeta.edition}
                reducedMotion={motionOff}
              />{' '}
              <GradientText disabled={motionOff} animationSpeed={7} className="block sm:inline">
                {catalog.eventMeta.heroTitleHighlight || 'Action, Compassion, Celebration'}
              </GradientText>
            </h1>

            <p className="text-sm sm:text-base font-bold text-[#FDF39D] max-w-xl mx-auto lg:mx-0">Satukan Energi di Lapangan, Tebar Kebaikan, Rayakan Kebersamaan</p>

            <p className="text-[clamp(0.95rem,1.35vw,1.1rem)] text-[#FFF5D6]/90 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {catalog.eventMeta.heroDescription ||
                `Perayaan puncak 44 tahun ${catalog.eventMeta.school} pada ${catalog.eventMeta.peakDateLabel}. Pesan E-Ticket resmi dan koleksi merchandise eksklusif AVERSA 44 di sini.`}
            </p>

            {/* Primary Specific CTAs (smart-hidden when tickets/merch are not on sale) */}
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start pt-1">
              {hasActiveTickets && (
                <Magnet disabled={motionOff} magnetStrength={7}>
                  <StarBorder disabled={motionOff} color="#FDF39D" speed="4.5s">
                    <button
                      type="button"
                      onClick={onNavigateTickets}
                      className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-[11px] bg-gradient-to-r from-[#E09D17] via-[#F5C538] to-[#F7D160] text-[#310603] font-extrabold text-sm sm:text-base hover:brightness-105 active:scale-[0.98] transition-all"
                    >
                      {hasSellableTickets
                        ? `Ambil E-Ticket Mulai ${formatRupiah(minTicketPrice)}`
                        : 'Cek Status E-Ticket (Habis)'}
                    </button>
                  </StarBorder>
                </Magnet>
              )}

              {hasActiveMerch && (
                <Magnet disabled={motionOff} magnetStrength={9}>
                  <button
                    type="button"
                    onClick={onNavigateMerch}
                    className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-[#220519]/90 border-2 border-[#F5C538]/60 text-[#FDF39D] font-bold text-sm sm:text-base hover:bg-[#310603] hover:border-[#F5C538] active:scale-[0.98] transition-all"
                  >
                    {hasSellableMerch ? 'Pesan Official Merch' : 'Lihat Katalog Merch'}
                  </button>
                </Magnet>
              )}

              {!hasActiveTickets && !hasActiveMerch && (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#220519]/90 border border-[#F5C538]/40 text-xs sm:text-sm font-semibold text-[#F7D160] flex items-center">
                    Penjualan tiket &amp; merchandise belum dibuka untuk saat ini.
                  </div>
                  <button
                    type="button"
                    onClick={() => document.getElementById('rangkaian')?.scrollIntoView({ behavior: motionOff ? 'auto' : 'smooth' })}
                    className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#E09D17] via-[#F5C538] to-[#F7D160] text-[#310603] font-extrabold text-sm hover:brightness-105 transition-all"
                  >
                    Lihat Rangkaian Acara
                  </button>
                </div>
              )}
            </div>

            {/* Real Countdown Timer toward Peak Date */}
            <div className="pt-2">
              <p className="font-ceremonial text-[11px] font-bold tracking-[0.2em] text-[#A0D9CA] uppercase mb-2.5">
                Menuju Puncak Aversa • {catalog.eventMeta.peakDateLabel}
              </p>
              <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md mx-auto lg:mx-0">
                {[
                  { label: 'Hari', val: countdown.days },
                  { label: 'Jam', val: countdown.hours },
                  { label: 'Menit', val: countdown.mins },
                  { label: 'Detik', val: countdown.secs },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="rounded-xl bg-[#220519]/95 border border-[#F5C538]/30 py-2.5 px-2 text-center shadow-inner"
                  >
                    <div className="text-xl sm:text-2xl font-extrabold text-[#FDF39D] tabular-nums">
                      {String(unit.val).padStart(2, '0')}
                    </div>
                    <div className="text-[11px] font-medium text-[#F5B8CB] uppercase tracking-wider">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Centered 3D Emblem Stage wrapped in ReactBits TiltedCard */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <TiltedCard
              disabled={motionOff}
              rotateAmplitude={6}
              scaleOnHover={1.015}
              className="w-full max-w-md rounded-3xl border border-[#F5C538]/35 bg-[#18021B]/80 p-3 sm:p-5 shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
            >
              <AversaHeroStage3D
                paused={pausedMotion}
                onTogglePause={onToggleMotion}
                pointerX={pointerX}
                pointerY={pointerY}
                reducedMotion={reducedMotion}
              />
              <div className="mt-2 flex items-center justify-between gap-3 px-2 pt-2.5 border-t border-[#F5C538]/20 text-xs text-[#F7D160]">
                <span>Patung 3D Lambang AVERSA 44</span>
                <span className="text-[#A0D9CA] font-semibold">Geser untuk memutar</span>
              </div>
            </TiltedCard>
          </div>
        </div>
      </section>

      {/* SECTION 2: GUEST STAR SPOTLIGHT (ASYMMETRIC STAGE SHOWCASE from 3.svg) */}
      <section
        id="bintang-tamu"
        className="relative py-16 sm:py-24 px-4 sm:px-6 lg:px-10 bg-[#250428] border-y border-[#F5C538]/25"
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-5 space-y-5 text-center lg:text-left">
            <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40">
              <img src="/assets/brandkit/item-magic-top-hat.svg" alt="" width={24} height={24} className="w-6 h-6" />
              <ShinyText
                text={`Puncak Aversa • ${catalog.eventMeta.peakDateLabel}`}
                disabled={motionOff}
                className="font-ceremonial text-xs font-bold tracking-[0.2em] uppercase"
              />
            </div>

            <div className="flex justify-center lg:justify-start">
              <img
                src="/assets/extracted/guest-title-gold.png"
                alt={`Menampilkan Bintang Tamu ${catalog.eventMeta.guestStar1Name} dan ${catalog.eventMeta.guestStar2Name}`}
                width={420}
                height={260}
                className="w-64 sm:w-80 h-auto object-contain"
              />
            </div>

            <p className="text-[#FFF5D6]/90 text-sm sm:text-base leading-relaxed">
              {catalog.eventMeta.guestStarDescription ? (
                <>
                  {catalog.eventMeta.guestStarDescription}{' '}
                  <strong className="text-[#FDF39D]">{catalog.eventMeta.guestStar1Name}</strong> &amp;{' '}
                  <strong className="text-[#FDF39D]">{catalog.eventMeta.guestStar2Name}</strong>.
                </>
              ) : (
                <>
                  Malam puncak perayaan Dies Natalis ke-44 {catalog.eventMeta.school} bersama{' '}
                  <strong className="text-[#FDF39D]">{catalog.eventMeta.guestStar1Name}</strong> dan ensambel{' '}
                  <strong className="text-[#FDF39D]">{catalog.eventMeta.guestStar2Name}</strong>.
                </>
              )}
            </p>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-1">
              <div className="rounded-xl bg-[#1A021D] border border-[#A0D9CA]/40 px-4 py-2.5 text-left">
                <div className="text-[11px] uppercase tracking-wider text-[#A0D9CA] font-semibold">Lokasi Panggung</div>
                <div className="text-sm font-bold text-[#FFF5D6]">
                  {catalog.eventMeta.guestStarVenue || `Lapangan Tengah ${catalog.eventMeta.school}`}
                </div>
              </div>
              <div className="rounded-xl bg-[#1A021D] border border-[#F5B8CB]/40 px-4 py-2.5 text-left">
                <div className="text-[11px] uppercase tracking-wider text-[#F5B8CB] font-semibold">Akses Masuk</div>
                <div className="text-sm font-bold text-[#FFF5D6]">
                  {catalog.eventMeta.guestStarAccessNote || 'E-Ticket QR Terenkripsi'}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 relative">
            <SpotlightCard className="rounded-3xl bg-gradient-to-br from-[#360538] via-[#4A064D] to-[#1A021D] border border-[#F5C538]/40 p-4 sm:p-6">
              <img
                src="/assets/brandkit/golden-stardust-arc-swoosh.png"
                alt=""
                width={600}
                height={600}
                className="pointer-events-none absolute -right-12 -top-10 w-80 opacity-45"
              />
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end relative z-10">
                <div className="sm:col-span-5 flex flex-col items-center">
                  <img
                    src="/assets/extracted/guest-niken-salindry.png"
                    alt={`${catalog.eventMeta.guestStar1Name} Bintang Tamu Aversa 44`}
                    width={360}
                    height={390}
                    className="w-52 sm:w-full max-w-[260px] h-auto object-contain drop-shadow-[0_12px_25px_rgba(0,0,0,0.65)]"
                  />
                  <span className="mt-2 font-ceremonial text-xs font-bold tracking-[0.18em] text-[#FDF39D] uppercase">
                    {catalog.eventMeta.guestStar1Name}
                  </span>
                </div>
                <div className="sm:col-span-7 flex flex-col items-center">
                  <img
                    src="/assets/extracted/guest-kembange-jagad.png"
                    alt={`Ensambel ${catalog.eventMeta.guestStar2Name}`}
                    width={520}
                    height={220}
                    className="w-full h-auto object-contain drop-shadow-[0_12px_25px_rgba(0,0,0,0.65)]"
                  />
                  <span className="mt-2 font-ceremonial text-xs font-bold tracking-[0.18em] text-[#F5B8CB] uppercase">
                    {catalog.eventMeta.guestStar2Name}
                  </span>
                </div>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* SECTION 3: RANGKAIAN ACARA & TIMELINE INTERAKTIF (from 5.svg) */}
      <section id="rangkaian" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-10 bg-[#1A021D]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="font-ceremonial text-xs font-bold tracking-[0.22em] text-[#F5C538] uppercase">
                Kalender Resmi Kegiatan
              </p>
              <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6] mt-1">
                Rangkaian Acara Dies Natalis ke-44
              </h2>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter kategori acara">
              {timelineCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={timelineFilter === cat}
                  onClick={() => setTimelineFilter(cat)}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    timelineFilter === cat
                      ? 'bg-[#F5C538] text-[#310603]'
                      : 'bg-[#2A042E] text-[#FFF5D6]/85 border border-[#F5C538]/25 hover:border-[#F5C538]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="relative space-y-5 before:hidden sm:before:block before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-[#F5C538]/35">
            {filteredTimeline.map((ev, index) => {
              const isPeak = ev.category === 'PUNCAK ACARA';
              return (
                <article key={ev.id} className="relative sm:pl-16">
                  <div
                    aria-hidden="true"
                    className="hidden sm:flex absolute left-2 top-6 z-20 w-8 h-8 rounded-full bg-[#F5C538] text-[#310603] font-extrabold text-sm items-center justify-center"
                  >
                    {index + 1}
                  </div>
                  <SpotlightCard
                    className={`rounded-2xl p-5 sm:p-6 border transition-colors ${
                      isPeak
                        ? 'bg-gradient-to-r from-[#360538] via-[#4A084E] to-[#310603] border-[#F5C538]'
                        : 'bg-[#26042A] border-[#F5C538]/25 hover:border-[#F5C538]/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <span className="inline-block w-fit px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40 text-xs font-bold text-[#F7D160]">
                        {ev.date_label}
                      </span>
                      <span className="text-xs font-semibold text-[#A0D9CA]">{ev.venue}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-[#FFF5D6]">{ev.title}</h3>
                    <p className="text-sm font-semibold text-[#F5B8CB] mt-0.5">{ev.subtitle}</p>
                    <p className="text-sm text-[#FFF5D6]/85 mt-2 leading-relaxed">{ev.description}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(ev)}
                        className="min-h-[44px] px-4 py-2 rounded-lg border border-[#F5C538]/50 text-xs font-bold text-[#FDF39D] hover:bg-[#F5C538] hover:text-[#310603] transition-colors"
                      >
                        Lihat Detail Kegiatan
                      </button>
                      {ev.cta_target === 'tickets' && hasActiveTickets && (
                        <button
                          type="button"
                          onClick={onNavigateTickets}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105"
                        >
                          {ev.cta_label}
                        </button>
                      )}
                      {ev.cta_target === 'merch' && hasActiveMerch && (
                        <button
                          type="button"
                          onClick={onNavigateMerch}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold hover:brightness-105"
                        >
                          {ev.cta_label}
                        </button>
                      )}
                    </div>
                  </SpotlightCard>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 4: MUSEUM ANATOMI LAMBANG V6 & TIM KREATIF */}
      <section id="filosofi" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-10 bg-[#250428] border-t border-[#F5C538]/20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-10">
            <p className="font-ceremonial text-xs font-bold tracking-[0.22em] text-[#F5C538] uppercase">
              Identitas Visual Resmi
            </p>
            <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6] mt-1">
              Anatomi, Filosofi &amp; Kreator Lambang Aversa 44
            </h2>
            <p className="text-sm sm:text-base text-[#FFF5D6]/85 mt-2">
              Empat pilar tema AVERSA: terus berkembang (Continuous Growth), memiliki visi yang jelas (Clear Vision),
              membangun solidaritas (Unwavering Solidarity), serta berani bertindak nyata (Courage to Act).
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-2.5">
              {anatomyList.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveAnatomyId(item.id)}
                  className={`w-full text-left min-h-[48px] px-4 py-3 rounded-xl border transition-all ${
                    activeAnatomy?.id === item.id
                      ? 'bg-[#310603] border-[#F5C538] text-[#FDF39D]'
                      : 'bg-[#1A021D]/75 border-[#F5C538]/20 text-[#FFF5D6]/85 hover:border-[#F5C538]/60'
                  }`}
                >
                  <div className="text-xs font-bold text-[#F5C538] uppercase tracking-wider">{item.label}</div>
                  <div className="text-sm font-bold mt-0.5">{item.title}</div>
                </button>
              ))}
            </div>

            {activeAnatomy && (
              <SpotlightCard className="lg:col-span-7 rounded-2xl border border-[#F5C538]/35 bg-[#1A021D] p-4 sm:p-6">
                <div className="aspect-[16/10] w-full rounded-xl overflow-hidden bg-[#120114] border border-[#F5C538]/20 flex items-center justify-center">
                  <img
                    src={activeAnatomy.image}
                    alt={activeAnatomy.title}
                    width={900}
                    height={560}
                    className="w-full h-full object-contain"
                  />
                </div>
                <h3 className="text-xl font-extrabold text-[#FDF39D] mt-4">{activeAnatomy.title}</h3>
                <p className="text-sm sm:text-base text-[#FFF5D6]/90 mt-1.5 leading-relaxed">{activeAnatomy.desc}</p>
              </SpotlightCard>
            )}
          </div>

          <div className="mt-12 rounded-2xl border border-[#F5C538]/30 bg-[#1A021D]/90 p-5 sm:p-6">
            <h3 className="font-ceremonial text-sm font-bold tracking-[0.18em] text-[#F7D160] uppercase mb-4">
              Tim Kreatif &amp; Atribusi Karya Asli SMAN 1 Gedeg
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {catalog.eventMeta.creativeCredits.map((credit, idx) => (
                <SpotlightCard key={idx} className="rounded-xl bg-[#26042A] border border-[#F5C538]/20 p-3.5">
                  <div className="text-xs font-semibold text-[#A0D9CA]">{credit.affiliation}</div>
                  <div className="text-sm font-extrabold text-[#FFF5D6] mt-0.5">{credit.name}</div>
                  <div className="text-xs text-[#FFF5D6]/75 mt-1">{credit.role}</div>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: PORTAL OPEN FOR SPONSORSHIP */}
      <section id="sponsorship" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-10 bg-[#1A021D] border-t border-[#F5C538]/25">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-5">
            <p className="font-ceremonial text-xs font-bold tracking-[0.22em] text-[#F5C538] uppercase">
              Open For Sponsorship
            </p>
            <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6]">
              {catalog.eventMeta.sponsorshipHeadline || `Bermitra Bersama Perayaan 44 Tahun ${catalog.eventMeta.school}`}
            </h2>
            <p className="text-sm sm:text-base text-[#FFF5D6]/85 leading-relaxed">
              {catalog.eventMeta.sponsorshipDescription ||
                'Kami membuka kesempatan bagi perusahaan, instansi, UMKM, dan alumni untuk menjalin kemitraan sponsorship dan stan bazar pada rangkaian Dies Natalis ke-44 AVERSA.'}
            </p>

            <button type="button" onClick={() => setProposalOpen(true)} className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#F5C538]/70 text-sm font-bold text-[#FDF39D] hover:bg-[#310603]">
              Lihat Proposal Kemitraan
            </button>

            <div className="space-y-3">
              {catalog.eventMeta.sponsorshipContacts.map((cp) => (
                <a
                  key={cp.whatsapp}
                  href={`https://wa.me/${cp.whatsapp}?text=${encodeURIComponent(
                    'Halo Panitia AVERSA 44 SMAN 1 Gedeg, kami tertarik menjadi mitra sponsorship.'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 min-h-[56px] p-4 rounded-xl bg-[#26042A] border border-[#F5C538]/35 hover:border-[#F5C538] transition-colors"
                >
                  <div>
                    <div className="text-sm font-extrabold text-[#FDF39D]">{cp.name}</div>
                    <div className="text-xs text-[#FFF5D6]/80">{cp.role}</div>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold shrink-0">
                    WA {cp.phoneDisplay}
                  </span>
                </a>
              ))}
            </div>
          </div>

          <SpotlightCard className="lg:col-span-7 rounded-2xl border border-[#F5C538]/35 bg-[#250428] p-5 sm:p-7">
            <form onSubmit={handleSponsorSubmit} className="space-y-4">
              <h3 className="text-xl font-extrabold text-[#FFF5D6]">Formulir Minat Kemitraan &amp; Sponsor</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sp-company" className="block text-xs font-bold text-[#F7D160] mb-1.5">
                    Nama Instansi / Brand / Alumni *
                  </label>
                  <input
                    id="sp-company"
                    type="text"
                    required
                    value={sponsorForm.companyName}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, companyName: e.target.value })}
                    placeholder="Contoh: Bank Jatim / UMKM Gedeg"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
                <div>
                  <label htmlFor="sp-pic" className="block text-xs font-bold text-[#F7D160] mb-1.5">
                    Nama Narahubung (PIC) *
                  </label>
                  <input
                    id="sp-pic"
                    type="text"
                    required
                    value={sponsorForm.contactPerson}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contactPerson: e.target.value })}
                    placeholder="Nama lengkap penanggung jawab"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sp-phone" className="block text-xs font-bold text-[#F7D160] mb-1.5">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input
                    id="sp-phone"
                    type="tel"
                    required
                    value={sponsorForm.phone}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, phone: e.target.value })}
                    placeholder="0812xxxxxxxx"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
                <div>
                  <label htmlFor="sp-tier" className="block text-xs font-bold text-[#F7D160] mb-1.5">
                    Pilihan Paket Kemitraan *
                  </label>
                  <select
                    id="sp-tier"
                    value={sponsorForm.tierInterest}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, tierInterest: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  >
                    <option value="PLATINUM_ROYAL">Sponsor Utama (Platinum Royal)</option>
                    <option value="GOLD_MAJESTY">Sponsor Gold Majesty</option>
                    <option value="SILVER_WONDER">Sponsor Silver Wonder</option>
                    <option value="UMKM_BAZAAR">Tenant Bazar Kuliner &amp; UMKM</option>
                    <option value="ALUMNI_DONOR">Donasi Alumni Lintas Angkatan</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="sp-msg" className="block text-xs font-bold text-[#F7D160] mb-1.5">
                  Pesan / Bentuk Dukungan *
                </label>
                <textarea
                  id="sp-msg"
                  rows={3}
                  required
                  value={sponsorForm.message}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, message: e.target.value })}
                  placeholder="Tuliskan kebutuhan proposal, stan bazar, atau jadwal diskusi..."
                  className="w-full p-3.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                />
              </div>

              {sponsorStatus.msg && (
                <div
                  role="status"
                  className={`p-3 rounded-lg text-xs font-semibold border ${
                    sponsorStatus.type === 'success'
                      ? 'bg-[#0F2F28] border-[#A0D9CA] text-[#A0D9CA]'
                      : sponsorStatus.type === 'error'
                      ? 'bg-[#310603] border-[#F5B8CB] text-[#F5B8CB]'
                      : 'bg-[#1A021D] border-[#F5C538]/40 text-[#FDF39D]'
                  }`}
                >
                  {sponsorStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={sponsorStatus.type === 'submitting'}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm hover:brightness-105"
              >
                {sponsorStatus.type === 'submitting' ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan Sponsorship'}
              </button>
            </form>
          </SpotlightCard>
        </div>
      </section>

      <ResponsiveSheet open={proposalOpen} onClose={() => setProposalOpen(false)} title="Proposal Kemitraan AVERSA 44" subtitle="Salinan untuk peninjauan mitra" maxWidthClass="md:max-w-3xl">
        <p className="text-sm text-[#FFF5D6]/85">Pelajari rencana kegiatan dan pilihan kerja sama. Area tanda tangan pada salinan ini diberi tanda air.</p>
        <a href="/assets/documents/proposal-aversa44-mitra.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#F5C538] px-4 text-sm font-bold text-[#310603]">Buka atau Unduh Proposal</a>
        <iframe title="Pratinjau proposal kemitraan AVERSA 44" src="/assets/documents/proposal-aversa44-mitra.pdf#view=FitH" className="w-full h-[65dvh] min-h-[320px] rounded-xl border border-[#F5C538]/35 bg-[#FFF5D6]" />
      </ResponsiveSheet>
      <ResponsiveSheet
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title || 'Detail Kegiatan'}
        subtitle={selectedEvent?.date_label}
        maxWidthClass="md:max-w-lg"
      >
        {selectedEvent && (
          <div className="space-y-4">
            <span className="inline-block px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40 text-xs font-bold text-[#F5C538]">
              {selectedEvent.category}
            </span>
            <p className="text-sm font-semibold text-[#F5B8CB]">{selectedEvent.subtitle}</p>
            <p className="text-sm text-[#FFF5D6]/90 leading-relaxed">{selectedEvent.description}</p>
            <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/25 p-3.5 text-xs text-[#A0D9CA]">
              Lokasi: {selectedEvent.venue}
            </div>
            {selectedEvent.cta_target === 'tickets' && hasActiveTickets && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEvent(null);
                  onNavigateTickets();
                }}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105"
              >
                {selectedEvent.cta_label}
              </button>
            )}
            {selectedEvent.cta_target === 'merch' && hasActiveMerch && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEvent(null);
                  onNavigateMerch();
                }}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold hover:brightness-105"
              >
                {selectedEvent.cta_label}
              </button>
            )}
          </div>
        )}
      </ResponsiveSheet>
    </SceneMotion>
  );
};
