import React, { useState } from 'react';
import { ResponsiveSheet } from '../ui/ResponsiveSheet.tsx';
import { ConfirmModal } from '../ui/ConfirmModal.tsx';
import type { MediaSponsor, ObsLayoutPreset, ObsOverlay, ObsTransitionPreset } from '../../types.ts';

interface ObsControllerViewProps {
  mediaData: {
    obsOverlays: ObsOverlay[];
    mediaSponsors: MediaSponsor[];
  };
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isErr?: boolean) => void;
}

const LAYOUT_PRESETS: Array<{ id: ObsLayoutPreset; label: string; desc: string }> = [
  { id: 'full_frame', label: 'Frame Video Penuh', desc: 'Identitas acara kiri atas, media partner kanan atas, sponsor di bawah, tengah transparan' },
  { id: 'lower_third', label: 'Lower-Third Broadcast', desc: 'Bar bawah penuh + logo sekolah, countdown & sponsor' },
  { id: 'corner_bug', label: 'Corner Bug & Sponsor', desc: 'Badge LIVE pojok kiri atas + sponsor bergantian kanan atas' },
  { id: 'guest_spotlight', label: 'Guest Star Spotlight', desc: 'Kartu bintang tamu Niken Salindry & Kembange Jagad' },
  { id: 'rundown_schedule', label: 'Rundown Jadwal', desc: 'Daftar agenda resmi AVERSA 44 di sisi kiri layar' },
  { id: 'standby_soon', label: 'Standby / Starting Soon', desc: 'Layar tunggu teater lengkap untuk jeda/sebelum siaran' },
  { id: 'sponsor_wall', label: 'Sponsor Showcase', desc: 'Bar penghargaan seluruh sponsor resmi di bagian bawah' },
];

const TRANSITIONS: Array<{ id: ObsTransitionPreset; label: string }> = [
  { id: 'broadcast_wipe', label: 'Broadcast Wipe (Rekomendasi TV)' },
  { id: 'slide_edge', label: 'Slide Edge' },
  { id: 'zoom_pop', label: 'Zoom Pop' },
  { id: 'fade_smooth', label: 'Fade Smooth' },
  { id: 'cut', label: 'Cut (Langsung)' },
];

