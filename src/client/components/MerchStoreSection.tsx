import React, { useState } from 'react';
import { SpotlightCard } from './reactbits/SpotlightCard.tsx';
import { ShinyText } from './reactbits/ShinyText.tsx';
import type { MerchProduct } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface MerchStoreSectionProps {
  products: MerchProduct[];
  pausedMotion?: boolean;
  onAddMerch: (product: MerchProduct, variantLabel: string, qty: number) => void;
  onBackHome?: () => void;
}

export const MerchStoreSection: React.FC<MerchStoreSectionProps> = ({
  products,
  pausedMotion = false,
  onAddMerch,
  onBackHome,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('SEMUA');
  const [selectedVariant, setSelectedVariant] = useState<Record<number, string>>({});
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const filtered =
    categoryFilter === 'SEMUA'
      ? products
      : products.filter((p) => p.category === categoryFilter);

  return (
    <section id="merch" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#310603] border border-[#F5C538]/40">
            <img src="/assets/brandkit/item-swirl-lollipop.svg" alt="" width={24} height={24} className="w-6 h-6" />
            <ShinyText
              text="Official Brand Kit Merchandise"
              disabled={pausedMotion}
              className="font-ceremonial text-xs font-bold tracking-[0.2em] uppercase"
            />
          </div>
          <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6]">
            Cendera Mata &amp; Atribut Resmi Aversa 44
          </h2>
          <p className="text-sm sm:text-base text-[#FFF5D6]/85">
            Saat memesan, tersedia pilihan{' '}
            <strong className="text-[#A0D9CA]">Ambil di Tempat (Booth SMAN 1 Gedeg)</strong> dengan QR serah terima,{' '}
            <strong className="text-[#FDF39D]">Antar Kurir Lokal Mojokerto</strong>, atau{' '}
            <strong className="text-[#F5B8CB]">Ekspedisi Reguler Luar Kota</strong>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter kategori merchandise">
          {['SEMUA', 'APPAREL', 'DRINKWARE', 'ACCESSORY', 'COLLECTIBLE'].map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#F5C538] text-[#310603]'
                  : 'bg-[#26042A] text-[#FFF5D6]/85 border border-[#F5C538]/25 hover:border-[#F5C538]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 sm:p-10 text-center space-y-3">
          <p className="text-lg font-extrabold text-[#FDF39D]">
            Tidak Ada Penjualan Merchandise Untuk Saat Ini
          </p>
          <p className="text-sm text-[#FFF5D6]/80 max-w-lg mx-auto">
            Katalog merchandise resmi AVERSA 44 sedang tidak tersedia atau belum dibuka oleh panitia. Pantau jadwal
            rilis berikutnya di halaman utama.
          </p>
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105"
            >
              Kembali ke Panggung Utama
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center space-y-3">
          <p className="text-base font-bold text-[#FDF39D]">Tidak ada produk di kategori ini</p>
          <p className="text-sm text-[#FFF5D6]/80">Silakan pilih kategori lain untuk melihat seluruh atribut Aversa 44.</p>
          <button
            type="button"
            onClick={() => setCategoryFilter('SEMUA')}
            className="min-h-[44px] px-5 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
          >
            Tampilkan Semua Produk
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((product) => {
            const variants =
              Array.isArray(product.variants_json) && product.variants_json.length > 0
                ? product.variants_json
                : ['Standar'];
            const currentVariant = selectedVariant[product.id] || variants[0];
            const currentQty = quantities[product.id] || 1;
            const outOfStock = product.stock_total <= 0;

            return (
              <SpotlightCard
                key={product.id}
                className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] hover:border-[#F5C538]/70 transition-colors"
              >
                <div>
                  <div className="relative aspect-[4/3] w-full bg-[#1A021D] overflow-hidden">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      width={480}
                      height={360}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#1A021D]/90 border border-[#F5C538]/40 text-[11px] font-bold text-[#F7D160]">
                      {product.category}
                    </span>
                    <span
                      className={`absolute top-3 right-3 px-2.5 py-1 rounded text-[11px] font-bold ${
                        outOfStock ? 'bg-[#310603] text-[#F5B8CB]' : 'bg-[#0F2F28]/95 text-[#A0D9CA]'
                      }`}
                    >
                      {outOfStock ? 'Stok Habis' : `Stok: ${product.stock_total}`}
                    </span>
                  </div>

                  <div className="p-5 space-y-2.5">
                    <h3 className="text-lg font-extrabold text-[#FFF5D6] leading-snug">{product.name}</h3>
                    <p className="text-sm font-bold text-[#F5C538]">{product.short_spec}</p>
                    <p className="text-sm text-[#FFF5D6]/90 leading-relaxed">{product.full_description.replace(/Master V6/gi, 'AVERSA 44')}</p>
                    <div className="text-xs text-[#A0D9CA] bg-[#1A021D] rounded-lg px-3 py-2 border border-[#F5C538]/15">
                      Material: {product.material_spec} ({product.weight_grams}g)
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 space-y-3 border-t border-[#F5C538]/15">
                  <div>
                    <label htmlFor={`var-${product.id}`} className="block text-sm font-bold text-[#F7D160] mb-1.5">
                      Pilih Ukuran / Varian
                    </label>
                    <select
                      id={`var-${product.id}`}
                      value={currentVariant}
                      disabled={outOfStock}
                      onChange={(e) => setSelectedVariant({ ...selectedVariant, [product.id]: e.target.value })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs font-semibold text-[#FFF5D6]"
                    >
                      {variants.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xl font-extrabold text-[#FDF39D]">{formatRupiah(product.price)}</div>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`mqty-${product.id}`} className="sr-only">
                        Jumlah {product.name}
                      </label>
                      <select
                        id={`mqty-${product.id}`}
                        value={currentQty}
                        disabled={outOfStock}
                        onChange={(e) => setQuantities({ ...quantities, [product.id]: Number(e.target.value) })}
                        className="min-h-[44px] px-2.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs font-bold text-[#FFF5D6]"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n} disabled={n > product.stock_total}>
                            {n}x
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => onAddMerch(product, currentVariant, currentQty)}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold hover:brightness-105 active:scale-[0.98]"
                      >
                        {outOfStock ? 'Habis' : 'Tambah Merch'}
                      </button>
                    </div>
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
