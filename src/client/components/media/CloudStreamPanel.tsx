import React, { useEffect, useState } from 'react';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';

type StreamConfig = { configured: boolean; desired: boolean; audioConfigured: boolean; engine: string; obs: boolean; ingestHost: string; ingestUser: string };

export function CloudStreamPanel({ onNotify }: { onNotify: (message: string, error?: boolean) => void }) {
  const [config, setConfig] = useState<StreamConfig | null>(null);
  const [sheet, setSheet] = useState(false);
  const [streamKey, setStreamKey] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = async () => {
    try {
      const response = await fetch('/api/admin/cloud-stream/config');
      if (!response.ok) throw new Error();
      setConfig(await response.json());
      setFailed(false);
    } catch { setFailed(true); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, []);

  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Permintaan gagal.');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (streamKey) await request('/api/admin/cloud-stream/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ youtubeStreamKey: streamKey }) });
      if (audio) { const form = new FormData(); form.set('audio', audio); await request('/api/admin/cloud-stream/audio', { method: 'POST', body: form }); }
      setStreamKey(''); setAudio(null); setSheet(false); await refresh(); onNotify('Pengaturan siaran disimpan.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Pengaturan gagal disimpan.', true); }
    finally { setBusy(false); }
  };
  const switchState = async () => {
    if (!config) return;
    setBusy(true);
    try { await request('/api/admin/cloud-stream/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desired: !config.desired }) }); await refresh(); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Perintah gagal dikirim.', true); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 sm:p-6 space-y-4" aria-labelledby="cloud-stream-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h3 id="cloud-stream-title" className="text-lg font-bold text-[#FFF5D6]">Siaran melalui cloud</h3><p className="mt-1 text-sm text-[#FFF5D6]/80">Atur kunci YouTube dan audio cadangan untuk mesin siaran.</p></div>
      <button type="button" onClick={() => setSheet(true)} className="min-h-[44px] rounded-lg border border-[#F5C538] px-4 text-sm font-bold text-[#FDF39D]">Pengaturan siaran</button>
    </div>
    <div className="text-sm text-[#FFF5D6]" aria-live="polite">{failed ? 'Status tidak dapat dimuat. Periksa koneksi dan coba lagi.' : !config ? 'Memuat status siaran...' : `Mesin: ${config.engine === 'unavailable' ? 'belum tersedia' : config.engine}. ${config.configured ? 'Kunci YouTube tersimpan.' : 'Kunci YouTube belum diisi.'}`}</div>
    {config?.ingestHost && config.ingestUser && <div className="rounded-lg border border-[#F5C538]/30 bg-[#1A021D] p-4 text-sm text-[#FFF5D6] space-y-2">
      <p className="font-bold text-[#FDF39D]">Hubungkan OBS melalui Tailscale</p>
      <p>OBS: {config.obs ? 'sumber terhubung' : 'sumber belum terhubung'}. Sambungkan perangkat OBS ke jaringan Tailscale terlebih dahulu.</p>
      <p className="break-all">Server RTMP: <code>rtmp://{config.ingestHost}:1935/</code></p>
      <p className="break-all">Kunci OBS: <code>incoming?user={config.ingestUser}&amp;pass=KATA_SANDI_INGEST</code></p>
      <p className="break-all">Alamat SRT: <code>srt://{config.ingestHost}:8890?streamid=publish:incoming:{config.ingestUser}:KATA_SANDI_INGEST</code></p>
      <p>Gunakan kata sandi ingest yang disimpan di Portainer. Untuk menggantinya, perbarui variabel worker dan hubungkan ulang OBS.</p>
    </div>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={!config || busy || (!config.desired && (!config.configured || config.engine === 'unavailable'))} onClick={switchState} className="min-h-[44px] rounded-lg bg-[#F5C538] px-5 text-sm font-bold text-[#310603] disabled:opacity-50">{config?.desired ? 'Hentikan siaran' : 'Mulai siaran'}</button><button type="button" onClick={refresh} className="min-h-[44px] rounded-lg border border-[#F5C538]/50 px-4 text-sm text-[#FFF5D6]">Perbarui status</button></div>
    <ResponsiveSheet open={sheet} onClose={() => setSheet(false)} title="Pengaturan siaran cloud" subtitle="Simpan kunci YouTube dan pilih audio cadangan.">
      <form onSubmit={save} className="space-y-5 p-5">
        <div><label htmlFor="youtube-stream-key" className="block text-sm font-bold text-[#FDF39D]">Kunci siaran YouTube</label><input id="youtube-stream-key" type="password" autoComplete="off" value={streamKey} onChange={e => setStreamKey(e.target.value)} className="mt-2 min-h-[44px] w-full rounded-lg border border-[#F5C538]/40 bg-[#1A021D] px-3 text-[#FFF5D6]" /><p className="mt-1 text-sm text-[#FFF5D6]/80">{config?.configured ? 'Kunci sudah tersimpan. Isi hanya untuk menggantinya.' : 'Salin kunci dari YouTube Studio.'}</p></div>
        <div><label htmlFor="fallback-audio" className="block text-sm font-bold text-[#FDF39D]">Audio cadangan (WAV, maksimal 31 MB)</label><input id="fallback-audio" type="file" accept="audio/wav,.wav" disabled={config?.desired} onChange={e => setAudio(e.target.files?.[0] || null)} className="mt-2 block min-h-[44px] w-full text-sm text-[#FFF5D6] disabled:opacity-50" /><p className="text-sm text-[#FFF5D6]/80">{config?.desired ? 'Hentikan siaran untuk mengganti audio cadangan.' : config?.audioConfigured ? 'Audio cadangan sudah tersedia.' : 'Jika tidak diisi, tayangan cadangan senyap.'}</p></div>
        <button type="submit" disabled={busy || (!streamKey && !audio)} className="min-h-[44px] rounded-lg bg-[#F5C538] px-5 font-bold text-[#310603] disabled:opacity-50">Simpan pengaturan</button>
      </form>
    </ResponsiveSheet>
  </section>;
}
