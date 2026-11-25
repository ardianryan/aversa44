import { TurnstileChallenge } from './ui/TurnstileChallenge.tsx';
import React, { useEffect, useState } from 'react';
import { GoldenTicket3DCard } from './three/GoldenTicket3DCard.tsx';
import type { HydratedOrder } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface TicketWalletSectionProps {
  recentOrderCodes: string[];
  initialOrderCode: string | null;
  pausedMotion: boolean;
}

export const TicketWalletSection: React.FC<TicketWalletSectionProps> = ({
  recentOrderCodes,
  initialOrderCode,
  pausedMotion,
}) => {
  const [query, setQuery] = useState(initialOrderCode || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState<HydratedOrder[]>([]);
  const [settlingCode, setSettlingCode] = useState('');
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [securityToken, setSecurityToken] = useState('');
  const [securityReset, setSecurityReset] = useState(0);
  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [proofNotes, setProofNotes] = useState<Record<string, string>>({});
  const [uploadingCode, setUploadingCode] = useState('');

  const handleWalletProofUpload = async (orderCode: string) => {
    const file = proofFiles[orderCode] || null;
    const note = (proofNotes[orderCode] || '').trim();
    if (!file && !note) return;
    setUploadingCode(orderCode);
    setErrorMsg('');
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('proofFile', file);
        if (note) fd.append('note', note);
        res = await fetch(`/api/orders/${orderCode}/upload-proof`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`/api/orders/${orderCode}/upload-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Gagal mengunggah bukti pembayaran.');
        return;
      }
      setResults((prev) => prev.map((r) => (r.order.order_code === orderCode ? { ...r, order: data.order } : r)));
      setProofFiles((prev) => ({ ...prev, [orderCode]: null }));
      setProofNotes((prev) => ({ ...prev, [orderCode]: '' }));
    } finally {
      setUploadingCode('');
    }
  };

  const requestCode = async () => {
    setVerificationBusy(true); setErrorMsg('');
    try {
      const response = await fetch('/api/wallet/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, turnstileToken: securityToken }) });
      const data = await response.json();
      if (!response.ok) { setErrorMsg(data.error || 'Kode belum dapat dikirim.'); return; }
      setChallenge(data.challenge); setWhatsappUrl(data.whatsappUrl); setCodeSent(true);
    } catch { setErrorMsg('Tidak dapat menghubungi layanan verifikasi.'); }
    finally { setSecurityToken(''); setSecurityReset((n) => n + 1); setVerificationBusy(false); }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault(); setVerificationBusy(true); setErrorMsg('');
    try {
      const response = await fetch('/api/wallet/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, challenge }) });
      const data = await response.json();
      if (!response.ok) { setErrorMsg(data.error || 'Verifikasi belum berhasil.'); return; }
      setVerified(true); setChallenge(''); setWhatsappUrl('');
      lookupOrders(query || phone);
    } catch { setErrorMsg('Tidak dapat menghubungi layanan verifikasi.'); }
    finally { setVerificationBusy(false); }
  };

  const lookupOrders = async (searchStr: string) => {
    const clean = searchStr.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResults([]);
        setErrorMsg(data.error || 'Pesanan tidak ditemukan.');
        return;
      }
      setResults(data.results || []);
    } catch {
      setErrorMsg('Gagal menghubungi server pesanan. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderCode) setQuery(initialOrderCode);
    else if (recentOrderCodes.length > 0) setQuery(recentOrderCodes[0]);
  }, [initialOrderCode]);

  const handleSimulateQbiz = async (orderCode: string) => {
    setSettlingCode(orderCode);
    try {
      const res = await fetch(`/api/orders/${orderCode}/simulate-qbiz-webhook`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResults((prev) => prev.map((item) => (item.order.order_code === orderCode ? data : item)));
      }
    } finally {
      setSettlingCode('');
    }
  };

  return (
    <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto space-y-8">
      <div className="space-y-2">
        <p className="font-ceremonial text-xs font-bold tracking-[0.22em] text-[#F5C538] uppercase">
          Dompet Tiket &amp; Pelacakan Merch
        </p>
        <h2 className="font-theatrical text-3xl sm:text-4xl font-extrabold text-[#FFF5D6]">
          Cek E-Ticket QR &amp; Status Pengiriman
        </h2>
        <p className="text-sm text-[#FFF5D6]/85">
          Kirim pesan verifikasi dari nomor WhatsApp yang digunakan saat memesan.
        </p>
      </div>

      {!verified && <form onSubmit={verifyCode} className="space-y-4 rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-4">
        <label className="block text-sm font-bold text-[#F7D160]">Nomor WhatsApp saat memesan
          <input type="tel" required autoComplete="tel" value={phone} onChange={e => { setPhone(e.target.value); setCodeSent(false); }} placeholder="0812..." className="mt-2 block w-full min-h-[44px] px-4 rounded-xl bg-[#1A021D] border border-[#F5C538]/35 text-[#FFF5D6]" />
        </label>
        <TurnstileChallenge action="wallet" onToken={setSecurityToken} resetKey={securityReset} />
        <button type="button" disabled={verificationBusy || !phone.trim()} onClick={requestCode} className="min-h-[44px] px-4 rounded-xl border border-[#F5C538] text-[#FDF39D] font-bold disabled:opacity-60">Siapkan pesan verifikasi</button>
        {codeSent && <><p className="text-sm text-[#FFF5D6]">Buka WhatsApp dan kirim pesan yang sudah disiapkan dari nomor di atas. Tautan berlaku 5 menit.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#A0D9CA] px-4 font-bold text-[#A0D9CA]">Buka WhatsApp</a>
            <button type="submit" disabled={verificationBusy} className="min-h-[44px] rounded-xl bg-[#F5C538] px-4 font-bold text-[#310603] disabled:opacity-60">Saya sudah kirim pesan</button>
          </div></>}
      </form>}
      {verified && <button type="button" onClick={() => { void fetch('/api/wallet/logout', { method: 'POST' }); setVerified(false); setCodeSent(false); setResults([]); setQuery(''); }} className="min-h-[44px] px-4 rounded-xl border border-[#F5C538]/40 text-[#FDF39D] text-sm">Gunakan nomor lain</button>}

      {/* Search Form */}
      {verified && <form
        onSubmit={(e) => {
          e.preventDefault();
          lookupOrders(query);
        }}
        className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-4"
      >
        <div className="flex-1">
          <label htmlFor="wallet-query" className="block text-sm font-bold text-[#F7D160] mb-1.5">
            Kode Pesanan atau Nomor WhatsApp
          </label>
          <input
            id="wallet-query"
            type="text"
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: AVR44-SAMPLE-001 atau 0812..."
            className="w-full min-h-[44px] px-4 rounded-xl bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm"
          >
            {loading ? 'Mencari...' : 'Cari Pesanan'}
          </button>
        </div>
      </form>}

      {/* Quick Access Chips */}
      {verified && <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#F7D160] font-semibold">Akses Cepat:</span>
        {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => {
            setQuery('AVR44-SAMPLE-001');
            lookupOrders('AVR44-SAMPLE-001');
          }}
          className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs font-bold text-[#FDF39D] hover:border-[#F5C538]"
        >
          Lihat Contoh Tiket (AVR44-SAMPLE-001)
        </button>
        )}
        {recentOrderCodes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => {
              setQuery(code);
              lookupOrders(code);
            }}
            className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#310603] border border-[#F5C538]/50 text-xs font-bold text-[#FDF39D]"
          >
            {code}
          </button>
        ))}
      </div>}

      {/* Loading / Error / Empty States (antislop R-27) */}
      {loading && (
        <div role="status" className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center">
          <p className="text-sm font-bold text-[#FDF39D]">Sedang mencari pesanan dan tiket Anda...</p>
        </div>
      )}

      {!loading && errorMsg && (
        <div role="alert" className="rounded-2xl border border-[#F5B8CB] bg-[#310603] p-6 space-y-3">
          <p className="text-sm font-extrabold text-[#F5B8CB]">{errorMsg}</p>
          <button
            type="button"
            onClick={() => lookupOrders(query)}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
          >
            Coba Cari Lagi
          </button>
        </div>
      )}

      {verified && !loading && !errorMsg && results.length === 0 && (
        <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-8 text-center space-y-3">
          <p className="text-base font-bold text-[#FDF39D]">Belum Ada Pesanan Ditampilkan</p>
          <p className="text-sm text-[#FFF5D6]/80">
            Masukkan kode pesanan atau nomor WhatsApp Anda di kolom pencarian di atas.
          </p>
          {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => {
              setQuery('AVR44-SAMPLE-001');
              lookupOrders('AVR44-SAMPLE-001');
            }}
            className="min-h-[44px] px-5 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
          >
            Muat Contoh Golden Ticket
          </button>
          )}
        </div>
      )}

      {/* Results List */}
      {!loading &&
        results.map(({ order, items, tickets, shippingZone, qrisDataUrl, pickupQrDataUrl }) => (
          <article
            key={order.id}
            className="rounded-3xl border-2 border-[#F5C538]/50 bg-[#26042A] p-5 sm:p-7 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F5C538]/20 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-extrabold text-[#FDF39D]">{order.order_code}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-extrabold ${
                      order.payment_status === 'PAID'
                        ? 'bg-[#0F2F28] text-[#A0D9CA]'
                        : 'bg-[#7D1B05] text-[#FDF39D]'
                    }`}
                  >
                    {order.payment_status === 'PAID' ? 'LUNAS' : 'MENUNGGU PEMBAYARAN'}
                  </span>
                </div>
                <div className="text-sm font-bold text-[#FFF5D6] mt-1">
                  {order.customer_name} • {order.customer_phone}
                </div>
                <div className="text-xs text-[#FFF5D6]/75">
                  Metode: {order.payment_method} • Total Tagihan: {formatRupiah(order.total_amount)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="no-print min-h-[44px] px-4 py-2 rounded-xl border border-[#F5C538]/60 text-xs font-extrabold text-[#FDF39D] hover:bg-[#310603]"
              >
                Cetak / Simpan PDF Tiket
              </button>
            </div>

            {/* Pending / Rejected QRIS Block */}
            {['PENDING', 'REJECTED'].includes(order.payment_status) && order.payment_method === 'QBIZ_QRIS' && qrisDataUrl && (
              <div className="rounded-2xl bg-[#1A021D] border border-[#F5C538] p-4 flex flex-col sm:flex-row items-center gap-5">
                <img
                  src={qrisDataUrl}
                  alt="QRIS Menunggu Pembayaran"
                  width={180}
                  height={180}
                  className="w-40 h-40 rounded-xl bg-[#FFF9E6] p-2 shrink-0"
                />
                <div className="space-y-2 text-center sm:text-left flex-1 w-full">
                  <div className="text-xs font-bold text-[#F5B8CB]">
                    {order.payment_status === 'REJECTED'
                      ? 'Bukti sebelumnya ditolak. Silakan unggah ulang bukti valid:'
                      : `Bayar persis nominal (termasuk kode unik ${order.unique_code}):`}
                  </div>
                  <div className="text-2xl font-black text-[#FDF39D]">{formatRupiah(order.total_amount)}</div>
                  {order.qbiz_mode === 'STATIC_DYNAMIC_FALLBACK' && (
                    <div className="space-y-2 pt-2 border-t border-[#F5C538]/20">
                      {order.payment_proof_url && (
                        <div className="text-xs text-[#A0D9CA]">
                          Bukti terakhir:{' '}
                          <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="underline font-bold">
                            Lihat Bukti
                          </a>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => setProofFiles((p) => ({ ...p, [order.order_code]: e.target.files?.[0] || null }))}
                          className="min-h-[44px] px-2.5 py-2 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                        />
                        <input
                          type="text"
                          value={proofNotes[order.order_code] || ''}
                          onChange={(e) => setProofNotes((p) => ({ ...p, [order.order_code]: e.target.value }))}
                          placeholder="Catatan pengirim (opsional)"
                          className="min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                        />
                        <button
                          type="button"
                          disabled={uploadingCode === order.order_code}
                          onClick={() => handleWalletProofUpload(order.order_code)}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
                        >
                          {uploadingCode === order.order_code ? 'Mengunggah...' : 'Unggah Bukti'}
                        </button>
                      </div>
                    </div>
                  )}
                  {import.meta.env.DEV && order.qbiz_mode !== 'STATIC_DYNAMIC_FALLBACK' && (
                  <button
                    type="button"
                    disabled={settlingCode === order.order_code}
                    onClick={() => handleSimulateQbiz(order.order_code)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold"
                  >
                    {settlingCode === order.order_code ? 'Memproses...' : 'Simulasi Pembayaran QRIS Lunas'}
                  </button>
                  )}
                </div>
              </div>
            )}

            {/* E-Tickets with 3D Interactive Card + Scannable Cryptographic QR */}
            {tickets.length > 0 && (
              <div className="space-y-5">
                <h3 className="font-ceremonial text-sm font-bold tracking-[0.18em] text-[#F7D160] uppercase">
                  E-Ticket Resmi Aversa 44 ({tickets.length} Lembar)
                </h3>

                {tickets[0] && (
                  <div className="no-print">
                    <GoldenTicket3DCard
                      holderName={tickets[0].holder_name}
                      tierName={tickets[0].tier_name}
                      tierCategory={tickets[0].tier_category}
                      seatZone={tickets[0].seat_zone}
                      ticketCode={tickets[0].ticket_code}
                      paused={pausedMotion}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tickets.map((tkt) => (
                    <div
                      key={tkt.id}
                      className="rounded-2xl border-2 border-[#F5C538] bg-gradient-to-br from-[#310603] to-[#1A021D] p-4 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#F5C538] text-[#310603]">
                            {tkt.tier_category}
                          </span>
                          <div className="text-sm font-extrabold text-[#FDF39D] mt-1.5">{tkt.tier_name}</div>
                          <div className="text-xs font-bold text-[#FFF5D6] mt-1">Pemegang: {tkt.holder_name}</div>
                          <div className="text-xs text-[#A0D9CA]">Zona: {tkt.seat_zone}</div>
                          <div className="font-mono text-[11px] text-[#F7D160] mt-1">{tkt.ticket_code}</div>
                        </div>

                        {tkt.qrDataUrl ? (
                          <img
                            src={tkt.qrDataUrl}
                            alt={`QR Tiket ${tkt.ticket_code}`}
                            width={120}
                            height={120}
                            className="w-28 h-28 rounded-xl bg-[#FFF9E6] p-1.5 shrink-0 border-2 border-[#F5C538]"
                          />
                        ) : (
                          <div className="w-28 h-28 rounded-xl bg-[#26042A] border border-dashed border-[#F5C538]/40 flex items-center justify-center text-center p-2 text-[11px] text-[#F5B8CB]">
                            QR terbit setelah lunas
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-[#F5C538]/20 flex items-center justify-between text-xs">
                        <span
                          className={`font-extrabold ${
                            tkt.status === 'ACTIVE'
                              ? 'text-[#A0D9CA]'
                              : tkt.status === 'USED'
                              ? 'text-[#F5B8CB]'
                              : 'text-[#F7D160]'
                          }`}
                        >
                          Status:{' '}
                          {tkt.status === 'ACTIVE'
                            ? 'AKTIF SIAP SCAN DI GATE'
                            : tkt.status === 'USED'
                            ? `SUDAH CHECK-IN (${tkt.gate_name || 'Gate'})`
                            : 'MENUNGGU PEMBAYARAN'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Merch Items & Pickup QR / Shipping Status */}
            {items.some((i) => i.item_type === 'MERCH') && (
              <div className="rounded-2xl border border-[#A0D9CA]/40 bg-[#1A021D] p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#A0D9CA] uppercase tracking-wider">
                      Status Pengambilan / Pengiriman Merchandise
                    </h3>
                    <p className="text-xs text-[#FFF5D6]/85 mt-0.5">
                      Mode: {order.fulfillment_mode === 'PICKUP_BOOTH' ? 'Ambil di Tempat (Booth SinemaTIK SMAN 1 Gedeg)' : order.fulfillment_mode === 'LOCAL_COURIER' ? 'Kurir Lokal SinemaTIK Mojokerto' : 'Ekspedisi Reguler'}
                      {shippingZone ? ` • ${shippingZone.zone_name}` : ''}
                    </p>
                  </div>
                  <span className="w-fit px-3 py-1 rounded bg-[#26042A] border border-[#A0D9CA]/40 text-xs font-bold text-[#A0D9CA]">
                    {order.fulfillment_status}
                  </span>
                </div>

                <ul className="space-y-1.5 text-xs text-[#FFF5D6]/90">
                  {items
                    .filter((i) => i.item_type === 'MERCH')
                    .map((m) => (
                      <li key={m.id} className="flex justify-between border-b border-white/10 pb-1">
                        <span>
                          {m.quantity}x {m.item_name} ({m.variant_label})
                        </span>
                        <span className="font-bold">{formatRupiah(m.subtotal)}</span>
                      </li>
                    ))}
                </ul>

                {order.tracking_number && (
                  <div className="rounded-lg bg-[#0F2F28] border border-[#A0D9CA] p-3 text-xs font-bold text-[#A0D9CA]">
                    Nomor Resi Pengiriman: <span className="font-mono">{order.tracking_number}</span>
                  </div>
                )}

                {order.fulfillment_mode === 'PICKUP_BOOTH' && pickupQrDataUrl && (
                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                    <img
                      src={pickupQrDataUrl}
                      alt={`QR Pengambilan Merch ${order.order_code}`}
                      width={130}
                      height={130}
                      className="w-32 h-32 rounded-xl bg-[#FFF9E6] p-2 border-2 border-[#A0D9CA]"
                    />
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="text-sm font-extrabold text-[#A0D9CA]">
                        QR Serah Terima Merch di Booth SinemaTIK SMAN 1 Gedeg
                      </div>
                      <div className="text-xs text-[#FFF5D6]/85">
                        {order.pickup_verified_at
                          ? `Sudah diambil oleh pembeli pada ${new Date(order.pickup_verified_at).toLocaleString('id-ID')} (Petugas: ${order.pickup_verified_by})`
                          : 'Tunjukkan QR ini ke petugas booth merchandise untuk mengambil paket Anda.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
    </section>
  );
};
