import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { StaffUser, TicketTier } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface ScannerAndAdminSectionProps {
  mode: 'scanner' | 'admin';
  staffUser: StaffUser | null;
  onAuthChange: (user: StaffUser | null) => void;
  onCatalogRefresh: () => void;
}

export const ScannerAndAdminSection: React.FC<ScannerAndAdminSectionProps> = ({
  mode,
  staffUser,
  onAuthChange,
  onCatalogRefresh,
}) => {
  // Auth Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Scanner State
  const [gateLocation, setGateLocation] = useState('Gate Utama Puncak Aversa');
  const [manualQrInput, setManualQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<any>(null);
  const [executeMsg, setExecuteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [gateStats, setGateStats] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number>(0);

  // Admin Dashboard State
  const [adminData, setAdminData] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [resiMap, setResiMap] = useState<Record<string, string>>({});
  const [newTier, setNewTier] = useState({
    name: '',
    category: 'EXTERNAL' as 'INTERNAL' | 'EXTERNAL' | 'VIP' | 'BUNDLING',
    description: '',
    price: 60000,
    quota_total: 100,
    requires_student_id: false,
  });
  const [tierMsg, setTierMsg] = useState('');

  const stopCamera = () => {
    if (scanTimerRef.current) {
      cancelAnimationFrame(scanTimerRef.current);
      scanTimerRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, [mode]);

  const loadScannerHistory = async () => {
    if (!staffUser) return;
    try {
      const res = await fetch('/api/scanner/recent');
      const data = await res.json();
      if (data.success) {
        setRecentScans(data.logs || []);
        setGateStats(data.stats || null);
      }
    } catch {
      // silent
    }
  };

  const loadAdminOverview = async () => {
    if (!staffUser || (staffUser.role !== 'ADMIN' && staffUser.role !== 'CASHIER')) return;
    setAdminLoading(true);
    setAdminError('');
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat ringkasan admin.');
      }
      setAdminData(data);
    } catch (err: any) {
      setAdminError(err?.message || 'Terjadi kesalahan memuat dashboard.');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (staffUser && mode === 'scanner') {
      loadScannerHistory();
    }
    if (staffUser && mode === 'admin') {
      loadAdminOverview();
    }
  }, [staffUser, mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login gagal.');
      }
      onAuthChange(data.user);
      setPassword('');
    } catch (err: any) {
      setAuthError(err?.message || 'Gagal autentikasi.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    stopCamera();
    await fetch('/api/auth/logout', { method: 'POST' });
    onAuthChange(null);
  };

  const inspectQrCode = async (payloadStr: string) => {
    const clean = payloadStr.trim();
    if (!clean) return;
    setInspectLoading(true);
    setExecuteMsg(null);
    setInspectionResult(null);
    try {
      const res = await fetch('/api/scanner/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayload: clean, gateLocation }),
      });
      const data = await res.json();
      setInspectionResult({ ...data, rawPayload: clean });
      loadScannerHistory();
    } catch {
      setInspectionResult({
        success: false,
        verdict: 'ERROR',
        message: 'Koneksi ke server scanner terputus.',
      });
    } finally {
      setInspectLoading(false);
    }
  };

  const executeCheckIn = async () => {
    if (!inspectionResult?.rawPayload) return;
    setInspectLoading(true);
    try {
      const res = await fetch('/api/scanner/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayload: inspectionResult.rawPayload, gateLocation }),
      });
      const data = await res.json();
      setExecuteMsg({
        ok: Boolean(data.success),
        text: data.message || (data.success ? 'Verifikasi berhasil.' : 'Verifikasi ditolak.'),
      });
      // Re-inspect so UI reflects updated USED / COMPLETED timestamp
      await inspectQrCode(inspectionResult.rawPayload);
      setExecuteMsg({
        ok: Boolean(data.success),
        text: data.message,
      });
      loadScannerHistory();
    } finally {
      setInspectLoading(false);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Peramban tidak mendukung akses kamera WebRTC.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        const scanFrame = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || !streamRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded?.data) {
                setManualQrInput(decoded.data);
                stopCamera();
                inspectQrCode(decoded.data);
                return;
              }
            }
          }
          scanTimerRef.current = requestAnimationFrame(scanFrame);
        };
        scanTimerRef.current = requestAnimationFrame(scanFrame);
      }, 150);
    } catch (err: any) {
      setCameraError(err?.message || 'Izin kamera ditolak atau kamera tidak tersedia di perangkat ini.');
      stopCamera();
    }
  };

  const handleConfirmCash = async (orderCode: string) => {
    await fetch(`/api/admin/orders/${orderCode}/confirm-payment`, { method: 'POST' });
    loadAdminOverview();
    onCatalogRefresh();
  };

  const handleUpdateShipping = async (orderCode: string, status: string) => {
    await fetch(`/api/admin/orders/${orderCode}/update-shipping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulfillmentStatus: status,
        trackingNumber: resiMap[orderCode] || '',
      }),
    });
    loadAdminOverview();
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setTierMsg('');
    const res = await fetch('/api/admin/ticket-tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTier),
    });
    const data = await res.json();
    if (data.success) {
      setTierMsg(`Kategori "${data.tier.name}" berhasil ditambahkan.`);
      setNewTier({
        name: '',
        category: 'EXTERNAL',
        description: '',
        price: 60000,
        quota_total: 100,
        requires_student_id: false,
      });
      loadAdminOverview();
      onCatalogRefresh();
    } else {
      setTierMsg(data.error || 'Gagal menambah kategori.');
    }
  };

  // Unauthenticated Staff Gate (single unified login hosted inside /office)
  if (!staffUser) {
    return (
      <div className="p-6 sm:p-8 space-y-5">
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="staff-user" className="block text-sm font-bold text-[#F7D160] mb-1.5">
              Username Petugas *
            </label>
            <input
              id="staff-user"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin / kasir / scanner"
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#1A021D] border border-[#F5C538]/40 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="staff-pass" className="block text-sm font-bold text-[#F7D160] mb-1.5">
              Kata Sandi *
            </label>
            <input
              id="staff-pass"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi petugas"
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#1A021D] border border-[#F5C538]/40 text-sm text-[#FFF5D6]"
            />
          </div>

          {authError && (
            <div role="alert" className="p-3 rounded-lg bg-[#310603] border border-[#F5B8CB] text-xs font-bold text-[#F5B8CB]">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm hover:brightness-105"
          >
            {authLoading ? 'Memverifikasi...' : 'Masuk ke Panel Office'}
          </button>
        </form>
      </div>
    );
  }

  // SCANNER GATE & MERCH BOOTH VIEW
  if (mode === 'scanner') {
    return (
      <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F5C538]/25 pb-5">
          <div>
            <p className="font-ceremonial text-xs font-bold tracking-[0.2em] text-[#A0D9CA] uppercase">
              Petugas Aktif: {staffUser.fullName} ({staffUser.role})
            </p>
            <h2 className="font-theatrical text-3xl font-extrabold text-[#FFF5D6] mt-1">
              Gate &amp; Booth Merch QR Scanner
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {gateStats && (
              <div className="px-4 py-2 rounded-xl bg-[#26042A] border border-[#F5C538]/35 text-xs">
                Check-In: <strong className="text-[#A0D9CA]">{gateStats.checked_in_tickets}</strong> /{' '}
                <span>{gateStats.total_issued_tickets} Tiket</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#F5B8CB]/50 text-xs font-bold text-[#F5B8CB]"
            >
              Keluar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Camera + Manual Input */}
          <div className="lg:col-span-5 rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-4">
            <div>
              <label htmlFor="gate-select" className="block text-sm font-bold text-[#F7D160] mb-1.5">
                Pos Petugas Saat Ini
              </label>
              <select
                id="gate-select"
                value={gateLocation}
                onChange={(e) => setGateLocation(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#1A021D] border border-[#F5C538]/40 text-sm text-[#FFF5D6]"
              >
                <option value="Gate Utama Puncak Aversa">Gate Utama Puncak Aversa</option>
                <option value="Gate VIP Golden Ticket">Gate VIP Golden Ticket</option>
                <option value="Booth Pengambilan Merch OSIS">Booth Pengambilan Merch OSIS</option>
              </select>
            </div>

            <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/25 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#FDF39D]">Kamera Pemindai QR (WebRTC)</span>
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#7D1B05] text-[#FFF5D6] text-xs font-bold"
                  >
                    Matikan Kamera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold"
                  >
                    Aktifkan Kamera QR
                  </button>
                )}
              </div>

              {cameraError && (
                <div className="p-2.5 rounded-lg bg-[#310603] border border-[#F5B8CB] text-xs text-[#F5B8CB]">
                  {cameraError}
                </div>
              )}

              {cameraActive && (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                inspectQrCode(manualQrInput);
              }}
              className="space-y-2.5"
            >
              <label htmlFor="manual-qr" className="block text-sm font-bold text-[#F7D160]">
                Input Kode Tiket / Payload QR / Scanner USB 2D
              </label>
              <input
                id="manual-qr"
                type="text"
                value={manualQrInput}
                onChange={(e) => setManualQrInput(e.target.value)}
                placeholder="Tempel payload AVERSA44|... atau TKT-AVR44-0001"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#1A021D] border border-[#F5C538]/40 text-xs font-mono text-[#FFF5D6]"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={inspectLoading || !manualQrInput.trim()}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold"
                >
                  {inspectLoading ? 'Memeriksa...' : 'Periksa Isi QR'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualQrInput('TKT-AVR44-0001');
                    inspectQrCode('TKT-AVR44-0001');
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#1A021D] border border-[#F5C538]/35 text-xs font-bold text-[#FDF39D]"
                >
                  Uji Tiket Sample
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualQrInput('AVR44-SAMPLE-001');
                    inspectQrCode('AVR44-SAMPLE-001');
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#1A021D] border border-[#A0D9CA]/40 text-xs font-bold text-[#A0D9CA]"
                >
                  Uji Merch Sample
                </button>
              </div>
            </form>
          </div>

          {/* Right: Complete Inspection Result + Atomic Action */}
          <div className="lg:col-span-7 space-y-5">
            {!inspectionResult && !inspectLoading && (
              <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center space-y-2">
                <p className="text-base font-extrabold text-[#FDF39D]">Scanner Siap Memverifikasi</p>
                <p className="text-sm text-[#FFF5D6]/80">
                  Pindai QR Code E-Ticket pengunjung atau QR Pengambilan Merch menggunakan kamera, scanner barcode, atau masukkan kode tiket di panel kiri.
                </p>
              </div>
            )}

            {inspectionResult && (
              <div className="rounded-2xl border-2 border-[#F5C538] bg-[#26042A] p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-extrabold ${
                      inspectionResult.verdict === 'READY_TO_CHECKIN' ||
                      inspectionResult.verdict === 'READY_TO_PICKUP'
                        ? 'bg-[#0F2F28] text-[#A0D9CA]'
                        : 'bg-[#7D1B05] text-[#FDF39D]'
                    }`}
                  >
                    HASIL INSPEKSI: {inspectionResult.verdict}
                  </span>
                  {inspectionResult.signatureMode && (
                    <span className="text-[11px] font-mono text-[#A0D9CA]">
                      {inspectionResult.signatureMode}
                    </span>
                  )}
                </div>

                {inspectionResult.message && (
                  <p className="text-sm font-bold text-[#F5B8CB]">{inspectionResult.message}</p>
                )}

                {executeMsg && (
                  <div
                    role="status"
                    className={`p-3.5 rounded-xl border text-sm font-extrabold ${
                      executeMsg.ok
                        ? 'bg-[#0F2F28] border-[#A0D9CA] text-[#A0D9CA]'
                        : 'bg-[#310603] border-[#F5B8CB] text-[#F5B8CB]'
                    }`}
                  >
                    {executeMsg.text}
                  </div>
                )}

                {inspectionResult.ticket && (
                  <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/30 p-4 space-y-2 text-sm">
                    <div className="text-xs font-bold text-[#F5C538] uppercase">Detail Lengkap E-Ticket</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>Pemegang: <strong className="text-[#FFF5D6]">{inspectionResult.ticket.holder_name}</strong></div>
                      <div>Kode Tiket: <strong className="font-mono text-[#FDF39D]">{inspectionResult.ticket.ticket_code}</strong></div>
                      <div>Kategori: <strong className="text-[#A0D9CA]">{inspectionResult.ticket.tier_name}</strong></div>
                      <div>Zona Duduk: <strong>{inspectionResult.ticket.seat_zone}</strong></div>
                      <div>No. WA: <strong>{inspectionResult.ticket.holder_phone}</strong></div>
                      <div>Identitas/NISN: <strong>{inspectionResult.ticket.holder_identity || '-'}</strong></div>
                      <div>Status Bayar: <strong>{inspectionResult.ticket.payment_status}</strong></div>
                      <div>
                        Status Gate:{' '}
                        <strong>
                          {inspectionResult.ticket.status === 'USED'
                            ? `SUDAH CHECK-IN (${new Date(inspectionResult.ticket.checked_in_at).toLocaleString('id-ID')})`
                            : inspectionResult.ticket.status}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {inspectionResult.order && (
                  <div className="rounded-xl bg-[#1A021D] border border-[#A0D9CA]/30 p-4 space-y-2 text-xs">
                    <div className="text-xs font-bold text-[#A0D9CA] uppercase">Detail Pesanan Pengambilan Merch</div>
                    <div>Kode Order: <strong className="font-mono text-[#FDF39D]">{inspectionResult.order.order_code}</strong></div>
                    <div>Pembeli: <strong>{inspectionResult.order.customer_name} ({inspectionResult.order.customer_phone})</strong></div>
                    <div>Status Bayar: <strong>{inspectionResult.order.payment_status}</strong></div>
                    <div>
                      Serah Terima:{' '}
                      <strong>
                        {inspectionResult.order.pickup_verified_at
                          ? `SUDAH DIAMBIL (${new Date(inspectionResult.order.pickup_verified_at).toLocaleString('id-ID')})`
                          : 'BELUM DIAMBIL DI BOOTH'}
                      </strong>
                    </div>
                  </div>
                )}

                {Array.isArray(inspectionResult.orderItems) && inspectionResult.orderItems.length > 0 && (
                  <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/20 p-4 space-y-2">
                    <div className="text-xs font-bold text-[#F7D160] uppercase">Daftar Isi Pesanan</div>
                    <ul className="space-y-1 text-xs text-[#FFF5D6]/90">
                      {inspectionResult.orderItems.map((it: any) => (
                        <li key={it.id} className="flex justify-between border-b border-white/10 pb-1">
                          <span>
                            [{it.item_type}] {it.quantity}x {it.item_name} ({it.variant_label})
                          </span>
                          <span className="font-bold">{formatRupiah(it.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(inspectionResult.verdict === 'READY_TO_CHECKIN' ||
                  inspectionResult.verdict === 'READY_TO_PICKUP') && (
                  <button
                    type="button"
                    disabled={inspectLoading}
                    onClick={executeCheckIn}
                    className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-[#A0D9CA] text-[#1A021D] font-extrabold text-sm sm:text-base hover:brightness-105"
                  >
                    {inspectionResult.scanType === 'MERCH_PICKUP'
                      ? 'Sahkan Serah Terima Merch di Booth Sekarang'
                      : 'Sahkan Check-In Pengunjung Sekarang'}
                  </button>
                )}
              </div>
            )}

            {/* Scan Audit Logs */}
            <div className="rounded-2xl border border-[#F5C538]/25 bg-[#26042A] p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[#FDF39D]">Riwayat Audit Scan Terbaru</h3>
              {recentScans.length === 0 ? (
                <p className="text-xs text-[#FFF5D6]/75">Belum ada aktivitas pemindaian gate atau booth.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentScans.map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-lg bg-[#1A021D] p-2.5 text-xs border border-white/10"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#F5C538]">{log.reference_code}</span>{' '}
                        <span className="text-[#FFF5D6]/85">{log.detail_note}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            log.scan_result === 'SUCCESS'
                              ? 'bg-[#0F2F28] text-[#A0D9CA]'
                              : 'bg-[#7D1B05] text-[#F5B8CB]'
                          }`}
                        >
                          {log.scan_result}
                        </span>
                        <span className="text-[11px] text-[#FFF5D6]/60">
                          {new Date(log.scanned_at).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ADMIN & CASHIER POS DASHBOARD VIEW
  if (staffUser.role === 'SCANNER') {
    return (
      <section className="py-12 px-4 max-w-xl mx-auto text-center space-y-4">
        <p className="text-lg font-bold text-[#F5B8CB]">
          Akun dengan peran SCANNER hanya memiliki akses ke tab Scanner Gate.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm"
        >
          Ganti Akun Admin / Kasir
        </button>
      </section>
    );
  }

  return (
    <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F5C538]/25 pb-5">
        <div>
          <p className="font-ceremonial text-xs font-bold tracking-[0.2em] text-[#F5C538] uppercase">
            Dashboard Operasional ({staffUser.role})
          </p>
          <h2 className="font-theatrical text-3xl font-extrabold text-[#FFF5D6] mt-1">
            Kasir POS, Pesanan &amp; Manajemen Tiket
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadAdminOverview}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D]"
          >
            Muat Ulang Data
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#F5B8CB]/50 text-xs font-bold text-[#F5B8CB]"
          >
            Keluar ({staffUser.username})
          </button>
        </div>
      </div>

      {adminLoading && (
        <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-8 text-center text-sm text-[#FDF39D]">
          Mengambil ringkasan penjualan langsung dari PostgreSQL...
        </div>
      )}

      {adminError && (
        <div role="alert" className="rounded-2xl bg-[#310603] border border-[#F5B8CB] p-5 text-sm text-[#F5B8CB]">
          {adminError}
        </div>
      )}

      {adminData && (
        <div className="space-y-8">
          {/* Real PostgreSQL Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-4">
              <div className="text-xs text-[#F7D160]">Total Pendapatan Lunas</div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#FDF39D] mt-1">
                {formatRupiah(Number(adminData.metrics.total_revenue))}
              </div>
            </div>
            <div className="rounded-2xl bg-[#26042A] border border-[#A0D9CA]/35 p-4">
              <div className="text-xs text-[#A0D9CA]">Pesanan Lunas</div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#FFF5D6] mt-1">
                {adminData.metrics.paid_orders_count} Transaksi
              </div>
            </div>
            <div className="rounded-2xl bg-[#26042A] border border-[#F5B8CB]/35 p-4">
              <div className="text-xs text-[#F5B8CB]">Menunggu Bayar / Kasir</div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#FFF5D6] mt-1">
                {adminData.metrics.pending_orders_count} Pesanan
              </div>
            </div>
            <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-4">
              <div className="text-xs text-[#F7D160]">Pemasukan QBiz QRIS</div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#FDF39D] mt-1">
                {formatRupiah(Number(adminData.metrics.qris_revenue))}
              </div>
            </div>
          </div>

          {/* Orders & Cashier POS Confirmation */}
          <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-4">
            <h3 className="text-lg font-extrabold text-[#FDF39D]">
              Daftar Pesanan Tiket &amp; Merchandise (Verifikasi Kasir &amp; Resi Kirim)
            </h3>

            {adminData.orders.length === 0 ? (
              <p className="text-sm text-[#FFF5D6]/80">Belum ada transaksi masuk.</p>
            ) : (
              <div className="space-y-3">
                {adminData.orders.map((ord: any) => (
                  <div
                    key={ord.id}
                    className="rounded-xl bg-[#1A021D] border border-[#F5C538]/25 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-extrabold text-[#FDF39D]">{ord.order_code}</span>{' '}
                        <span className="text-sm font-bold text-[#FFF5D6]">• {ord.customer_name}</span>{' '}
                        <span className="text-xs text-[#A0D9CA]">({ord.customer_phone})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-[#26042A] text-xs font-bold text-[#F7D160]">
                          {ord.payment_method}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-extrabold ${
                            ord.payment_status === 'PAID'
                              ? 'bg-[#0F2F28] text-[#A0D9CA]'
                              : 'bg-[#7D1B05] text-[#FDF39D]'
                          }`}
                        >
                          {ord.payment_status}
                        </span>
                        <span className="text-sm font-extrabold text-[#FFF5D6]">
                          {formatRupiah(ord.total_amount)}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-[#FFF5D6]/80">
                      Distribusi: <strong>{ord.fulfillment_mode}</strong> ({ord.fulfillment_status}) • Alamat:{' '}
                      {ord.shipping_address || '-'}
                      {ord.payment_proof_note ? ` • Bukti: ${ord.payment_proof_note}` : ''}
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
                      {ord.payment_status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmCash(ord.order_code)}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold"
                        >
                          Konfirmasi Bayar Lunas (POS / Transfer)
                        </button>
                      )}

                      {ord.order_type !== 'TICKET_ONLY' && ord.fulfillment_mode !== 'PICKUP_BOOTH' && (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <label htmlFor={`resi-${ord.order_code}`} className="sr-only">
                            Nomor resi {ord.order_code}
                          </label>
                          <input
                            id={`resi-${ord.order_code}`}
                            type="text"
                            value={resiMap[ord.order_code] ?? ord.tracking_number ?? ''}
                            onChange={(e) => setResiMap({ ...resiMap, [ord.order_code]: e.target.value })}
                            placeholder="Input Nomor Resi / Nama Kurir"
                            className="flex-1 min-w-[180px] min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateShipping(ord.order_code, 'OUT_FOR_DELIVERY')}
                            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
                          >
                            Kirim &amp; Simpan Resi
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Ticket Tiers Admin Panel */}
          {staffUser.role === 'ADMIN' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleCreateTier}
                className="lg:col-span-5 rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-3.5"
              >
                <h3 className="text-base font-extrabold text-[#FDF39D]">Tambah Kategori Tiket Dinamis</h3>
                <div>
                  <label htmlFor="nt-name" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Nama Kategori Tiket *
                  </label>
                  <input
                    id="nt-name"
                    type="text"
                    required
                    value={newTier.name}
                    onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                    placeholder="Contoh: Presale Batch 2 Umum"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="nt-cat" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Tipe Template
                    </label>
                    <select
                      id="nt-cat"
                      value={newTier.category}
                      onChange={(e) => setNewTier({ ...newTier, category: e.target.value as any })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                    >
                      <option value="INTERNAL">INTERNAL</option>
                      <option value="EXTERNAL">EXTERNAL</option>
                      <option value="VIP">VIP</option>
                      <option value="BUNDLING">BUNDLING</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="nt-price" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Harga (Rp) *
                    </label>
                    <input
                      id="nt-price"
                      type="number"
                      required
                      min={0}
                      value={newTier.price}
                      onChange={(e) => setNewTier({ ...newTier, price: Number(e.target.value) })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label htmlFor="nt-quota" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Kuota Tiket *
                    </label>
                    <input
                      id="nt-quota"
                      type="number"
                      required
                      min={1}
                      value={newTier.quota_total}
                      onChange={(e) => setNewTier({ ...newTier, quota_total: Number(e.target.value) })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                    />
                  </div>
                  <label className="flex items-center gap-2 min-h-[44px] text-xs font-semibold text-[#FFF5D6]">
                    <input
                      type="checkbox"
                      checked={newTier.requires_student_id}
                      onChange={(e) => setNewTier({ ...newTier, requires_student_id: e.target.checked })}
                      className="w-4 h-4 accent-[#F5C538]"
                    />
                    Wajib NISN/NIP
                  </label>
                </div>
                <div>
                  <label htmlFor="nt-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Deskripsi Tiket *
                  </label>
                  <textarea
                    id="nt-desc"
                    rows={2}
                    required
                    value={newTier.description}
                    onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
                    placeholder="Jelaskan akses dan fasilitas kategori tiket ini"
                    className="w-full p-2.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                  />
                </div>
                {tierMsg && <p className="text-xs font-bold text-[#A0D9CA]">{tierMsg}</p>}
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold"
                >
                  Simpan Kategori Tiket Baru
                </button>
              </form>

              <div className="lg:col-span-7 space-y-5">
                <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-3">
                  <h3 className="text-base font-extrabold text-[#FDF39D]">Kategori Tiket Aktif</h3>
                  <div className="space-y-2.5">
                    {adminData.ticketTiers.map((t: TicketTier) => (
                      <div key={t.id} className="rounded-xl bg-[#1A021D] border border-white/10 p-3 flex flex-wrap justify-between gap-2 text-xs">
                        <div>
                          <div className="font-extrabold text-[#FFF5D6]">{t.name} ({t.category})</div>
                          <div className="text-[#A0D9CA]">Terjual: {t.quota_sold} / {t.quota_total}</div>
                        </div>
                        <div className="font-extrabold text-[#FDF39D] text-sm">{formatRupiah(t.price)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-3">
                  <h3 className="text-base font-extrabold text-[#FDF39D]">
                    Pengajuan Sponsorship &amp; Mitra ({adminData.sponsorships.length})
                  </h3>
                  {adminData.sponsorships.length === 0 ? (
                    <p className="text-xs text-[#FFF5D6]/75">Belum ada pengajuan sponsor baru melalui website.</p>
                  ) : (
                    <div className="space-y-2">
                      {adminData.sponsorships.map((sp: any) => (
                        <div key={sp.id} className="rounded-xl bg-[#1A021D] border border-white/10 p-3 text-xs space-y-1">
                          <div className="font-extrabold text-[#FDF39D]">{sp.company_name} ({sp.tier_interest})</div>
                          <div className="text-[#A0D9CA]">{sp.contact_person} • WA {sp.phone}</div>
                          <div className="text-[#FFF5D6]/85">{sp.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