export const ObsControllerView: React.FC<ObsControllerViewProps> = ({
  mediaData,
  onRefresh,
  onNotify,
}) => {
  const overlays = mediaData.obsOverlays || [];

  const [selectedId, setSelectedId] = useState<number>(overlays[0]?.id || 0);
  const activeOverlay = overlays.find((o) => o.id === selectedId) || overlays[0] || null;

  const [formState, setFormState] = useState<Partial<ObsOverlay> | null>(null);
  const [stingerLabel, setStingerLabel] = useState('LIVE • DIES NATALIS 44');
  const [createOpen, setCreateOpen] = useState(false);
  const [newOverlayName, setNewOverlayName] = useState('');

  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const effective = {
    layout_preset: formState?.layout_preset ?? activeOverlay?.layout_preset ?? 'lower_third',
    theme_mode: formState?.theme_mode ?? activeOverlay?.theme_mode ?? 'dark',
    transition_preset: formState?.transition_preset ?? activeOverlay?.transition_preset ?? 'broadcast_wipe',
    lower_third_title: formState?.lower_third_title ?? activeOverlay?.lower_third_title ?? '',
    lower_third_subtitle: formState?.lower_third_subtitle ?? activeOverlay?.lower_third_subtitle ?? '',
    corner_bug_text: formState?.corner_bug_text ?? activeOverlay?.corner_bug_text ?? '',
    show_countdown: formState?.show_countdown ?? activeOverlay?.show_countdown ?? true,
    show_sponsors: formState?.show_sponsors ?? activeOverlay?.show_sponsors ?? true,
  };

  const buildObsUrl = (ov: ObsOverlay) =>
    `${window.location.origin}/obs?overlay=${encodeURIComponent(ov.slug)}&token=${encodeURIComponent(
      ov.access_token || ''
    )}`;

  const saveOverlayUpdate = async (patch: Partial<ObsOverlay>) => {
    if (!activeOverlay) return;
    const res = await fetch(`/api/admin/obs-overlays/${activeOverlay.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (d.success) {
      setFormState(null);
      onNotify('Perubahan dikirim real-time ke OBS Browser Source!');
      await onRefresh();
    } else {
      onNotify(d.error || 'Gagal memperbarui overlay OBS.', true);
    }
  };

  const handleFireStinger = async (label: string) => {
    if (!activeOverlay) return;
    const res = await fetch(`/api/admin/obs-overlays/${activeOverlay.id}/stinger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (res.ok) onNotify(`Stinger "${label}" diputar di OBS!`);
  };

  const handleCreateOverlay = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/obs-overlays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newOverlayName }),
    });
    const d = await res.json();
    if (d.success) {
      setCreateOpen(false);
      setNewOverlayName('');
      setSelectedId(d.overlay.id);
      onNotify(`Kanal OBS "${d.overlay.name}" dibuat.`);
      await onRefresh();
    } else {
      onNotify(d.error || 'Gagal menambah kanal OBS.', true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Live Streaming Kit &amp; OBS Overlay Controller
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80 mt-1">
            Atur Lower-Third, Countdown, Stinger Bumper, dan Sponsor untuk OBS Studio / vMix / StreamYard secara real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
        >
          + Tambah Kanal OBS
        </button>
      </div>


      {activeOverlay && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Kanal, URL & Stinger */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-4">
              <div>
                <label htmlFor="obs-chan" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Kanal OBS Aktif
                </label>
                <select
                  id="obs-chan"
                  value={activeOverlay.id}
                  onChange={(e) => {
                    setSelectedId(Number(e.target.value));
                    setFormState(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs font-bold text-[#FFF5D6]"
                >
                  {overlays.map((ov) => (
                    <option key={ov.id} value={ov.id}>
                      {ov.name} ({ov.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-[#1A021D] border border-[#A0D9CA]/35 p-3.5 space-y-2">
                <div className="text-[11px] font-bold text-[#A0D9CA]">
                  URL Browser Source OBS (1920x1080 Transparan)
                </div>
                <div className="text-[11px] font-mono text-[#FFF5D6]/85 break-all bg-[#120114] p-2 rounded-lg">
                  {buildObsUrl(activeOverlay)}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(buildObsUrl(activeOverlay));
                      onNotify('URL Browser Source disalin!');
                    }}
                    className="min-h-[44px] px-3.5 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold"
                  >
                    Salin URL OBS
                  </button>
                  <a
                    href={buildObsUrl(activeOverlay)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3.5 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] flex items-center"
                  >
                    Buka Pratinjau Overlay
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Regenerasi Token OBS?',
                        message: 'Tautan Browser Source lama akan berhenti bekerja setelah token diperbarui.',
                        onConfirm: async () => {
                          await fetch(`/api/admin/obs-overlays/${activeOverlay.id}/regenerate-token`, {
                            method: 'POST',
                          });
                          onNotify('Token OBS diperbarui.');
                          await onRefresh();
                        },
                      })
                    }
                    className="min-h-[44px] px-3 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
                  >
                    Reset Token
                  </button>
                </div>
              </div>
            </div>

            {/* Stinger Bumper Trigger */}
            <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[#FDF39D]">Stinger Bumper Transisi Live</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={stingerLabel}
                  onChange={(e) => setStingerLabel(e.target.value)}
                  aria-label="Teks Stinger Bumper"
                  className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
                <button
                  type="button"
                  onClick={() => handleFireStinger(stingerLabel)}
                  className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#E09D17] to-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
                >
                  Putar Stinger!
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {['LIVE • AVERSA 44', 'GUEST STAR TIME', 'COMING UP NEXT', 'REPLAY MOMEN'].map((lbl) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => handleFireStinger(lbl)}
                    className="min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/30 text-[11px] font-bold text-[#F7D160] hover:border-[#F5C538]"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live Layout & Text Editor */}
          <div className="lg:col-span-7 rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-5">
            <h3 className="text-sm font-extrabold text-[#FDF39D]">Pilih Layout Overlay &amp; Teks Siaran</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {LAYOUT_PRESETS.map((lp) => {
                const selected = effective.layout_preset === lp.id;
                return (
                  <button
                    key={lp.id}
                    type="button"
                    onClick={() => {
                      setFormState((p) => ({ ...p, layout_preset: lp.id }));
                      void saveOverlayUpdate({ layout_preset: lp.id });
                    }}
                    className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'bg-[#310603] border-[#F5C538] text-[#FDF39D]'
                        : 'bg-[#1A021D] border-[#F5C538]/25 text-[#FFF5D6]/85 hover:border-[#F5C538]/60'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{lp.label}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">{lp.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="obs-theme" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Tema Overlay
                </label>
                <select
                  id="obs-theme"
                  value={effective.theme_mode}
                  onChange={(e) => setFormState((p) => ({ ...p, theme_mode: e.target.value as any }))}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  <option value="dark">Imperial Velvet (Gelap)</option>
                  <option value="light">Royal Cream (Terang)</option>
                </select>
              </div>
              <div>
                <label htmlFor="obs-trans" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Animasi Transisi
                </label>
                <select
                  id="obs-trans"
                  value={effective.transition_preset}
                  onChange={(e) => setFormState((p) => ({ ...p, transition_preset: e.target.value as any }))}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  {TRANSITIONS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="obs-l3-t" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Judul Lower-Third / Standby
                </label>
                <input
                  id="obs-l3-t"
                  type="text"
                  value={effective.lower_third_title}
                  onChange={(e) => setFormState((p) => ({ ...p, lower_third_title: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="obs-l3-s" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Subjudul Lower-Third / Pembicara
                </label>
                <input
                  id="obs-l3-s"
                  type="text"
                  value={effective.lower_third_subtitle}
                  onChange={(e) => setFormState((p) => ({ ...p, lower_third_subtitle: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>
              <div>
                <label htmlFor="obs-bug" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Teks Corner Bug
                </label>
                <input
                  id="obs-bug"
                  type="text"
                  value={effective.corner_bug_text}
                  onChange={(e) => setFormState((p) => ({ ...p, corner_bug_text: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#A0D9CA]">
                  <input
                    type="checkbox"
                    checked={effective.show_countdown}
                    onChange={(e) => setFormState((p) => ({ ...p, show_countdown: e.target.checked }))}
                    className="w-4 h-4 accent-[#A0D9CA]"
                  />
                  Tampil Countdown
                </label>
                <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#FDF39D]">
                  <input
                    type="checkbox"
                    checked={effective.show_sponsors}
                    onChange={(e) => setFormState((p) => ({ ...p, show_sponsors: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C538]"
                  />
                  Tampil Sponsor
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => saveOverlayUpdate(effective)}
              className="w-full min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold hover:brightness-105"
            >
              Simpan &amp; Push Live ke OBS
            </button>
          </div>
        </div>
      )}

      {/* Create OBS Overlay Sheet */}
      <ResponsiveSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Kanal OBS Overlay Baru"
        subtitle="Setiap kanal memiliki token URL unik untuk OBS Browser Source."
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleCreateOverlay} className="space-y-4">
          <div>
            <label htmlFor="new-ov-name" className="block text-sm font-bold text-[#F7D160] mb-1">
              Nama Kanal Siaran *
            </label>
            <input
              id="new-ov-name"
              type="text"
              required
              value={newOverlayName}
              onChange={(e) => setNewOverlayName(e.target.value)}
              placeholder="Contoh: Kamera Lapangan Voli SVC"
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <button
            type="submit"
            className="w-full min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
          >
            Buat Kanal OBS
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
};
