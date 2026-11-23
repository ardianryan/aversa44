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
  return <div className="space-y-2">
    <button type="button" onClick={() => setOpen(true)} className="min-h-[44px] rounded-xl border border-[#F5C538]/50 px-4 py-2 text-sm font-bold text-[#FDF39D]">{url ? 'Ganti Official Media Partner' : 'Unggah Official Media Partner'}</button>
    <p className="text-sm text-[#FFF5D6]/80">Satu logo bersama untuk seluruh publikasi dan livestream. Tiga sponsor pertama sesuai urutan tampil mendapat ukuran terbesar.</p>
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
  </div>;
}
