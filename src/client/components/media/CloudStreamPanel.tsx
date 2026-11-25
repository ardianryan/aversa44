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
  const copyText = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    onNotify(`${label} berhasil disalin.`);
  };

  return <section className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 sm:p-6 space-y-5" aria-labelledby="cloud-stream-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="cloud-stream-title" className="text-lg font-extrabold text-[#FDF39D]">Mesin Siaran Cloud</h3>
          {config && (
            <>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${config.desired ? 'bg-[#7D1B05] text-[#FFF5D6]' : 'bg-[#1A021D] border border-[#A0D9CA]/40 text-[#A0D9CA]'}`}>
                {config.desired ? 'ON AIR' : 'SIAP'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${config.obs ? 'bg-[#A0D9CA]/20 text-[#A0D9CA]' : 'bg-[#1A021D] text-[#FFF5D6]/65'}`}>
                {config.obs ? 'OBS Terhubung' : 'OBS Belum Terhubung'}
              </span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs sm:text-sm text-[#FFF5D6]/80">Atur kunci YouTube dan audio cadangan untuk menjaga siaran tetap aman saat koneksi OBS terputus.</p>
      </div>
      <button type="button" onClick={() => setSheet(true)} className="min-h-[44px] rounded-xl border border-[#F5C538] px-4 text-xs sm:text-sm font-bold text-[#FDF39D] shrink-0">Pengaturan Kunci &amp; Audio</button>
    </div>

    <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/25 p-3.5 text-xs sm:text-sm text-[#FFF5D6]" aria-live="polite">
      {failed
        ? 'Status tidak dapat dimuat. Periksa koneksi dan coba lagi.'
        : !config
          ? 'Memuat status siaran...'
          : `Status Mesin: ${config.engine === 'unavailable' ? 'Belum tersedia' : config.engine} - ${config.configured ? 'Kunci YouTube sudah tersimpan.' : 'Kunci YouTube belum diisi.'}`}
    </div>

    {config?.ingestHost && config.ingestUser && <div className="rounded-xl border border-[#F5C538]/30 bg-[#1A021D] p-4 text-xs sm:text-sm text-[#FFF5D6] space-y-3">
      <div>
        <p className="font-extrabold text-[#FDF39D]">Hubungkan OBS ke Mesin Siaran</p>
        <p className="text-xs text-[#FFF5D6]/75 mt-0.5">Pastikan laptop OBS sudah terhubung ke jaringan privat siaran, lalu salin alamat di bawah ke menu Settings &gt; Stream di OBS.</p>
      </div>
      {[
        { label: 'Server RTMP', value: `rtmp://${config.ingestHost}:1935/` },
        { label: 'Kunci OBS', value: `incoming?user=${config.ingestUser}&pass=KATA_SANDI_INGEST` },
        { label: 'Alamat SRT', value: `srt://${config.ingestHost}:8890?streamid=publish:incoming:${config.ingestUser}:KATA_SANDI_INGEST` },
      ].map((item) => (
        <div key={item.label} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-[#120114] border border-[#F5C538]/15 p-2.5">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#A0D9CA]">{item.label}</div>
            <code className="text-xs text-[#FFF5D6] break-all">{item.value}</code>
          </div>
          <button
            type="button"
            onClick={() => copyText(item.label, item.value)}
            className="min-h-[44px] px-3.5 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] shrink-0"
          >
            Salin
          </button>
        </div>
      ))}
      <p className="text-[11px] text-[#FFF5D6]/70">Ganti tulisan <code className="text-[#FDF39D]">KATA_SANDI_INGEST</code> dengan kata sandi ingest dari koordinator teknis.</p>
    </div>}

    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!config || busy || (!config.desired && (!config.configured || config.engine === 'unavailable'))} onClick={switchState} className="min-h-[44px] rounded-xl bg-[#F5C538] px-5 text-sm font-extrabold text-[#310603] disabled:opacity-50">{config?.desired ? 'Hentikan Siaran Cloud' : 'Mulai Siaran Cloud'}</button>
      <button type="button" onClick={refresh} className="min-h-[44px] rounded-xl border border-[#F5C538]/50 px-4 text-sm font-bold text-[#FFF5D6]">Perbarui Status</button>
    </div>

    <ResponsiveSheet open={sheet} onClose={() => setSheet(false)} title="Pengaturan Siaran Cloud" subtitle="Simpan kunci YouTube dan pilih audio cadangan.">
      <form onSubmit={save} className="space-y-5 p-5">
        <div><label htmlFor="youtube-stream-key" className="block text-sm font-bold text-[#FDF39D]">Kunci Siaran YouTube</label><input id="youtube-stream-key" type="password" autoComplete="off" value={streamKey} onChange={e => setStreamKey(e.target.value)} className="mt-2 min-h-[44px] w-full rounded-lg border border-[#F5C538]/40 bg-[#1A021D] px-3 text-[#FFF5D6]" /><p className="mt-1 text-sm text-[#FFF5D6]/80">{config?.configured ? 'Kunci sudah tersimpan. Isi hanya jika ingin menggantinya.' : 'Salin Stream Key dari YouTube Studio.'}</p></div>
        <div><label htmlFor="fallback-audio" className="block text-sm font-bold text-[#FDF39D]">Audio Cadangan (WAV, maksimal 31 MB)</label><input id="fallback-audio" type="file" accept="audio/wav,.wav" disabled={config?.desired} onChange={e => setAudio(e.target.files?.[0] || null)} className="mt-2 block min-h-[44px] w-full text-sm text-[#FFF5D6] disabled:opacity-50" /><p className="text-sm text-[#FFF5D6]/80">{config?.desired ? 'Hentikan siaran terlebih dahulu untuk mengganti audio cadangan.' : config?.audioConfigured ? 'Audio cadangan sudah tersedia.' : 'Jika tidak diisi, tayangan cadangan akan senyap.'}</p></div>
        <button type="submit" disabled={busy || (!streamKey && !audio)} className="min-h-[44px] rounded-lg bg-[#F5C538] px-5 font-bold text-[#310603] disabled:opacity-50">Simpan Pengaturan</button>
      </form>
    </ResponsiveSheet>
  </section>;
}
