import React, { useState } from 'react';
import { GoldenTicket3DCard } from './three/GoldenTicket3DCard.tsx';
import { SpotlightCard } from './reactbits/SpotlightCard.tsx';
import { ShinyText } from './reactbits/ShinyText.tsx';
import { CountUp } from './reactbits/CountUp.tsx';
import type { TicketTier } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface TicketingSectionProps {
  tiers: TicketTier[];
  pausedMotion: boolean;
  onAddTicket: (tier: TicketTier, qty: number) => void;
  onBackHome?: () => void;
}

export const TicketingSection: React.FC<TicketingSectionProps> = ({
  tiers,
  pausedMotion,
  onAddTicket,
  onBackHome,
}) => {
  const [previewTier, setPreviewTier] = useState<TicketTier | null>(tiers[2] || tiers[0] || null);
  const [previewName, setPreviewName] = useState<string>('');
  const [selectedQty, setSelectedQty] = useState<Record<number, number>>({});

  const activePreview = previewTier || tiers[0] || null;

  if (tiers.length === 0) {
    return (
      <section id="tiket" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-10 max-w-4xl mx-auto">
        <div className="rounded-3xl border border-[#F5C538]/35 bg-[#26042A] p-8 sm:p-12 text-center space-y-4">
          <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40">
            <img src="/assets/brandkit/item-golden-ticket-badge.svg" alt="" width={24} height={24} className="w-6 h-6" />
            <span className="font-ceremonial text-xs font-bold tracking-[0.2em] text-[#FDF39D] uppercase">
              Informasi E-Ticket
            </span>
          </div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Tidak Ada Penjualan E-Ticket Untuk Saat Ini
          </h2>
          <p className="text-sm text-[#FFF5D6]/80 max-w-lg mx-auto leading-relaxed">
            Penjualan tiket belum dibuka atau sedang ditutup sementara oleh panitia Dies Natalis ke-44 SMA Negeri 1
            Gedeg. Silakan pantau rangkaian acara terbaru di halaman utama.
          </p>
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105"
            >
              Kembali ke Panggung Utama
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="tiket" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-4">
          <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40">
            <img src="/assets/brandkit/item-golden-ticket-badge.svg" alt="" width={24} height={24} className="w-6 h-6" />
            <ShinyText
              text="Loket Resmi E-Ticketing"
              disabled={pausedMotion}
              className="font-ceremonial text-xs font-bold tracking-[0.2em] uppercase"
            />
          </div>
          <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6]">
            Pilih Kategori E-Ticket Puncak Aversa 44
          </h2>
          <p className="text-sm sm:text-base text-[#FFF5D6]/85 leading-relaxed">
            Setiap tiket yang lunas menerbitkan QR Code resmi berverifikasi digital secara instan untuk dipindai di Gate
            SMA Negeri 1 Gedeg pada 17 Desember 2026. Ketik nama Anda untuk melihat pratinjau Golden Ticket 3D.
          </p>

          <div>
            <label htmlFor="ticket-preview-name" className="block text-sm font-bold text-[#F7D160] mb-1.5">
              Coba Nama Anda di Kartu Golden Ticket 3D
            </label>
            <input
              id="ticket-preview-name"
              type="text"
              value={previewName}
              onChange={(e) => setPreviewName(e.target.value)}
              placeholder="Ketik nama lengkap Anda..."
              className="w-full max-w-md min-h-[44px] px-4 rounded-xl bg-[#26042A] border border-[#F5C538]/40 text-sm text-[#FFF5D6]"
            />
          </div>
        </div>

        <div className="lg:col-span-6">
          {activePreview ? (
            <GoldenTicket3DCard
              holderName={previewName || 'NAMA PEMEGANG TIKET'}
              tierName={activePreview.name}
              tierCategory={activePreview.category}
              seatZone={
                activePreview.category === 'VIP'
                  ? 'VIP Royal Stage Depan'
                  : activePreview.category === 'INTERNAL'
                  ? 'Zona Civitas SMAN 1 Gedeg'
                  : 'Zona Festival Utama'
              }
              paused={pausedMotion}
            />
          ) : (
            <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center text-sm text-[#FFF5D6]/80">
              Belum ada kategori tiket yang diaktifkan oleh panitia.
            </div>
          )}
        </div>
      </div>

      {tiers.length === 0 ? (
        <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center space-y-3">
          <p className="text-base font-bold text-[#FDF39D]">Kategori Tiket Belum Tersedia</p>
          <p className="text-sm text-[#FFF5D6]/80">
            Penjualan tiket gelombang berikutnya sedang disiapkan oleh panitia. Silakan lihat katalog merchandise atau agenda acara.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tiers.map((tier) => {
            const remaining = Math.max(0, tier.quota_total - tier.quota_sold);
            const soldOut = remaining <= 0;
            const isVipOrBundle = tier.category === 'VIP' || tier.category === 'BUNDLING';
            const qty = selectedQty[tier.id] || 1;
            const perks = Array.isArray(tier.perks_json) ? tier.perks_json : [];

            if (tiers.length === 0) {
    return (
      <section id="tiket" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-10 max-w-4xl mx-auto">
        <div className="rounded-3xl border border-[#F5C538]/35 bg-[#26042A] p-8 sm:p-12 text-center space-y-4">
          <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40">
            <img src="/assets/brandkit/item-golden-ticket-badge.svg" alt="" width={24} height={24} className="w-6 h-6" />
            <span className="font-ceremonial text-xs font-bold tracking-[0.2em] text-[#FDF39D] uppercase">
              Informasi E-Ticket
            </span>
          </div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Tidak Ada Penjualan E-Ticket Untuk Saat Ini
          </h2>
          <p className="text-sm text-[#FFF5D6]/80 max-w-lg mx-auto leading-relaxed">
            Penjualan tiket belum dibuka atau sedang ditutup sementara oleh panitia Dies Natalis ke-44 SMA Negeri 1
            Gedeg. Silakan pantau rangkaian acara terbaru di halaman utama.
          </p>
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105"
            >
              Kembali ke Panggung Utama
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
              <SpotlightCard
                key={tier.id}
                onMouseEnter={() => setPreviewTier(tier)}
                onFocus={() => setPreviewTier(tier)}
                className={`rounded-2xl p-5 sm:p-6 border transition-colors ${
                  isVipOrBundle
                    ? 'bg-gradient-to-br from-[#360538] via-[#410744] to-[#310603] border-[#F5C538]'
                    : 'bg-[#26042A] border-[#F5C538]/30'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded bg-[#1A021D] border border-[#F5C538]/40 font-ceremonial text-[11px] font-bold tracking-[0.15em] text-[#F7D160] uppercase">
                      {tier.category}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded ${
                        soldOut
                          ? 'bg-[#310603] text-[#F5B8CB]'
                          : remaining < 30
                          ? 'bg-[#7D1B05] text-[#FDF39D]'
                          : 'bg-[#0F2F28] text-[#A0D9CA]'
                      }`}
                    >
                      {soldOut ? (
                        'Kuota Habis'
                      ) : (
                        <>
                          Tersisa <CountUp to={remaining} /> dari {tier.quota_total}
                        </>
                      )}
                    </span>
                  </div>

                  <h3 className="text-xl font-extrabold text-[#FFF5D6]">{tier.name}</h3>
                  <p className="text-sm text-[#FFF5D6]/85 mt-1.5 leading-relaxed">{tier.description}</p>

                  {tier.requires_student_id && (
                    <div className="mt-3 rounded-lg bg-[#1A021D] border border-[#A0D9CA]/40 px-3 py-2 text-xs text-[#A0D9CA] font-semibold">
                      Khusus Internal: Membutuhkan pengisian NISN / NIP saat checkout.
                    </div>
                  )}

                  {tier.included_merch_info && (
                    <div className="mt-3 rounded-lg bg-[#310603] border border-[#F5C538]/50 px-3 py-2 text-xs text-[#FDF39D] font-semibold">
                      Termasuk Merch: {tier.included_merch_info}
                    </div>
                  )}

                  {perks.length > 0 && (
                    <ul className="mt-4 space-y-1.5 text-xs sm:text-sm text-[#FFF5D6]/90">
                      {perks.map((p, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#F5C538] font-bold" aria-hidden="true">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-[#F5C538]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    {tier.original_price && tier.original_price > tier.price && (
                      <div className="text-xs line-through text-[#F5B8CB]/80">
                        {formatRupiah(tier.original_price)}
                      </div>
                    )}
                    <div className="text-2xl font-extrabold text-[#FDF39D]">{formatRupiah(tier.price)}</div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <label htmlFor={`qty-tier-${tier.id}`} className="sr-only">
                      Jumlah tiket {tier.name}
                    </label>
                    <select
                      id={`qty-tier-${tier.id}`}
                      disabled={soldOut}
                      value={qty}
                      onChange={(e) => setSelectedQty({ ...selectedQty, [tier.id]: Number(e.target.value) })}
                      className="min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/40 text-sm font-bold text-[#FFF5D6]"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n} disabled={n > remaining}>
                          {n}x
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={soldOut}
                      onClick={() => {
                        setPreviewTier(tier);
                        onAddTicket(tier, qty);
                      }}
                      className="flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm hover:brightness-105 active:scale-[0.98]"
                    >
                      {soldOut ? 'Habis' : 'Ambil Tiket'}
                    </button>
                  </div>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </section>
  );
};
