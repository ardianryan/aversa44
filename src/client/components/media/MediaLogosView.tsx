import React, { useState } from 'react';
import { MediaPartnerSettings } from './MediaPartnerSettings.tsx';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';
import { ConfirmModal } from '../ui/ConfirmModal.tsx';
import type { MediaSponsor } from '../../types.ts';

export function MediaLogosView({ mediaData, onRefresh, onNotify }: { mediaData: { mediaSponsors: MediaSponsor[] }; onRefresh: () => Promise<void>; onNotify: (message: string, error?: boolean) => void }) {
  const sponsors = [...mediaData.mediaSponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sponsorSheetOpen, setSponsorSheetOpen] = useState(false);
  const [spForm, setSpForm] = useState({
    name: '',
    tier: 'GOLD',
    logo_url: '',
    boxed: false,
    sort_order: sponsors.length + 1,
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const handleUploadSponsorLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.success) {
        setSpForm((prev) => ({ ...prev, logo_url: d.url }));
        onNotify('Logo sponsor diunggah.');
      } else {
        onNotify(d.error || 'Gagal mengunggah logo.', true);
      }
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSaveSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(editingId ? `/api/admin/media-sponsors/${editingId}` : '/api/admin/media-sponsors', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spForm),
    });
    const d = await res.json();
    if (d.success) {
      setSponsorSheetOpen(false);
      setSpForm({ name: '', tier: 'GOLD', logo_url: '', boxed: false, sort_order: sponsors.length + 2 });
      onNotify('Logo sponsor ditambahkan untuk Media Studio & OBS.');
      await onRefresh();
    } else {
      onNotify(d.error || 'Gagal menyimpan sponsor.', true);
    }
  };

  const sortedSponsors = [...sponsors].sort((a, b) => a.sort_order - b.sort_order);
  const topSponsors = sortedSponsors.slice(0, 3);
  const supportingSponsors = sortedSponsors.slice(3);

  const moveSponsor = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedSponsors.length) return;
    const reordered = [...sortedSponsors];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    await Promise.all(
      reordered.map((item, idx) =>
        fetch(`/api/admin/media-sponsors/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            tier: item.tier,
            logo_url: item.logo_url,
            boxed: item.boxed,
            sort_order: idx + 1,
          }),
        }),
      ),
    );
    onNotify(`Urutan "${moved.name}" dipindahkan ke posisi #${targetIndex + 1}.`);
    await onRefresh();
  };

  const renderSponsorCard = (sp: typeof sortedSponsors[number], idx: number, isTop: boolean) => (
    <div
      key={sp.id}
      className={`rounded-xl bg-[#1A021D] p-3.5 flex flex-col gap-3 border ${
        isTop ? 'border-[#F5C538]/55 shadow-sm shadow-[#F5C538]/10' : 'border-[#F5C538]/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
            isTop
              ? 'bg-[#F5C538] text-[#1A021D]'
              : 'bg-[#26042A] text-[#FFF5D6]/80 border border-[#F5C538]/25'
          }`}
        >
          #{idx + 1} {isTop ? 'Sponsor Utama' : 'Pendukung'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => void moveSponsor(idx, -1)}
            title="Naikkan urutan"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-[#F5C538]/30 text-sm font-extrabold text-[#FDF39D] disabled:opacity-30"
          >
            &uarr;
          </button>
          <button
            type="button"
            disabled={idx === sortedSponsors.length - 1}
            onClick={() => void moveSponsor(idx, 1)}
            title="Turunkan urutan"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-[#F5C538]/30 text-sm font-extrabold text-[#FDF39D] disabled:opacity-30"
          >
            &darr;
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <img
          src={sp.logo_url}
          alt={sp.name}
          className={`h-12 w-16 object-contain shrink-0 ${sp.boxed ? 'rounded-lg bg-[#FFF5D6] p-1.5' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-[#FFF5D6] truncate">{sp.name}</div>
          <div className="text-[11px] text-[#A0D9CA]">{sp.tier} - Urutan #{idx + 1}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-[#F5C538]/15">
        <button
          type="button"
          className="flex-1 min-h-[44px] rounded-lg border border-[#F5C538]/35 px-3 text-xs font-bold text-[#FDF39D]"
          onClick={() => {
            setEditingId(sp.id);
            setSpForm({ name: sp.name, tier: sp.tier, logo_url: sp.logo_url, boxed: sp.boxed, sort_order: sp.sort_order });
            setSponsorSheetOpen(true);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() =>
            setConfirmAction({
              title: 'Hapus Logo Sponsor?',
              message: `Sponsor "${sp.name}" akan dihapus dari daftar Media Studio dan OBS.`,
              onConfirm: async () => {
                await fetch(`/api/admin/media-sponsors/${sp.id}`, { method: 'DELETE' });
                onNotify(`Sponsor "${sp.name}" dihapus.`);
                await onRefresh();
              },
            })
          }
          className="flex-1 min-h-[44px] px-3 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
        >
          Hapus
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-theatrical text-3xl text-[#FFF5D6]">Logo &amp; Mitra Media</h2>
        <p className="mt-2 text-sm text-[#FFF5D6]/80">
          Atur logo Official Media Partner dan urutan sponsor untuk seluruh poster, video Reels, dan layar siaran OBS.
        </p>
      </div>

      <MediaPartnerSettings onNotify={onNotify} />

      <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-[#FDF39D]">Daftar Logo Sponsor</h3>
            <p className="text-xs text-[#FFF5D6]/80">
              Gunakan tombol panah atas/bawah untuk mengatur urutan. 3 sponsor teratas otomatis tampil paling besar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setSpForm({ name: '', tier: 'GOLD', logo_url: '', boxed: false, sort_order: sponsors.length + 1 });
              setSponsorSheetOpen(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold shrink-0"
          >
            + Tambah Logo Sponsor
          </button>
        </div>

        {sortedSponsors.length === 0 ? (
          <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/20 p-6 text-center text-xs text-[#FFF5D6]/75">
            Belum ada logo sponsor yang ditambahkan. Klik &ldquo;+ Tambah Logo Sponsor&rdquo; untuk memulai.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#F5C538]">
                  Sponsor Utama (3 Teratas)
                </span>
                <span className="text-[11px] text-[#FFF5D6]/65">Ukuran paling besar di poster &amp; OBS</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {topSponsors.map((sp, idx) => renderSponsorCard(sp, idx, true))}
              </div>
            </div>

            {supportingSponsors.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-[#F5C538]/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#A0D9CA]">
                    Sponsor Pendukung ({supportingSponsors.length})
                  </span>
                  <span className="text-[11px] text-[#FFF5D6]/65">Tampil rapi di baris pendukung</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {supportingSponsors.map((sp, idx) => renderSponsorCard(sp, idx + 3, false))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Sponsor Sheet */}
      <ResponsiveSheet
        open={sponsorSheetOpen}
        onClose={() => setSponsorSheetOpen(false)}
        title={editingId ? "Edit Logo Sponsor" : "Tambah Logo Sponsor Acara"}
        subtitle="Mendukung unggah PNG transparan, JPG, atau WebP."
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSaveSponsor} className="space-y-4">
          <div>
            <label htmlFor="sp-m-name" className="block text-sm font-bold text-[#F7D160] mb-1">
              Nama Mitra / Sponsor *
            </label>
            <input
              id="sp-m-name"
              type="text"
              required
              value={spForm.name}
              onChange={(e) => setSpForm({ ...spForm, name: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>

          <div>
            <label htmlFor="sp-m-tier" className="block text-sm font-bold text-[#F7D160] mb-1">
              Kategori Sponsor
            </label>
            <select
              id="sp-m-tier"
              value={spForm.tier}
              onChange={(e) => setSpForm({ ...spForm, tier: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            >
              <option value="PLATINUM">Platinum Royal</option>
              <option value="GOLD">Gold Majesty</option>
              <option value="SILVER">Silver Wonder</option>
              <option value="PARTNER">Media Partner / Alumni</option>
            </select>
          </div>

          <div>
            <label htmlFor="sp-m-url" className="block text-sm font-bold text-[#F7D160] mb-1">
              URL Logo atau Unggah File *
            </label>
            <input
              id="sp-m-url"
              type="text"
              required
              value={spForm.logo_url}
              onChange={(e) => setSpForm({ ...spForm, logo_url: e.target.value })}
              placeholder="/uploads/media/..."
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
            <label className="mt-2 inline-flex min-h-[44px] px-4 py-2 rounded-xl border border-[#A0D9CA]/50 text-xs font-bold text-[#A0D9CA] items-center cursor-pointer hover:bg-[#310603]">
              {uploadingLogo ? 'Mengunggah...' : '+ Unggah File Logo Sponsor'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadSponsorLogo}
                className="sr-only"
              />
            </label>
          </div>

          <label className="block text-sm text-[#FFF5D6]">Urutan tampil (tiga pertama paling besar)<input aria-label="Urutan tampil" type="number" required value={spForm.sort_order} onChange={e => setSpForm({ ...spForm, sort_order: Number(e.target.value) })} className="mt-2 block w-full min-h-[44px] rounded-lg border border-[#F5C538]/35 bg-[#1A021D] px-3" /></label>
          <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#FFF5D6]">
            <input
              type="checkbox"
              checked={spForm.boxed}
              onChange={(e) => setSpForm({ ...spForm, boxed: e.target.checked })}
              className="w-4 h-4 accent-[#F5C538]"
            />
            Beri Latar Krem (jika logo berwarna gelap)
          </label>

          <button
            type="submit"
            className="w-full min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
          >
            Simpan Logo Sponsor
          </button>
        </form>
      </ResponsiveSheet>

      <ConfirmModal
        open={Boolean(confirmAction)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirmBusy(true);
          try {
            await confirmAction.onConfirm();
            setConfirmAction(null);
          } finally {
            setConfirmBusy(false);
          }
        }}
        busy={confirmBusy}
        title={confirmAction?.title || 'Konfirmasi'}
        message={confirmAction?.message || ''}
      />
    </div>
  );
}
