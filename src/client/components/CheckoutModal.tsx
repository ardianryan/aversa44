import { TurnstileChallenge } from './ui/TurnstileChallenge.tsx';
import React, { useEffect, useState } from 'react';
import { ResponsiveSheet } from './ui/ResponsiveSheet.tsx';
import type { CartItem, HydratedOrder, ShippingZone } from '../types.ts';
import { formatRupiah } from '../types.ts';

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  shippingZones: ShippingZone[];
  qrisEnabled: boolean;
  xenditEnabled?: boolean;
  bankPaymentInfo?: string;
  onUpdateQty: (key: string, delta: number) => void;
  onClearCart: () => void;
  onOrderCreated: (hydrated: HydratedOrder) => void;
  onOpenWallet: (orderCode: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  open,
  onClose,
  cart,
  shippingZones,
  qrisEnabled,
  xenditEnabled = false,
  bankPaymentInfo,
  onUpdateQty,
  onClearCart,
  onOrderCreated,
  onOpenWallet,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerType, setCustomerType] = useState<'SISWA' | 'GURU' | 'ALUMNI' | 'UMUM' | 'VIP'>('UMUM');
  const [identityNumber, setIdentityNumber] = useState('');
  const [kelasAngkatan, setKelasAngkatan] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState<'PICKUP_BOOTH' | 'LOCAL_COURIER' | 'REGULER_EXPEDITION'>('PICKUP_BOOTH');
  const [selectedZoneId, setSelectedZoneId] = useState<number>(0);
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingNotes, setShippingNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'QBIZ_QRIS' | 'CASH_BOOTH' | 'XENDIT' | 'MANUAL_TRANSFER'>('CASH_BOOTH');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [securityReset, setSecurityReset] = useState(0);
  const [createdResult, setCreatedResult] = useState<HydratedOrder | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState('');
  const [copiedTag, setCopiedTag] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [settling, setSettling] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    description?: string;
    discountAmount: number;
  } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState('');

  const handleApplyCoupon = async () => {
    const cleanCode = couponInput.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError('Masukkan kode kupon terlebih dahulu.');
      return;
    }
    setCouponBusy(true);
    setCouponError('');
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          items: cart.map((i) => ({ itemType: i.itemType, id: i.id, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.coupon) {
        setAppliedCoupon(null);
        setCouponError(data.error || 'Kode kupon tidak dapat digunakan.');
        return;
      }
      setAppliedCoupon({
        code: data.coupon.code,
        description: data.coupon.description,
        discountAmount: Number(data.coupon.discountAmount || 0),
      });
      setCouponInput(data.coupon.code);
    } catch {
      setCouponError('Gagal memeriksa kode kupon.');
    } finally {
      setCouponBusy(false);
    }
  };

  const copyToClipboard = (tag: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedTag(tag);
    window.setTimeout(() => setCopiedTag(''), 1800);
  };

  useEffect(() => {
    if (open && !createdResult) {
      setPaymentMethod(qrisEnabled ? 'QBIZ_QRIS' : 'CASH_BOOTH');
      setCheckoutStep(1);
      setErrorMsg('');
      setCouponError('');
    }
  }, [open, qrisEnabled, createdResult]);

  const hasMerch = cart.some((item) => item.itemType === 'MERCH');
  const requiresStudentId = cart.some((item) => item.requiresStudentId);
  const subtotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const totalWeightGrams = cart.reduce(
    (acc, i) => acc + (i.itemType === 'MERCH' ? (i.weightGrams || 250) * i.quantity : 0),
    0
  );

  const zonesForMode = shippingZones.filter((z) => z.mode === fulfillmentMode);
  const activeZone =
    zonesForMode.find((z) => z.id === selectedZoneId) || zonesForMode[0] || null;

  const estimatedShipping = !hasMerch
    ? 0
    : !activeZone
    ? 0
    : activeZone.mode === 'PICKUP_BOOTH'
    ? 0
    : activeZone.mode === 'LOCAL_COURIER'
    ? activeZone.base_cost
    : activeZone.cost_per_kg * Math.max(1, Math.ceil(totalWeightGrams / 1000));

  useEffect(() => {
    if (zonesForMode.length > 0 && !zonesForMode.some((z) => z.id === selectedZoneId)) {
      setSelectedZoneId(zonesForMode[0].id);
    }
  }, [fulfillmentMode, shippingZones]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-poll payment status every 4 seconds when QBiz QRIS invoice is PENDING
  useEffect(() => {
    if (!open || !createdResult) return;
    if (createdResult.order.payment_status !== 'PENDING') return;
    if (createdResult.order.payment_method !== 'QBIZ_QRIS') return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${createdResult.order.order_code}`);
        const data = await res.json();
        if (data.success && data.order) {
          setCreatedResult(data);
          if (data.order.payment_status === 'PAID') {
            onOrderCreated(data);
          }
        }
      } catch {
        // silent poll retry
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [open, createdResult]);

  const handleClose = () => {
    setCreatedResult(null);
    onClose();
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstileToken: securityToken,
          customerName,
          customerPhone,
          customerEmail,
          customerType: requiresStudentId ? 'SISWA' : customerType,
          identityNumber,
          kelasAngkatan,
          fulfillmentMode: hasMerch ? fulfillmentMode : 'PICKUP_BOOTH',
          shippingZoneId: hasMerch && activeZone ? activeZone.id : undefined,
          shippingAddress: hasMerch && fulfillmentMode !== 'PICKUP_BOOTH' ? shippingAddress : undefined,
          shippingNotes,
          couponCode: appliedCoupon?.code || '',
          paymentMethod,
          items: cart.map((c) => ({
            itemType: c.itemType,
            id: c.id,
            variantLabel: c.variantLabel,
            quantity: c.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses checkout.');
      }

      // Hydrate order with full details
      const detRes = await fetch(`/api/orders/${data.order.order_code}`);
      const detData = await detRes.json();
      const hydrated: HydratedOrder = detData.success
        ? detData
        : {
            order: data.order,
            items: [],
            tickets: data.tickets || [],
            shippingZone: activeZone,
            qrisDataUrl: data.qrisDataUrl || null,
            pickupQrDataUrl: null,
          };

      setCreatedResult(hydrated);
      onOrderCreated(hydrated);
      onClearCart();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat membuat pesanan.');
    } finally {
      setSecurityToken(''); setSecurityReset((n) => n + 1);
      setSubmitting(false);
    }
  };

  const handleSimulateQbizPaid = async () => {
    if (!createdResult) return;
    setSettling(true);
    try {
      const res = await fetch(`/api/orders/${createdResult.order.order_code}/simulate-qbiz-webhook`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setCreatedResult(data);
        onOrderCreated(data);
      }
    } finally {
      setSettling(false);
    }
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdResult || (!proofFile && !proofNote.trim())) return;
    setSettling(true);
    setProofError('');
    try {
      let res: Response;
      if (proofFile) {
        const fd = new FormData();
        fd.append('proofFile', proofFile);
        if (proofNote.trim()) fd.append('note', proofNote.trim());
        res = await fetch(`/api/orders/${createdResult.order.order_code}/upload-proof`, {
          method: 'POST',
          body: fd,
        });
      } else {
        res = await fetch(`/api/orders/${createdResult.order.order_code}/upload-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: proofNote }),
        });
      }
      const data = await res.json();
      if (data.success) {
        setCreatedResult((prev) => (prev ? { ...prev, order: data.order } : prev));
        setProofNote('');
        setProofFile(null);
      } else {
        setProofError(data.error || 'Gagal mengunggah bukti pembayaran.');
      }
    } finally {
      setSettling(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={handleClose}
      title={createdResult ? `Pesanan ${createdResult.order.order_code}` : 'Keranjang & Checkout Aversa 44'}
      subtitle={
        createdResult
          ? 'Selesaikan pembayaran untuk mengaktifkan QR E-Ticket dan QR Merch.'
          : 'Periksa pilihan dan data Anda sebelum membuat pesanan.'
      }
      maxWidthClass="md:max-w-2xl"
    >
      {/* POST-CHECKOUT PAYMENT VIEW */}
        {createdResult ? (
          <div className="space-y-5">
            <div
              className={`rounded-2xl p-4 border ${
                createdResult.order.payment_status === 'PAID'
                  ? 'bg-[#0F2F28] border-[#A0D9CA] text-[#A0D9CA]'
                  : createdResult.order.payment_status === 'REJECTED'
                  ? 'bg-[#310603] border-[#F5B8CB] text-[#F5B8CB]'
                  : 'bg-[#310603] border-[#F5C538] text-[#FDF39D]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider">
                  {createdResult.order.payment_status === 'PAID'
                    ? 'Lunas & Aktif'
                    : createdResult.order.payment_status === 'REJECTED'
                    ? 'Bukti Ditolak'
                    : createdResult.order.payment_proof_url
                    ? 'Menunggu Verifikasi Admin'
                    : 'Menunggu Pembayaran'}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('code', createdResult.order.order_code)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#1A021D]/70 border border-[#F5C538]/40 text-[11px] font-mono font-bold text-[#FDF39D]"
                >
                  {copiedTag === 'code' ? 'Kode Disalin!' : `Salin ${createdResult.order.order_code}`}
                </button>
              </div>
              <div className="text-lg font-extrabold mt-1">
                {createdResult.order.payment_status === 'PAID'
                  ? 'Pembayaran Lunas! E-Ticket & QR Anda Sudah Aktif.'
                  : createdResult.order.payment_status === 'REJECTED'
                  ? 'Bukti Pembayaran Ditolak. Silakan Unggah Ulang Bukti Valid.'
                  : createdResult.order.payment_method === 'QBIZ_QRIS'
                  ? createdResult.order.qbiz_mode === 'STATIC_DYNAMIC_FALLBACK'
                    ? '1. Pindai QRIS Dinamis -> 2. Unggah Bukti Transfer'
                    : 'Pindai QRIS Dinamis Berikut (Berlaku 5 Menit)'
                  : createdResult.order.payment_method === 'CASH_BOOTH'
                  ? 'Silakan Bayar Tunai di Booth SinemaTIK SMAN 1 Gedeg'
                  : 'Transfer Rekening & Unggah Bukti Pembayaran'}
              </div>
            </div>

            {['PENDING', 'REJECTED'].includes(createdResult.order.payment_status) &&
              createdResult.order.payment_method === 'QBIZ_QRIS' && (
                <div className="rounded-2xl bg-[#1A021D] border border-[#F5C538]/50 p-5 text-center space-y-4">
                  <div className="bg-[#310603] border border-[#F5C538] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                    <div>
                      <div className="text-[11px] text-[#F7D160] font-semibold">
                        NOMINAL TOTAL PERSIS (TERMASUK KODE UNIK {createdResult.order.unique_code}):
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-[#FDF39D] mt-0.5 tabular-nums">
                        {formatRupiah(createdResult.order.total_amount)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('amt', String(createdResult.order.total_amount))}
                      className="min-h-[44px] px-4 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
                    >
                      {copiedTag === 'amt' ? 'Nominal Disalin!' : 'Salin Nominal'}
                    </button>
                  </div>

                  {createdResult.qrisDataUrl && (
                    <div className="inline-block p-3 rounded-2xl bg-[#FFF9E6] border-4 border-[#F5C538]">
                      <img
                        src={createdResult.qrisDataUrl}
                        alt="QR Code QRIS Dinamis Pembayaran Aversa 44"
                        width={240}
                        height={240}
                        className="w-52 h-52 object-contain mx-auto"
                      />
                    </div>
                  )}

                  <p className="text-xs text-[#FFF5D6]/80">
                    Nominal {formatRupiah(createdResult.order.total_amount)} sudah tertanam otomatis pada kode QRIS di
                    atas. Status diperiksa otomatis tiap 4 detik.
                  </p>

                  {createdResult.order.qbiz_mode === 'STATIC_DYNAMIC_FALLBACK' && (
                    <form onSubmit={handleUploadProof} className="text-left space-y-3 pt-3 border-t border-[#F5C538]/25">
                      <div className="text-xs font-extrabold text-[#FDF39D]">
                        Unggah Bukti Transfer QRIS (Dikirim ke WhatsApp Admin)
                      </div>
                      <div>
                        <label htmlFor="qris-proof-file" className="block text-xs font-bold text-[#F7D160] mb-1">
                          Foto / Screenshot Bukti Pembayaran (PNG, JPG, WebP, maks 8 MB) *
                        </label>
                        <input
                          id="qris-proof-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                          className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#26042A] border border-[#F5C538]/40 text-xs text-[#FFF5D6]"
                        />
                      </div>
                      <div>
                        <label htmlFor="qris-proof-note" className="block text-xs font-bold text-[#F7D160] mb-1">
                          Catatan Pengirim (Opsional)
                        </label>
                        <input
                          id="qris-proof-note"
                          type="text"
                          value={proofNote}
                          onChange={(e) => setProofNote(e.target.value)}
                          placeholder="Contoh: Dana a.n. Budi jam 14:20"
                          className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/40 text-xs text-[#FFF5D6]"
                        />
                      </div>
                      {proofError && <div className="text-xs font-bold text-[#F5B8CB]">{proofError}</div>}
                      {createdResult.order.payment_proof_url && (
                        <div className="rounded-xl bg-[#26042A] border border-[#A0D9CA]/40 p-3 flex items-center gap-3">
                          <img
                            src={createdResult.order.payment_proof_url}
                            alt="Bukti transfer terunggah"
                            className="w-14 h-14 rounded-lg object-cover border border-[#F5C538]/30 shrink-0"
                          />
                          <div className="text-xs text-[#A0D9CA] font-semibold">
                            Bukti transfer sudah terkirim ke Admin. Menunggu konfirmasi WhatsApp.
                          </div>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={settling || (!proofFile && !proofNote.trim())}
                        className="w-full min-h-[44px] px-5 py-2 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold disabled:opacity-50"
                      >
                        {settling ? 'Mengunggah Bukti...' : 'Kirim Bukti Pembayaran ke Admin'}
                      </button>
                    </form>
                  )}

                  {import.meta.env.DEV && createdResult.order.qbiz_mode !== 'STATIC_DYNAMIC_FALLBACK' && (
                  <div className="pt-2 border-t border-[#F5C538]/20">
                    <button
                      type="button"
                      disabled={settling}
                      onClick={handleSimulateQbizPaid}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold hover:brightness-105"
                    >
                      {settling ? 'Memverifikasi Pembayaran...' : 'Simulasi Konfirmasi Pembayaran QRIS'}
                    </button>
                  </div>
                  )}
                </div>
              )}

            {createdResult.order.payment_status === 'PENDING' &&
              createdResult.order.payment_method === 'CASH_BOOTH' && (
                <div className="rounded-2xl bg-[#1A021D] border border-[#F5C538]/40 p-5 space-y-2 text-sm">
                  <p className="font-bold text-[#FDF39D]">
                    Kode Booking Kasir: <span className="font-mono text-lg">{createdResult.order.order_code}</span>
                  </p>
                  <p className="text-[#FFF5D6]/85">
                    Tunjukkan kode di atas kepada Tim SinemaTIK di Booth SMAN 1 Gedeg dan bayar sebesar{' '}
                    <strong>{formatRupiah(createdResult.order.total_amount)}</strong>. Tiket/merchandise akan aktif seketika setelah
                    dikonfirmasi.
                  </p>
                </div>
              )}

            {createdResult.order.payment_status === 'PENDING' &&
              (createdResult.order.payment_method === 'MANUAL_TRANSFER' ||
                createdResult.order.payment_method === 'XENDIT') && (
                <form
                  onSubmit={handleUploadProof}
                  className="rounded-2xl bg-[#1A021D] border border-[#F5C538]/40 p-5 space-y-3"
                >
                  <div className="text-sm font-bold text-[#FDF39D]">
                    Total Tagihan: {formatRupiah(createdResult.order.total_amount)}
                  </div>
                  <p className="text-xs text-[#FFF5D6]/85">
                    {bankPaymentInfo ||
                      'Transfer ke Rekening Resmi SinemaTIK (Official Merch & Media Partner AVERSA 44)'}
                    , lalu kirim keterangan bukti transfer di bawah ini.
                  </p>
                  <div>
                    <label htmlFor="proof-note" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Keterangan Pengirim / Nomor Referensi Transfer
                    </label>
                    <input
                      id="proof-note"
                      type="text"
                      required
                      value={proofNote}
                      onChange={(e) => setProofNote(e.target.value)}
                      placeholder="Contoh: BRI a.n. Siti Aminah jam 09:15"
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/40 text-sm text-[#FFF5D6]"
                    />
                  </div>
                  {createdResult.order.payment_proof_note && (
                    <div className="text-xs text-[#A0D9CA] font-semibold">
                      Bukti tercatat: {createdResult.order.payment_proof_note} (Menunggu verifikasi Admin)
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={settling}
                    className="min-h-[44px] px-5 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
                  >
                    Kirim Konfirmasi Bukti Bayar
                  </button>
                </form>
              )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  const code = createdResult.order.order_code;
                  setCreatedResult(null);
                  onClose();
                  onOpenWallet(code);
                }}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm"
              >
                Buka Dompet Tiket &amp; Status Pesanan
              </button>
            </div>
          </div>
        ) : cart.length === 0 ? (
          /* EMPTY CART STATE (R-27) */
          <div className="py-10 text-center space-y-4">
            <img
              src="/assets/brandkit/item-golden-ticket-badge.svg"
              alt=""
              width={72}
              height={72}
              className="w-16 h-16 mx-auto opacity-80"
            />
            <div>
              <p className="text-lg font-extrabold text-[#FDF39D]">Keranjang Pesanan Masih Kosong</p>
              <p className="text-sm text-[#FFF5D6]/80 mt-1">
                Pilih E-Ticket Puncak Aversa 44 atau Official Merchandise terlebih dahulu sebelum melakukan checkout.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
            >
              Pilih Tiket atau Merchandise
            </button>
          </div>
        ) : (
          /* 2-STEP CHECKOUT FORM */
          <form onSubmit={handleCheckout} className="space-y-5">
            {/* Step Indicator */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#1A021D] border border-[#F5C538]/30 p-1">
              <button
                type="button"
                onClick={() => { setErrorMsg(''); setCheckoutStep(1); }}
                className={`min-h-[44px] rounded-lg text-xs font-extrabold transition-colors ${
                  checkoutStep === 1 ? 'bg-[#F5C538] text-[#310603]' : 'text-[#FFF5D6]/80'
                }`}
              >
                1. Data &amp; Pengiriman
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!customerName.trim() || !customerPhone.trim()) {
                    setErrorMsg('Isi Nama Lengkap dan Nomor WhatsApp terlebih dahulu.');
                    return;
                  }
                  if (requiresStudentId && !identityNumber.trim()) {
                    setErrorMsg('NISN / NIP wajib diisi untuk tiket internal.');
                    return;
                  }
                  if (hasMerch && fulfillmentMode !== 'PICKUP_BOOTH' && !shippingAddress.trim()) {
                    setErrorMsg('Alamat lengkap penerima wajib diisi untuk pengiriman.');
                    return;
                  }
                  setErrorMsg('');
                  setCheckoutStep(2);
                }}
                className={`min-h-[44px] rounded-lg text-xs font-extrabold transition-colors ${
                  checkoutStep === 2 ? 'bg-[#F5C538] text-[#310603]' : 'text-[#FFF5D6]/80'
                }`}
              >
                2. Pembayaran ({formatRupiah(subtotal + estimatedShipping)})
              </button>
            </div>

            {checkoutStep === 1 && (
              <div className="space-y-5">
            {/* Cart Items List */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F7D160]">Ringkasan Item ({cart.length})</h3>
              {cart.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-[#1A021D] border border-[#F5C538]/25 p-3.5"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#310603] text-[#F5C538]">
                      {item.itemType === 'TICKET' ? 'E-TICKET' : 'MERCH'}
                    </span>
                    <div className="text-sm font-bold text-[#FFF5D6] mt-1">{item.name}</div>
                    <div className="text-xs text-[#A0D9CA]">Varian: {item.variantLabel} • {formatRupiah(item.unitPrice)}</div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <button
                      type="button"
                      aria-label={`Kurangi jumlah ${item.name}`}
                      onClick={() => onUpdateQty(item.key, -1)}
                      className="min-w-[44px] min-h-[44px] rounded-lg bg-[#26042A] border border-[#F5C538]/35 font-extrabold text-[#FDF39D]"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Tambah jumlah ${item.name}`}
                      onClick={() => onUpdateQty(item.key, 1)}
                      className="min-w-[44px] min-h-[44px] rounded-lg bg-[#26042A] border border-[#F5C538]/35 font-extrabold text-[#FDF39D]"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Kode Kupon / Promo (Step 1) */}
            <div className="space-y-2.5 rounded-xl bg-[#1A021D]/70 border border-[#F5C538]/25 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F7D160]">Kode Kupon / Promo</h3>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput('');
                      setCouponError('');
                    }}
                    className="text-[11px] font-bold text-[#F5B8CB] hover:underline"
                  >
                    Hapus Kupon
                  </button>
                )}
              </div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#A0D9CA]/10 border border-[#A0D9CA]/40 px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-extrabold text-[#A0D9CA]">
                      Kupon {appliedCoupon.code} aktif
                    </div>
                    {appliedCoupon.description && (
                      <div className="text-[11px] text-[#FFF5D6]/80">{appliedCoupon.description}</div>
                    )}
                  </div>
                  <div className="text-xs font-black text-[#A0D9CA]">
                    -{formatRupiah(appliedCoupon.discountAmount)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Masukkan kode kupon (opsional)"
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#26042A] border border-[#F5C538]/30 text-sm font-mono uppercase text-[#FFF5D6] placeholder:font-sans placeholder:normal-case placeholder:text-[#FFF5D6]/45"
                  />
                  <button
                    type="button"
                    disabled={couponBusy || !couponInput.trim()}
                    onClick={handleApplyCoupon}
                    className="min-h-[44px] px-5 rounded-xl bg-[#310603] border border-[#F5C538]/55 text-xs font-extrabold text-[#FDF39D] disabled:opacity-50"
                  >
                    {couponBusy ? 'Memeriksa...' : 'Pakai Kupon'}
                  </button>
                </div>
              )}
              {couponError && (
                <div className="text-[11px] font-bold text-[#F5B8CB]">{couponError}</div>
              )}
            </div>

            {/* Buyer Information */}
            <div className="space-y-3 rounded-xl bg-[#1A021D]/70 border border-[#F5C538]/25 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F7D160]">Identitas Pemesan</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="chk-name" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Nama Lengkap (Sesuai E-Ticket) *
                  </label>
                  <input
                    id="chk-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Nadia Kusuma"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
                <div>
                  <label htmlFor="chk-phone" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input
                    id="chk-phone"
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="chk-email" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Email (Opsional untuk Salinan)
                  </label>
                  <input
                    id="chk-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
                <div>
                  <label htmlFor="chk-type" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Kategori Pemesan *
                  </label>
                  <select
                    id="chk-type"
                    value={requiresStudentId ? 'SISWA' : customerType}
                    onChange={(e) => setCustomerType(e.target.value as any)}
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  >
                    <option value="UMUM">Masyarakat Umum</option>
                    <option value="ALUMNI">Alumni SMAN 1 Gedeg</option>
                    <option value="SISWA">Siswa Aktif SMAN 1 Gedeg</option>
                    <option value="GURU">Guru / Tenaga Kependidikan</option>
                    <option value="VIP">Tamu Undangan / Sponsor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="chk-idnum" className="block text-sm font-bold text-[#F7D160] mb-1">
                    NISN / NIP {requiresStudentId ? '(Wajib untuk Tiket Internal) *' : '(Opsional)'}
                  </label>
                  <input
                    id="chk-idnum"
                    type="text"
                    required={requiresStudentId}
                    value={identityNumber}
                    onChange={(e) => setIdentityNumber(e.target.value)}
                    placeholder="Nomor NISN / NIP"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
                <div>
                  <label htmlFor="chk-kelas" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Kelas / Tahun Angkatan (Opsional)
                  </label>
                  <input
                    id="chk-kelas"
                    type="text"
                    value={kelasAngkatan}
                    onChange={(e) => setKelasAngkatan(e.target.value)}
                    placeholder="Contoh: XII 4 / Alumni 2018"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
              </div>
            </div>

            {/* Merchandise Fulfillment Selector (Ambil di Tempat vs Antar Kurir/Ekspedisi) */}
            {hasMerch && (
              <div className="space-y-3 rounded-xl bg-[#1A021D]/70 border border-[#A0D9CA]/35 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A0D9CA]">
                  Pengambilan &amp; Pengiriman Merchandise ({totalWeightGrams}g)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'PICKUP_BOOTH', title: 'Ambil di Tempat', sub: 'Booth SinemaTIK SMAN 1 Gedeg (Gratis)' },
                    { id: 'LOCAL_COURIER', title: 'Antar Lokal SinemaTIK', sub: 'Kurir Mojokerto / Gedeg' },
                    { id: 'REGULER_EXPEDITION', title: 'Ekspedisi Luar Kota', sub: 'JNE / J&T Reguler' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={fulfillmentMode === opt.id}
                      onClick={() => setFulfillmentMode(opt.id as any)}
                      className={`min-h-[56px] p-3 rounded-xl border text-left transition-all ${
                        fulfillmentMode === opt.id
                          ? 'bg-[#0F2F28] border-[#A0D9CA] text-[#A0D9CA]'
                          : 'bg-[#26042A] border-[#F5C538]/25 text-[#FFF5D6]/85'
                      }`}
                    >
                      <div className="text-sm font-extrabold">{opt.title}</div>
                      <div className="text-xs opacity-90 mt-1">{opt.sub}</div>
                    </button>
                  ))}
                </div>

                {zonesForMode.length > 0 && (
                  <div>
                    <label htmlFor="chk-zone" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Pilih Lokasi / Zona Pengiriman *
                    </label>
                    <select
                      id="chk-zone"
                      value={activeZone?.id || ''}
                      onChange={(e) => setSelectedZoneId(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                    >
                      {zonesForMode.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.zone_name} ({z.estimated_days})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {fulfillmentMode !== 'PICKUP_BOOTH' && (
                  <div>
                    <label htmlFor="chk-address" className="block text-sm font-bold text-[#F7D160] mb-1">
                      Alamat Lengkap Penerima (Jalan, RT/RW, Desa, Kecamatan, Kota) *
                    </label>
                    <textarea
                      id="chk-address"
                      rows={2}
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Contoh: Dusun Krajan RT 02 RW 01, Desa Gempolkerep, Kec. Gedeg, Mojokerto"
                      className="w-full p-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="chk-notes" className="block text-sm font-bold text-[#F7D160] mb-1">
                    Catatan Pengambilan / Pengiriman (Opsional)
                  </label>
                  <input
                    id="chk-notes"
                    type="text"
                    value={shippingNotes}
                    onChange={(e) => setShippingNotes(e.target.value)}
                    placeholder="Contoh: Diambil setelah jam sekolah / titip satpam"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
                  />
                </div>
              </div>
            )}

              {errorMsg && (
                <div role="alert" className="p-3 rounded-lg bg-[#310603] border border-[#F5B8CB] text-xs font-bold text-[#F5B8CB]">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!customerName.trim() || !customerPhone.trim()) {
                    setErrorMsg('Isi Nama Lengkap dan Nomor WhatsApp terlebih dahulu.');
                    return;
                  }
                  if (requiresStudentId && !identityNumber.trim()) {
                    setErrorMsg('NISN / NIP wajib diisi untuk tiket internal.');
                    return;
                  }
                  if (hasMerch && fulfillmentMode !== 'PICKUP_BOOTH' && !shippingAddress.trim()) {
                    setErrorMsg('Alamat lengkap penerima wajib diisi untuk pengiriman.');
                    return;
                  }
                  setErrorMsg('');
                  setCheckoutStep(2);
                }}
                className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-[#F5C538] text-[#310603] font-extrabold text-sm hover:brightness-105"
              >
                Lanjut ke Pilih Pembayaran &rarr;
              </button>
            </div>
            )}

            {checkoutStep === 2 && (
            <div className="space-y-5">
            {/* Hybrid Payment Method */}
            <div className="space-y-3 rounded-xl bg-[#1A021D]/70 border border-[#F5C538]/25 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F7D160]">Pilih Metode Pembayaran</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  ...(qrisEnabled ? [{ id: 'QBIZ_QRIS', title: 'Bayar dengan QRIS', sub: 'Pindai QRIS untuk membayar', tag: 'Rekomendasi' }] : []),
                  { id: 'CASH_BOOTH', title: 'Bayar Tunai di Booth SinemaTIK', sub: 'Verifikasi langsung oleh Tim SinemaTIK', tag: 'Di Lokasi' },
                  ...(xenditEnabled ? [{ id: 'XENDIT', title: 'Xendit Gateway (VA / E-Wallet)', sub: 'Pembayaran via Virtual Account', tag: 'Otomatis' }] : []),
                  { id: 'MANUAL_TRANSFER', title: 'Transfer Rekening SinemaTIK', sub: 'Unggah catatan bukti transfer', tag: 'Manual' },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    aria-pressed={paymentMethod === pm.id}
                    onClick={() => setPaymentMethod(pm.id as any)}
                    className={`min-h-[60px] p-3.5 rounded-xl border text-left transition-all ${
                      paymentMethod === pm.id
                        ? 'bg-[#310603] border-[#F5C538] text-[#FDF39D]'
                        : 'bg-[#26042A] border-[#F5C538]/25 text-[#FFF5D6]/85'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold">{pm.title}</span>
                      <span className="rounded-full bg-[#1A021D] border border-[#F5C538]/30 px-2 py-0.5 text-[10px] font-bold text-[#A0D9CA] shrink-0">
                        {pm.tag}
                      </span>
                    </div>
                    <div className="text-xs opacity-90 mt-1">{pm.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Kode Kupon / Promo */}
            <div className="space-y-2.5 rounded-xl bg-[#1A021D]/70 border border-[#F5C538]/25 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F7D160]">Kode Kupon / Promo</h3>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput('');
                      setCouponError('');
                    }}
                    className="text-[11px] font-bold text-[#F5B8CB] hover:underline"
                  >
                    Hapus Kupon
                  </button>
                )}
              </div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#A0D9CA]/10 border border-[#A0D9CA]/40 px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-extrabold text-[#A0D9CA]">
                      Kupon {appliedCoupon.code} aktif
                    </div>
                    {appliedCoupon.description && (
                      <div className="text-[11px] text-[#FFF5D6]/80">{appliedCoupon.description}</div>
                    )}
                  </div>
                  <div className="text-xs font-black text-[#A0D9CA]">
                    -{formatRupiah(appliedCoupon.discountAmount)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Masukkan kode kupon (opsional)"
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#26042A] border border-[#F5C538]/30 text-sm font-mono uppercase text-[#FFF5D6] placeholder:font-sans placeholder:normal-case placeholder:text-[#FFF5D6]/45"
                  />
                  <button
                    type="button"
                    disabled={couponBusy || !couponInput.trim()}
                    onClick={handleApplyCoupon}
                    className="min-h-[44px] px-5 rounded-xl bg-[#310603] border border-[#F5C538]/55 text-xs font-extrabold text-[#FDF39D] disabled:opacity-50"
                  >
                    {couponBusy ? 'Memeriksa...' : 'Pakai Kupon'}
                  </button>
                </div>
              )}
              {couponError && (
                <div className="text-[11px] font-bold text-[#F5B8CB]">{couponError}</div>
              )}
            </div>

            <TurnstileChallenge action="checkout" onToken={setSecurityToken} resetKey={securityReset} />
            {errorMsg && (
              <div role="alert" className="p-3 rounded-lg bg-[#310603] border border-[#F5B8CB] text-xs font-bold text-[#F5B8CB]">
                {errorMsg}
              </div>
            )}

            {/* Summary & Submit */}
            <div className="rounded-xl bg-[#1A021D] border border-[#F5C538]/40 p-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-x-3 text-xs text-[#FFF5D6]/85">
                <span>Subtotal Tiket &amp; Merch</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex flex-wrap justify-between gap-x-3 text-xs font-bold text-[#A0D9CA]">
                  <span>Potongan Kupon ({appliedCoupon.code})</span>
                  <span>-{formatRupiah(appliedCoupon.discountAmount)}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-x-3 text-xs text-[#FFF5D6]/85">
                <span>Biaya Pengiriman</span>
                <span>{estimatedShipping === 0 ? 'Gratis' : formatRupiah(estimatedShipping)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 text-base font-extrabold text-[#FDF39D] pt-2 border-t border-[#F5C538]/20">
                <span>Estimasi Total Tagihan</span>
                <span>
                  {formatRupiah(
                    Math.max(1000, subtotal - (appliedCoupon?.discountAmount || 0) + estimatedShipping)
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[#A0D9CA]">
                Untuk metode QRIS, sistem akan menambahkan 3 digit kode unik otomatis pada layar tagihan berikutnya.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => { setErrorMsg(''); setCheckoutStep(1); }}
                className="min-h-[48px] px-5 rounded-xl border border-[#F5C538]/45 text-xs font-extrabold text-[#FDF39D] sm:w-40"
              >
                &larr; Kembali
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[50px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#E09D17] via-[#F5C538] to-[#F7D160] text-[#310603] font-extrabold text-sm sm:text-base"
              >
                {submitting ? 'Membuat Pesanan & QR...' : 'Buat Pesanan & Bayar'}
              </button>
            </div>
            </div>
            )}
          </form>
        )}
    </ResponsiveSheet>
  );
};
