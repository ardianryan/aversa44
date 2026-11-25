import React, { useEffect, useState } from 'react';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';
import { IMAGE_INPUT_ACCEPT, normalizeImageInBrowser } from '../../lib/mediaConverter.ts';

export function MediaPartnerSettings({ onChange, onNotify }: { onChange?: (url: string) => void; onNotify: (message: string, error?: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/media-partner').then(r => { if (!r.ok) throw Error('Gagal memuat media partner.'); return r.json(); }).then(d => { if (alive) { setUrl(d.url); onChange?.(d.url); } }).catch(e => onNotify(e.message, true));
    return () => { alive = false; };
  }, [onChange, onNotify]);
  const save = async (next: string) => {
    const r = await fetch('/api/admin/media-partner', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: next }) });
    if (!r.ok) throw Error('Logo belum tersimpan. Coba lagi.');
    setUrl(next); onChange?.(next); onNotify('Official Media Partner diperbarui untuk publikasi dan livestream.');
  };
  return (
    <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {url ? (
            <div className="h-16 w-28 rounded-xl bg-[#1A021D] border border-[#F5C538]/30 p-2 flex items-center justify-center shrink-0">
              <img src={url} alt="Official Media Partner" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="h-16 w-28 rounded-xl bg-[#1A021D] border border-dashed border-[#F5C538]/30 flex items-center justify-center text-[11px] text-[#FFF5D6]/50 text-center px-2 shrink-0">
              Belum ada logo
            </div>
          )}
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2">
              <span className="text-lg font-extrabold text-[#FDF39D]">Official Media Partner</span>
              <span className="rounded-full bg-[#A0D9CA]/15 border border-[#A0D9CA]/40 px-2 py-0.5 text-[10px] font-bold text-[#A0D9CA]">
                1 Logo Bersama
              </span>
            </div>
            <p className="mt-1 text-xs text-[#FFF5D6]/80">
              Tampil di bagian bawah setiap poster, video Reels, dan overlay siaran langsung OBS.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[44px] rounded-xl bg-[#F5C538] text-[#1A021D] px-4 py-2 text-xs font-extrabold hover:bg-[#F7D160] transition-colors shrink-0"
        >
          {url ? 'Ganti Logo Mitra Media' : '+ Unggah Logo Mitra Media'}
        </button>
      </div>
    <ResponsiveSheet open={open} onClose={() => setOpen(false)} title="Official Media Partner" subtitle="Tersimpan untuk seluruh publikasi dan livestream. Unggahan baru menggantikan logo sebelumnya.">
      <div className="space-y-4">
        {url && <img src={url} alt="Pratinjau Official Media Partner" className="h-28 w-full object-contain" />}
        <label className="block space-y-2 text-sm text-[#FFF5D6]"><span>Logo media partner (maksimal 15 MB)</span><input aria-label="Logo Official Media Partner" disabled={busy} type="file" accept={IMAGE_INPUT_ACCEPT} className="block min-h-[44px] w-full rounded-lg border border-[#F5C538]/40 p-2" onChange={async e => {
          const input = e.currentTarget, file = input.files?.[0]; if (!file) return;
          setBusy(true);
          try {
            if (file.size > 15 * 1024 * 1024) throw Error('Ukuran logo maksimal 15 MB.');
            const image = await normalizeImageInBrowser(file, 1200);
            const blob = await (await fetch(image.dataUrl)).blob();
            const form = new FormData(); form.append('file', blob, 'official-media-partner.png');
            const response = await fetch('/api/admin/media/upload', { method: 'POST', body: form });
            const data = await response.json(); if (!response.ok) throw Error(data.error || 'Unggah logo gagal.');
            await save(data.url);
          } catch(e) { onNotify(e instanceof Error ? e.message : 'Logo tidak dapat dibaca.', true); }
          finally { setBusy(false); input.value = ''; }
        }} /></label>
        <p role="status" className="text-sm text-[#FFF5D6]/80">{busy ? 'Menyimpan logo...' : 'Gunakan PNG transparan. Perubahan langsung diteruskan ke siaran yang sedang terbuka.'}</p>
        <div className="flex gap-3">{url && <button disabled={busy} type="button" className="min-h-[44px] rounded-lg border border-[#F5B8CB]/50 px-4 text-[#F5B8CB]" onClick={async () => { setBusy(true); try { await save(''); } catch(e) { onNotify((e as Error).message, true); } finally { setBusy(false); } }}>Hapus logo</button>}<button disabled={busy} type="button" onClick={() => setOpen(false)} className="min-h-[44px] rounded-lg bg-[#F5C538] px-4 font-bold text-[#310603]">Selesai</button></div>
      </div>
    </ResponsiveSheet>
    </div>
  );
}
