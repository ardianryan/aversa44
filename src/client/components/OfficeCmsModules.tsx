import React, { useState } from 'react';
import jsQR from 'jsqr';
import { ResponsiveSheet } from './ui/ResponsiveSheet.tsx';
import { ConfirmModal } from './ui/ConfirmModal.tsx';
import type {
  AnatomySlide,
  MerchProduct,
  ShippingZone,
  TicketTier,
  TimelineEvent,
} from '../types.ts';
import { formatRupiah } from '../types.ts';

interface CmsCommonProps {
  adminData: any;
  onRefresh: () => Promise<void>;
  onCatalogRefresh: () => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

// ---------------------------------------------------------------------------
// 1. OVERVIEW / DECISION COMMAND CENTER
// ---------------------------------------------------------------------------
export const OfficeOverviewView: React.FC<
  CmsCommonProps & { onSwitchSection: (sec: string) => void }
> = ({ adminData, onRefresh, onCatalogRefresh, onNotify, onSwitchSection }) => {
  const m = adminData.metrics || {};
  const pendingOrders = (adminData.orders || []).filter((o: any) => o.payment_status === 'PENDING');
  const activeTiers = (adminData.ticketTiers || []).filter((t: TicketTier) => t.is_active);

  const handleConfirm = async (code: string) => {
    const res = await fetch(`/api/admin/orders/${code}/confirm-payment`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      onNotify(`Pesanan ${code} dikonfirmasi lunas & QR aktif.`);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(data.error || 'Gagal mengonfirmasi pesanan.', true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
          Ringkasan Operasional &amp; Antrean Tindakan
        </h2>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/80 mt-1">
          Pantau pesanan yang menunggu konfirmasi, sisa kuota tiket aktif, serta pemasukan real-time dari PostgreSQL.
        </p>
      </div>

      {/* Real PostgreSQL KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/40 p-4">
          <div className="text-xs text-[#F7D160]">Total Pendapatan Lunas</div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#FDF39D] mt-1 tabular-nums">
            {formatRupiah(Number(m.total_revenue || 0))}
          </div>
        </div>
        <div className="rounded-2xl bg-[#26042A] border border-[#A0D9CA]/40 p-4">
          <div className="text-xs text-[#A0D9CA]">Pesanan Lunas</div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#FFF5D6] mt-1 tabular-nums">
            {m.paid_orders_count || 0} Transaksi
          </div>
        </div>
        <div className="rounded-2xl bg-[#26042A] border border-[#F5B8CB]/40 p-4">
          <div className="text-xs text-[#F5B8CB]">Menunggu Konfirmasi</div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#FFF5D6] mt-1 tabular-nums">
            {m.pending_orders_count || 0} Pesanan
          </div>
        </div>
        <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/40 p-4">
          <div className="text-xs text-[#F7D160]">QBiz QRIS / Kasir Tunai</div>
          <div className="text-sm font-extrabold text-[#FDF39D] mt-1.5 tabular-nums">
            {formatRupiah(Number(m.qris_revenue || 0))} / {formatRupiah(Number(m.cash_revenue || 0))}
          </div>
        </div>
      </div>

      {/* Action Queue: Pending Orders */}
      <div className="rounded-2xl border border-[#F5C538]/35 bg-[#26042A] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-[#FDF39D]">
            Antrean Verifikasi Bayar Tunai / Manual ({pendingOrders.length})
          </h3>
          <button
            type="button"
            onClick={() => onSwitchSection('orders')}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] hover:bg-[#310603]"
          >
            Kelola Semua Pesanan
          </button>
        </div>

        {pendingOrders.length === 0 ? (
          <p className="text-xs text-[#A0D9CA]">
            Semua pesanan saat ini sudah berstatus lunas. Tidak ada antrean konfirmasi kasir.
          </p>
        ) : (
          <div className="space-y-2.5">
            {pendingOrders.slice(0, 5).map((ord: any) => (
              <div
                key={ord.id}
                className="rounded-xl bg-[#1A021D] border border-[#F5B8CB]/35 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs space-y-0.5">
                  <div className="font-mono font-extrabold text-[#FDF39D]">{ord.order_code}</div>
                  <div className="text-[#FFF5D6] font-bold">
                    {ord.customer_name} • {ord.payment_method} • {formatRupiah(ord.total_amount)}
                  </div>
                  {(ord.payment_proof_note || ord.payment_proof_url) && (
                    <div className="text-[#A0D9CA] flex flex-wrap items-center gap-2">
                      {ord.payment_proof_note && <span>Bukti: {ord.payment_proof_note}</span>}
                      {ord.payment_proof_url && (
                        <a href={ord.payment_proof_url} target="_blank" rel="noreferrer" className="underline font-bold text-[#FDF39D]">
                          Lihat Foto Bukti
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleConfirm(ord.order_code)}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold shrink-0"
                >
                  Konfirmasi Lunas
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Quota Progress across Active Ticket Tiers */}
      <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-[#FDF39D]">
            Kapasitas Kuota E-Ticket Aktif ({activeTiers.length})
          </h3>
          <button
            type="button"
            onClick={() => onSwitchSection('tickets')}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] hover:bg-[#310603]"
          >
            Atur Kategori Tiket
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {activeTiers.map((t: TicketTier) => {
            const pct = Math.min(100, Math.round((t.quota_sold / Math.max(1, t.quota_total)) * 100));
            return (
              <div key={t.id} className="rounded-xl bg-[#1A021D] border border-white/10 p-3.5 space-y-2">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-extrabold text-[#FFF5D6]">{t.name}</span>
                  <span className="font-bold text-[#A0D9CA] tabular-nums">
                    {t.quota_sold} / {t.quota_total}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#26042A] overflow-hidden">
                  <div className="h-full bg-[#F5C538]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. ORDERS & CASHIER POS VIEW
// ---------------------------------------------------------------------------
export const OfficeOrdersView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [resiMap, setResiMap] = useState<Record<string, string>>({});

  const filteredOrders = (adminData.orders || []).filter((ord: any) => {
    if (filterStatus !== 'ALL' && ord.payment_status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      return (
        ord.order_code.toLowerCase().includes(q) ||
        ord.customer_name.toLowerCase().includes(q) ||
        ord.customer_phone.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const confirmPay = async (orderCode: string) => {
    const res = await fetch(`/api/admin/orders/${orderCode}/confirm-payment`, { method: 'POST' });
    const d = await res.json();
    if (d.success) {
      onNotify(`Pesanan ${orderCode} dikonfirmasi LUNAS.`);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(d.error || 'Gagal konfirmasi.', true);
    }
  };

  const updateShipping = async (orderCode: string, status: string) => {
    const res = await fetch(`/api/admin/orders/${orderCode}/update-shipping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fulfillmentStatus: status, trackingNumber: resiMap[orderCode] || '' }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Status pengiriman ${orderCode} diperbarui (${status}).`);
      await onRefresh();
    } else {
      onNotify(d.error || 'Gagal memperbarui resi.', true);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Pesanan Tiket, Kasir POS &amp; Resi Pengiriman
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
            Validasi pembayaran tunai di booth OSIS, cek mutasi transfer, dan perbarui nomor resi kurir.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['ALL', 'PENDING', 'PAID'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-extrabold ${
                filterStatus === st
                  ? 'bg-[#F5C538] text-[#310603]'
                  : 'bg-[#26042A] border border-[#F5C538]/30 text-[#FFF5D6]'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="ord-search" className="block text-sm font-bold text-[#F7D160] mb-1">
          Cari Kode Pesanan / Nama Pembeli / No. WhatsApp
        </label>
        <input
          id="ord-search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Ketik AVR44-... atau nama pembeli..."
          className="w-full max-w-md min-h-[44px] px-4 rounded-xl bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-8 text-center text-sm text-[#FFF5D6]/80">
          Tidak ada pesanan yang sesuai filter pencarian saat ini.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((ord: any) => (
            <div key={ord.id} className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-extrabold text-[#FDF39D]">{ord.order_code}</span>{' '}
                  <span className="text-sm font-bold text-[#FFF5D6]">• {ord.customer_name}</span>{' '}
                  <span className="text-xs text-[#A0D9CA]">({ord.customer_phone})</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-[#1A021D] text-xs font-bold text-[#F7D160]">
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
                  <span className="text-sm font-extrabold text-[#FFF5D6]">{formatRupiah(ord.total_amount)}</span>
                </div>
              </div>

              <div className="text-xs text-[#FFF5D6]/80">
                Mode: <strong>{ord.fulfillment_mode}</strong> ({ord.fulfillment_status}) • Alamat:{' '}
                {ord.shipping_address || '-'}
                {ord.payment_proof_note ? ` • Catatan Bukti: ${ord.payment_proof_note}` : ''}
                {ord.payment_proof_url && (
                  <>
                    {' • '}
                    <a href={ord.payment_proof_url} target="_blank" rel="noreferrer" className="underline font-bold text-[#FDF39D]">
                      Lihat Foto Bukti
                    </a>
                  </>
                )}
              </div>

              {Array.isArray(ord.items) && ord.items.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px] text-[#FDF39D]">
                  {ord.items.map((it: any) => (
                    <span key={it.id} className="px-2.5 py-1 rounded bg-[#1A021D] border border-[#F5C538]/20">
                      [{it.item_type}] {it.quantity}x {it.item_name} ({it.variant_label})
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 pt-1">
                {ord.payment_status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => confirmPay(ord.order_code)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#A0D9CA] text-[#1A021D] text-xs font-extrabold"
                  >
                    Konfirmasi Bayar Lunas (POS / Transfer)
                  </button>
                )}

                {ord.order_type !== 'TICKET_ONLY' && ord.fulfillment_mode !== 'PICKUP_BOOTH' && (
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <label htmlFor={`ord-resi-${ord.order_code}`} className="sr-only">
                      Resi {ord.order_code}
                    </label>
                    <input
                      id={`ord-resi-${ord.order_code}`}
                      type="text"
                      value={resiMap[ord.order_code] ?? ord.tracking_number ?? ''}
                      onChange={(e) => setResiMap({ ...resiMap, [ord.order_code]: e.target.value })}
                      placeholder="Input Resi / Nama Kurir Panitia"
                      className="flex-1 min-w-[180px] min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                    />
                    <button
                      type="button"
                      onClick={() => updateShipping(ord.order_code, 'OUT_FOR_DELIVERY')}
                      className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
                    >
                      Kirim &amp; Simpan Resi
                    </button>
                    <button
                      type="button"
                      onClick={() => updateShipping(ord.order_code, 'COMPLETED')}
                      className="min-h-[44px] px-3.5 py-2 rounded-lg border border-[#A0D9CA]/50 text-[#A0D9CA] text-xs font-bold"
                    >
                      Tandai Diterima
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. DYNAMIC E-TICKET TIERS MANAGER (CREATE, EDIT, TOGGLE ACTIVE, DELETE)
// ---------------------------------------------------------------------------
export const OfficeTicketsCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const tiers: TicketTier[] = adminData.ticketTiers || [];
  const [editingId, setEditingId] = useState<number | 'NEW' | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'EXTERNAL' as 'INTERNAL' | 'EXTERNAL' | 'VIP' | 'BUNDLING',
    description: '',
    price: 55000,
    original_price: '' as string | number,
    quota_total: 200,
    requires_student_id: false,
    included_merch_info: '',
    perksText: '',
    is_active: true,
    sort_order: 10,
  });

  const startCreate = () => {
    setEditingId('NEW');
    setForm({
      name: '',
      category: 'EXTERNAL',
      description: '',
      price: 60000,
      original_price: '',
      quota_total: 150,
      requires_student_id: false,
      included_merch_info: '',
      perksText: 'Akses Panggung Utama Puncak Aversa 44\nQR Code Check-In terenkripsi',
      is_active: true,
      sort_order: tiers.length + 1,
    });
  };

  const startEdit = (t: TicketTier) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      category: t.category,
      description: t.description,
      price: t.price,
      original_price: t.original_price ?? '',
      quota_total: t.quota_total,
      requires_student_id: t.requires_student_id,
      included_merch_info: t.included_merch_info || '',
      perksText: Array.isArray(t.perks_json) ? t.perks_json.join('\n') : '',
      is_active: t.is_active,
      sort_order: t.sort_order ?? 10,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description,
      price: Number(form.price),
      original_price: form.original_price === '' ? null : Number(form.original_price),
      quota_total: Number(form.quota_total),
      requires_student_id: form.requires_student_id,
      included_merch_info: form.included_merch_info.trim() || null,
      perks_json: form.perksText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      is_active: form.is_active,
      sort_order: Number(form.sort_order),
    };

    const url = editingId === 'NEW' ? '/api/admin/ticket-tiers' : `/api/admin/ticket-tiers/${editingId}`;
    const method = editingId === 'NEW' ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(editingId === 'NEW' ? 'Kategori tiket baru ditambahkan.' : 'Kategori tiket diperbarui.');
      setEditingId(null);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(d.error || 'Gagal menyimpan kategori tiket.', true);
    }
  };

  const toggleActive = async (t: TicketTier) => {
    const res = await fetch(`/api/admin/ticket-tiers/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Tiket "${t.name}" sekarang ${!t.is_active ? 'AKTIF' : 'NONAKTIF'} di web depan.`);
      await onRefresh();
      onCatalogRefresh();
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<TicketTier | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const handleDelete = async (t: TicketTier) => {
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/admin/ticket-tiers/${t.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        onNotify(
          d.softDeactivated
            ? `"${t.name}" dinonaktifkan karena sudah memiliki riwayat transaksi.`
            : `"${t.name}" dihapus permanen.`
        );
        await onRefresh();
        onCatalogRefresh();
      }
      setDeleteTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Manajemen Kategori E-Ticket Dinamis
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
            Aktifkan, nonaktifkan, ubah harga, kuota, fasilitas, atau tambah gelombang tiket baru secara instan.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
        >
          + Tambah Kategori Tiket
        </button>
      </div>

      <ResponsiveSheet
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingId === 'NEW' ? 'Tambah Kategori Tiket Baru' : 'Edit Kategori Tiket'}
        subtitle="Perubahan langsung tersinkronisasi ke halaman depan."
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tkt-name" className="block text-sm font-bold text-[#F7D160] mb-1">
                Nama Kategori Tiket *
              </label>
              <input
                id="tkt-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tkt-cat" className="block text-sm font-bold text-[#F7D160] mb-1">
                Tipe Kategori *
              </label>
              <select
                id="tkt-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              >
                <option value="INTERNAL">INTERNAL (Siswa / Guru)</option>
                <option value="EXTERNAL">EXTERNAL (Alumni / Umum)</option>
                <option value="VIP">VIP (Golden Ticket)</option>
                <option value="BUNDLING">BUNDLING (Tiket + Merch)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="tkt-price" className="block text-sm font-bold text-[#F7D160] mb-1">
                Harga Jual (Rp) *
              </label>
              <input
                id="tkt-price"
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tkt-orig" className="block text-sm font-bold text-[#F7D160] mb-1">
                Harga Coret (Opsional)
              </label>
              <input
                id="tkt-orig"
                type="number"
                min={0}
                value={form.original_price}
                onChange={(e) => setForm({ ...form, original_price: e.target.value })}
                placeholder="Kosongkan jika tidak ada"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tkt-quota" className="block text-sm font-bold text-[#F7D160] mb-1">
                Total Kuota *
              </label>
              <input
                id="tkt-quota"
                type="number"
                required
                min={1}
                value={form.quota_total}
                onChange={(e) => setForm({ ...form, quota_total: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tkt-sort" className="block text-sm font-bold text-[#F7D160] mb-1">
                Urutan Tampil
              </label>
              <input
                id="tkt-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tkt-merch-info" className="block text-sm font-bold text-[#F7D160] mb-1">
                Label Bonus Merch (Opsional)
              </label>
              <input
                id="tkt-merch-info"
                type="text"
                value={form.included_merch_info}
                onChange={(e) => setForm({ ...form, included_merch_info: e.target.value })}
                placeholder="Contoh: 1 T-Shirt Resmi + Tote Bag"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-4">
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#FFF5D6]">
                <input
                  type="checkbox"
                  checked={form.requires_student_id}
                  onChange={(e) => setForm({ ...form, requires_student_id: e.target.checked })}
                  className="w-4 h-4 accent-[#F5C538]"
                />
                Wajib NISN / NIP
              </label>
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#A0D9CA]">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-[#A0D9CA]"
                />
                Tampilkan Aktif di Halaman Depan
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="tkt-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
              Deskripsi Tiket *
            </label>
            <textarea
              id="tkt-desc"
              rows={2}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>

          <div>
            <label htmlFor="tkt-perks" className="block text-sm font-bold text-[#F7D160] mb-1">
              Daftar Fasilitas / Perks (1 baris per poin)
            </label>
            <textarea
              id="tkt-perks"
              rows={3}
              value={form.perksText}
              onChange={(e) => setForm({ ...form, perksText: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#F5B8CB]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
            >
              Simpan Perubahan Tiket
            </button>
          </div>
        </form>
      </ResponsiveSheet>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tiers.map((t) => (
          <div
            key={t.id}
            className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 ${
              t.is_active
                ? 'bg-[#26042A] border-[#F5C538]/40'
                : 'bg-[#1A021D]/70 border-[#F5B8CB]/30 opacity-80'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2.5 py-0.5 rounded bg-[#1A021D] border border-[#F5C538]/35 text-[11px] font-bold text-[#F7D160]">
                  {t.category} • Urutan #{t.sort_order ?? 0}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold ${
                    t.is_active ? 'bg-[#0F2F28] text-[#A0D9CA]' : 'bg-[#310603] text-[#F5B8CB]'
                  }`}
                >
                  {t.is_active ? 'AKTIF DI WEB' : 'NONAKTIF (TERSEMBUNYI)'}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-[#FFF5D6]">{t.name}</h3>
              <div className="text-sm font-extrabold text-[#FDF39D]">
                {formatRupiah(t.price)}{' '}
                <span className="text-xs font-normal text-[#A0D9CA]">
                  (Terjual {t.quota_sold} / {t.quota_total})
                </span>
              </div>
              <p className="text-xs text-[#FFF5D6]/80">{t.description}</p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                aria-pressed={t.is_active}
                onClick={() => toggleActive(t)}
                className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-extrabold ${
                  t.is_active
                    ? 'bg-[#310603] border border-[#F5B8CB]/50 text-[#F5B8CB]'
                    : 'bg-[#A0D9CA] text-[#1A021D]'
                }`}
              >
                {t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => startEdit(t)}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
              >
                Edit Detail
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(t)}
                className="min-h-[44px] px-3 py-2 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return handleDelete(deleteTarget);
        }}
        busy={confirmBusy}
        title="Hapus Kategori Tiket?"
        message={
          deleteTarget
            ? `Anda akan menghapus kategori "${deleteTarget.name}". Jika sudah memiliki riwayat transaksi, sistem akan menonaktifkannya secara aman.`
            : ''
        }
        confirmLabel="Ya, Hapus"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. DYNAMIC MERCHANDISE STORE MANAGER
// ---------------------------------------------------------------------------
const PRESET_MOCKUPS = [
  { label: 'Kaos Polo / T-Shirt', url: '/assets/mockups/mockup_kaos_polo.jpg' },
  { label: 'Tumbler Stainless', url: '/assets/mockups/mockup_tumbler.jpg' },
  { label: 'Lanyard & ID Card', url: '/assets/mockups/mockup_lanyard_idcard.jpg' },
  { label: 'Tote Bag & Pin 24K', url: '/assets/mockups/mockup_totebag_pin.jpg' },
];

export const OfficeMerchCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const products: MerchProduct[] = adminData.merchProducts || [];
  const [editingId, setEditingId] = useState<number | 'NEW' | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'APPAREL',
    short_spec: '',
    full_description: '',
    material_spec: '',
    price: 85000,
    stock_total: 100,
    weight_grams: 250,
    image_url: '/assets/mockups/mockup_kaos_polo.jpg',
    variantsText: 'Jet Black • M\nJet Black • L\nJet Black • XL',
    is_active: true,
    sort_order: 10,
  });

  const startCreate = () => {
    setEditingId('NEW');
    setForm({
      name: '',
      category: 'APPAREL',
      short_spec: '',
      full_description: '',
      material_spec: '',
      price: 75000,
      stock_total: 100,
      weight_grams: 250,
      image_url: '/assets/mockups/mockup_kaos_polo.jpg',
      variantsText: 'Standar',
      is_active: true,
      sort_order: products.length + 1,
    });
  };

  const startEdit = (m: MerchProduct) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      category: m.category,
      short_spec: m.short_spec,
      full_description: m.full_description,
      material_spec: m.material_spec,
      price: m.price,
      stock_total: m.stock_total,
      weight_grams: m.weight_grams,
      image_url: m.image_url,
      variantsText: Array.isArray(m.variants_json) ? m.variants_json.join('\n') : 'Standar',
      is_active: m.is_active,
      sort_order: m.sort_order ?? 10,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      category: form.category,
      short_spec: form.short_spec,
      full_description: form.full_description,
      material_spec: form.material_spec,
      price: Number(form.price),
      stock_total: Number(form.stock_total),
      weight_grams: Number(form.weight_grams),
      image_url: form.image_url,
      variants_json: form.variantsText
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
      is_active: form.is_active,
      sort_order: Number(form.sort_order),
    };

    const url = editingId === 'NEW' ? '/api/admin/merch' : `/api/admin/merch/${editingId}`;
    const method = editingId === 'NEW' ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(editingId === 'NEW' ? 'Produk merch baru ditambahkan.' : 'Produk merch diperbarui.');
      setEditingId(null);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(d.error || 'Gagal menyimpan produk merch.', true);
    }
  };

  const toggleActive = async (m: MerchProduct) => {
    const res = await fetch(`/api/admin/merch/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Produk "${m.name}" sekarang ${!m.is_active ? 'AKTIF' : 'NONAKTIF'} di toko.`);
      await onRefresh();
      onCatalogRefresh();
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<MerchProduct | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const handleDelete = async (m: MerchProduct) => {
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/admin/merch/${m.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        onNotify(d.softDeactivated ? `"${m.name}" dinonaktifkan.` : `"${m.name}" dihapus permanen.`);
        await onRefresh();
        onCatalogRefresh();
      }
      setDeleteTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Manajemen Katalog Official Merchandise
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
            Kelola produk, stok, harga, berat ongkir, varian ukuran/warna, foto mockup, dan status aktif/nonaktif.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
        >
          + Tambah Produk Merch
        </button>
      </div>

      <ResponsiveSheet
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingId === 'NEW' ? 'Tambah Produk Merchandise Baru' : 'Edit Produk Merchandise'}
        subtitle="Kelola harga, stok, varian, foto, dan visibilitas produk."
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="m-name" className="block text-sm font-bold text-[#F7D160] mb-1">
                Nama Produk *
              </label>
              <input
                id="m-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="m-cat" className="block text-sm font-bold text-[#F7D160] mb-1">
                Kategori *
              </label>
              <select
                id="m-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              >
                <option value="APPAREL">APPAREL</option>
                <option value="DRINKWARE">DRINKWARE</option>
                <option value="ACCESSORY">ACCESSORY</option>
                <option value="COLLECTIBLE">COLLECTIBLE</option>
                <option value="BUNDLE">BUNDLE</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="m-price" className="block text-sm font-bold text-[#F7D160] mb-1">
                Harga (Rp) *
              </label>
              <input
                id="m-price"
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="m-stock" className="block text-sm font-bold text-[#F7D160] mb-1">
                Stok Tersedia *
              </label>
              <input
                id="m-stock"
                type="number"
                required
                min={0}
                value={form.stock_total}
                onChange={(e) => setForm({ ...form, stock_total: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="m-weight" className="block text-sm font-bold text-[#F7D160] mb-1">
                Berat (gram) *
              </label>
              <input
                id="m-weight"
                type="number"
                required
                min={10}
                value={form.weight_grams}
                onChange={(e) => setForm({ ...form, weight_grams: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="m-sort" className="block text-sm font-bold text-[#F7D160] mb-1">
                Urutan
              </label>
              <input
                id="m-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="m-short" className="block text-sm font-bold text-[#F7D160] mb-1">
                Subjudul Spesifikasi Singkat *
              </label>
              <input
                id="m-short"
                type="text"
                required
                value={form.short_spec}
                onChange={(e) => setForm({ ...form, short_spec: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="m-mat" className="block text-sm font-bold text-[#F7D160] mb-1">
                Spesifikasi Material *
              </label>
              <input
                id="m-mat"
                type="text"
                required
                value={form.material_spec}
                onChange={(e) => setForm({ ...form, material_spec: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="m-img" className="block text-sm font-bold text-[#F7D160] mb-1">
              URL Gambar Produk *
            </label>
            <input
              id="m-img"
              type="text"
              required
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {PRESET_MOCKUPS.map((pm) => (
                <button
                  key={pm.url}
                  type="button"
                  onClick={() => setForm({ ...form, image_url: pm.url })}
                  className="min-h-[44px] px-3 py-1 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FDF39D]"
                >
                  Pakai {pm.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="m-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
              Deskripsi Lengkap *
            </label>
            <textarea
              id="m-desc"
              rows={2}
              required
              value={form.full_description}
              onChange={(e) => setForm({ ...form, full_description: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>

          <div>
            <label htmlFor="m-var" className="block text-sm font-bold text-[#F7D160] mb-1">
              Daftar Varian / Ukuran (1 baris per varian)
            </label>
            <textarea
              id="m-var"
              rows={3}
              value={form.variantsText}
              onChange={(e) => setForm({ ...form, variantsText: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>

          <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#A0D9CA]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 accent-[#A0D9CA]"
            />
            Tampilkan Produk Aktif di Toko Merch
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#F5B8CB]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
            >
              Simpan Produk Merchandise
            </button>
          </div>
        </form>
      </ResponsiveSheet>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl border overflow-hidden flex flex-col justify-between ${
              m.is_active ? 'bg-[#26042A] border-[#F5C538]/35' : 'bg-[#1A021D]/70 border-[#F5B8CB]/30 opacity-75'
            }`}
          >
            <div>
              <img
                src={m.image_url}
                alt={m.name}
                width={400}
                height={250}
                className="w-full h-36 object-cover bg-[#1A021D]"
              />
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[#F7D160]">{m.category}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      m.is_active ? 'bg-[#0F2F28] text-[#A0D9CA]' : 'bg-[#310603] text-[#F5B8CB]'
                    }`}
                  >
                    {m.is_active ? 'AKTIF' : 'NONAKTIF'}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-[#FFF5D6]">{m.name}</h3>
                <div className="text-sm font-extrabold text-[#FDF39D]">
                  {formatRupiah(m.price)}{' '}
                  <span className="text-xs font-normal text-[#A0D9CA]">• Stok: {m.stock_total}</span>
                </div>
              </div>
            </div>

            <div className="p-4 pt-2 flex flex-wrap gap-2 border-t border-white/10">
              <button
                type="button"
                aria-pressed={m.is_active}
                onClick={() => toggleActive(m)}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-extrabold ${
                  m.is_active
                    ? 'bg-[#310603] border border-[#F5B8CB]/50 text-[#F5B8CB]'
                    : 'bg-[#A0D9CA] text-[#1A021D]'
                }`}
              >
                {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => startEdit(m)}
                className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(m)}
                className="min-h-[44px] px-3 py-1.5 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return handleDelete(deleteTarget);
        }}
        busy={confirmBusy}
        title="Hapus Produk Merchandise?"
        message={
          deleteTarget
            ? `Anda akan menghapus produk "${deleteTarget.name}". Jika produk ini sudah pernah dipesan, sistem akan menonaktifkannya secara aman.`
            : ''
        }
        confirmLabel="Ya, Hapus"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. SHIPPING ZONES & PICKUP BOOTH MANAGER
// ---------------------------------------------------------------------------
export const OfficeShippingCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const zones: ShippingZone[] = adminData.shippingZones || [];
  const [editingId, setEditingId] = useState<number | 'NEW' | null>(null);
  const [form, setForm] = useState({
    mode: 'LOCAL_COURIER' as 'PICKUP_BOOTH' | 'LOCAL_COURIER' | 'REGULER_EXPEDITION',
    zone_name: '',
    description: '',
    base_cost: 8000,
    cost_per_kg: 0,
    estimated_days: '1 - 2 hari kerja',
    is_active: true,
    sort_order: 10,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingId === 'NEW' ? '/api/admin/shipping-zones' : `/api/admin/shipping-zones/${editingId}`;
    const method = editingId === 'NEW' ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        base_cost: Number(form.base_cost),
        cost_per_kg: Number(form.cost_per_kg),
        sort_order: Number(form.sort_order),
      }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify('Zona pengambilan & ongkir disimpan.');
      setEditingId(null);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(d.error || 'Gagal menyimpan zona.', true);
    }
  };

  const toggleZone = async (z: ShippingZone) => {
    const res = await fetch(`/api/admin/shipping-zones/${z.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !z.is_active }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Zona "${z.zone_name}" ${!z.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await onRefresh();
      onCatalogRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Zona Ambil di Booth &amp; Tarif Pengiriman
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
            Atur zona kurir lokal panitia, ekspedisi luar kota per kilogram, serta lokasi pengambilan di tempat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId('NEW');
            setForm({
              mode: 'LOCAL_COURIER',
              zone_name: '',
              description: '',
              base_cost: 10000,
              cost_per_kg: 0,
              estimated_days: '1 - 2 hari kerja',
              is_active: true,
              sort_order: zones.length + 1,
            });
          }}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
        >
          + Tambah Zona Pengiriman
        </button>
      </div>

      <ResponsiveSheet
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingId === 'NEW' ? 'Tambah Zona Baru' : 'Edit Zona Pengiriman'}
        subtitle="Atur ongkos kirim kurir lokal, ekspedisi, atau booth panitia."
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="zn-name" className="block text-sm font-bold text-[#F7D160] mb-1">
                Nama Zona / Lokasi *
              </label>
              <input
                id="zn-name"
                type="text"
                required
                value={form.zone_name}
                onChange={(e) => setForm({ ...form, zone_name: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="zn-mode" className="block text-sm font-bold text-[#F7D160] mb-1">
                Mode Distribusi *
              </label>
              <select
                id="zn-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as any })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              >
                <option value="PICKUP_BOOTH">Ambil di Tempat (Booth SMAN 1 Gedeg)</option>
                <option value="LOCAL_COURIER">Antar Kurir Lokal Panitia</option>
                <option value="REGULER_EXPEDITION">Ekspedisi Reguler (Per Kg)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="zn-base" className="block text-sm font-bold text-[#F7D160] mb-1">
                Tarif Flat / Dasar (Rp)
              </label>
              <input
                id="zn-base"
                type="number"
                min={0}
                value={form.base_cost}
                onChange={(e) => setForm({ ...form, base_cost: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="zn-kg" className="block text-sm font-bold text-[#F7D160] mb-1">
                Tarif Per Kg (Ekspedisi)
              </label>
              <input
                id="zn-kg"
                type="number"
                min={0}
                value={form.cost_per_kg}
                onChange={(e) => setForm({ ...form, cost_per_kg: Number(e.target.value) })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="zn-est" className="block text-sm font-bold text-[#F7D160] mb-1">
                Estimasi Waktu *
              </label>
              <input
                id="zn-est"
                type="text"
                required
                value={form.estimated_days}
                onChange={(e) => setForm({ ...form, estimated_days: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="zn-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
              Keterangan Zona *
            </label>
            <textarea
              id="zn-desc"
              rows={2}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#F5B8CB]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
            >
              Simpan Zona Pengiriman
            </button>
          </div>
        </form>
      </ResponsiveSheet>

      <div className="space-y-3">
        {zones.map((z) => (
          <div
            key={z.id}
            className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#1A021D] text-[11px] font-bold text-[#F7D160]">
                  {z.mode}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                    z.is_active !== false ? 'bg-[#0F2F28] text-[#A0D9CA]' : 'bg-[#310603] text-[#F5B8CB]'
                  }`}
                >
                  {z.is_active !== false ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <div className="text-base font-extrabold text-[#FFF5D6]">{z.zone_name}</div>
              <div className="text-xs text-[#FFF5D6]/80">
                Flat: {formatRupiah(z.base_cost)} • Per Kg: {formatRupiah(z.cost_per_kg)} • Estimasi: {z.estimated_days}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleZone(z)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D]"
              >
                {z.is_active !== false ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(z.id);
                  setForm({
                    mode: z.mode,
                    zone_name: z.zone_name,
                    description: z.description,
                    base_cost: z.base_cost,
                    cost_per_kg: z.cost_per_kg,
                    estimated_days: z.estimated_days,
                    is_active: z.is_active !== false,
                    sort_order: z.sort_order ?? 10,
                  });
                }}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6. HERO, GUEST STAR, CONTACTS & SOCIALS CMS (site_settings)
// ---------------------------------------------------------------------------
export const OfficeHeroSettingsCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const s = adminData.siteSettings || {};
  const [form, setForm] = useState({
    heroBadgeText: s.heroBadgeText || 'SMA Negeri 1 Gedeg • 1982 - 2026',
    heroTitlePrefix: s.heroTitlePrefix || 'Dies Natalis ke-44',
    heroTitleHighlight: s.heroTitleHighlight || 'Action, Compassion, Celebration',
    heroDescription: s.heroDescription || '',
    peakDateIso: s.peakDateIso || '2026-12-17T19:00:00+07:00',
    peakDateLabel: s.peakDateLabel || '17 Desember 2026',
    guestStar1Name: s.guestStar1Name || 'Niken Salindry',
    guestStar2Name: s.guestStar2Name || 'Kembange Jagad',
    guestStarDescription: s.guestStarDescription || '',
    guestStarVenue: s.guestStarVenue || 'Lapangan Tengah SMAN 1 Gedeg',
    guestStarAccessNote: s.guestStarAccessNote || 'E-Ticket QR Terenkripsi',
    bankPaymentInfo: s.bankPaymentInfo || '',
    fallbackQrisStaticPayload: s.fallbackQrisStaticPayload || '',
    fallbackQrisForce: Boolean(s.fallbackQrisForce),
    adminPaymentWhatsapp: s.adminPaymentWhatsapp || '',
    sponsorshipHeadline: s.sponsorshipHeadline || '',
    sponsorshipDescription: s.sponsorshipDescription || '',
    address: s.address || '',
    website: s.socials?.website || 'https://www.sman1gedeg.sch.id',
    instagram: s.socials?.instagram || '@smansagemoker',
    tiktok: s.socials?.tiktok || '@sman1gedeg',
    facebook: s.socials?.facebook || 'SMA Negeri 1 Gedeg',
    humas: s.socials?.humas || 'Humas SMAN 1 Gedeg',
    contacts: Array.isArray(s.sponsorshipContacts) ? s.sponsorshipContacts : [],
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/site-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heroBadgeText: form.heroBadgeText,
        heroTitlePrefix: form.heroTitlePrefix,
        heroTitleHighlight: form.heroTitleHighlight,
        heroDescription: form.heroDescription,
        peakDateIso: form.peakDateIso,
        peakDateLabel: form.peakDateLabel,
        guestStar1Name: form.guestStar1Name,
        guestStar2Name: form.guestStar2Name,
        guestStarDescription: form.guestStarDescription,
        guestStarVenue: form.guestStarVenue,
        guestStarAccessNote: form.guestStarAccessNote,
        bankPaymentInfo: form.bankPaymentInfo,
        fallbackQrisStaticPayload: form.fallbackQrisStaticPayload,
        fallbackQrisForce: form.fallbackQrisForce,
        adminPaymentWhatsapp: form.adminPaymentWhatsapp,
        sponsorshipHeadline: form.sponsorshipHeadline,
        sponsorshipDescription: form.sponsorshipDescription,
        address: form.address,
        sponsorshipContacts: form.contacts,
        socials: {
          website: form.website,
          instagram: form.instagram,
          tiktok: form.tiktok,
          facebook: form.facebook,
          humas: form.humas,
        },
      }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify('Pengaturan Hero, Bintang Tamu, Kontak & Media Sosial tersimpan ke PostgreSQL.');
      await onRefresh();
      onCatalogRefresh();
      setEditorOpen(false);
    } else {
      onNotify(d.error || 'Gagal menyimpan pengaturan.', true);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">Konten Panggung Utama, Bintang Tamu &amp; Footer</h2>
      <p className="text-sm text-[#FFF5D6]/80">Kelola informasi acara, bintang tamu, kontak, dan media sosial.</p>
      <button type="button" onClick={() => setEditorOpen(true)} className="min-h-[44px] px-5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold">Ubah Konten Panggung</button>
      <ResponsiveSheet open={editorOpen} onClose={() => setEditorOpen(false)} title="Ubah Konten Panggung" maxWidthClass="md:max-w-3xl">
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
          Konten Panggung Utama, Bintang Tamu &amp; Footer
        </h2>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
          Setiap perubahan di formulir ini langsung memperbarui teks, jadwal hitung mundur, dan kontak di halaman depan.
        </p>
      </div>

      {/* Hero Settings */}
      <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-5 space-y-4">
        <h3 className="text-base font-extrabold text-[#FDF39D]">1. Panggung Hero &amp; Hitung Mundur</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hs-badge" className="block text-sm font-bold text-[#F7D160] mb-1">
              Teks Badge Sekolah (Atas)
            </label>
            <input
              id="hs-badge"
              type="text"
              value={form.heroBadgeText}
              onChange={(e) => setForm({ ...form, heroBadgeText: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="hs-peak-iso" className="block text-sm font-bold text-[#F7D160] mb-1">
              Tanggal Target Countdown (ISO)
            </label>
            <input
              id="hs-peak-iso"
              type="text"
              value={form.peakDateIso}
              onChange={(e) => setForm({ ...form, peakDateIso: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hs-h1-pref" className="block text-sm font-bold text-[#F7D160] mb-1">
              Awalan Tajuk Utama (H1)
            </label>
            <input
              id="hs-h1-pref"
              type="text"
              value={form.heroTitlePrefix}
              onChange={(e) => setForm({ ...form, heroTitlePrefix: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="hs-h1-high" className="block text-sm font-bold text-[#F7D160] mb-1">
              Slogan Emas Tajuk Utama (H1)
            </label>
            <input
              id="hs-h1-high"
              type="text"
              value={form.heroTitleHighlight}
              onChange={(e) => setForm({ ...form, heroTitleHighlight: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="hs-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
            Paragraf Pengantar Hero
          </label>
          <textarea
            id="hs-desc"
            rows={2}
            value={form.heroDescription}
            onChange={(e) => setForm({ ...form, heroDescription: e.target.value })}
            className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
          />
        </div>
      </div>

      {/* Guest Stars */}
      <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-5 space-y-4">
        <h3 className="text-base font-extrabold text-[#FDF39D]">2. Panggung Bintang Tamu &amp; Lokasi</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="gs-1" className="block text-sm font-bold text-[#F7D160] mb-1">
              Bintang Tamu 1
            </label>
            <input
              id="gs-1"
              type="text"
              value={form.guestStar1Name}
              onChange={(e) => setForm({ ...form, guestStar1Name: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="gs-2" className="block text-sm font-bold text-[#F7D160] mb-1">
              Bintang Tamu 2
            </label>
            <input
              id="gs-2"
              type="text"
              value={form.guestStar2Name}
              onChange={(e) => setForm({ ...form, guestStar2Name: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="gs-label" className="block text-sm font-bold text-[#F7D160] mb-1">
              Label Tanggal Puncak
            </label>
            <input
              id="gs-label"
              type="text"
              value={form.peakDateLabel}
              onChange={(e) => setForm({ ...form, peakDateLabel: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="gs-venue" className="block text-sm font-bold text-[#F7D160] mb-1">
              Lokasi Panggung
            </label>
            <input
              id="gs-venue"
              type="text"
              value={form.guestStarVenue}
              onChange={(e) => setForm({ ...form, guestStarVenue: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="gs-access" className="block text-sm font-bold text-[#F7D160] mb-1">
              Label Akses Masuk
            </label>
            <input
              id="gs-access"
              type="text"
              value={form.guestStarAccessNote}
              onChange={(e) => setForm({ ...form, guestStarAccessNote: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>
        </div>
        <div>
          <label htmlFor="gs-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
            Deskripsi Bintang Tamu
          </label>
          <textarea
            id="gs-desc"
            rows={2}
            value={form.guestStarDescription}
            onChange={(e) => setForm({ ...form, guestStarDescription: e.target.value })}
            className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
          />
        </div>
      </div>

      {/* Bank, Sponsorship Contacts & Socials */}
      <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/35 p-5 space-y-4">
        <h3 className="text-base font-extrabold text-[#FDF39D]">3. Rekening Transfer, Kontak Sponsor &amp; Footer</h3>
        <div>
          <label htmlFor="bank-info" className="block text-sm font-bold text-[#F7D160] mb-1">
            Informasi Rekening Transfer Manual (Ditampilkan saat Checkout)
          </label>
          <input
            id="bank-info"
            type="text"
            value={form.bankPaymentInfo}
            onChange={(e) => setForm({ ...form, bankPaymentInfo: e.target.value })}
            className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
          />
        </div>

        <div className="rounded-xl border border-[#F5C538]/35 bg-[#1A021D] p-4 space-y-4">
          <div>
            <div className="text-sm font-extrabold text-[#FDF39D]">
              QRIS Dynamic Fallback &amp; Verifikasi WhatsApp Admin
            </div>
            <p className="text-xs text-[#FFF5D6]/75 mt-0.5">
              Aktif otomatis jika gateway utama tidak tersedia. Unggah gambar QRIS statis untuk diubah menjadi Dynamic QRIS sesuai nominal pesanan.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="qris-static-file" className="block text-xs font-bold text-[#F7D160] mb-1">
                Unggah Gambar QRIS Statis (PNG / JPG)
              </label>
              <input
                id="qris-static-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const bmp = await createImageBitmap(file);
                    const canvas = document.createElement('canvas');
                    canvas.width = bmp.width;
                    canvas.height = bmp.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    ctx.drawImage(bmp, 0, 0);
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const decoded = jsQR(imgData.data, imgData.width, imgData.height);
                    if (!decoded?.data || !decoded.data.startsWith('000201')) {
                      onNotify('QRIS tidak terbaca dari gambar tersebut. Pastikan gambar jelas dan merupakan QRIS resmi.', true);
                      return;
                    }
                    setForm((prev) => ({ ...prev, fallbackQrisStaticPayload: decoded.data.trim() }));
                    onNotify('Payload QRIS statis berhasil dibaca! Klik Simpan Pengaturan Situs untuk menerapkan.');
                  } catch {
                    onNotify('Gagal membaca file gambar QRIS.', true);
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
              />
            </div>

            <div>
              <label htmlFor="admin-wa-payment" className="block text-xs font-bold text-[#F7D160] mb-1">
                Nomor WhatsApp Admin Pembayaran (Bukan Nomor Bot)
              </label>
              <input
                id="admin-wa-payment"
                type="text"
                value={form.adminPaymentWhatsapp}
                onChange={(e) => setForm({ ...form, adminPaymentWhatsapp: e.target.value })}
                placeholder="Contoh: 085612345678 atau 6285612345678"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="qris-static-payload" className="block text-xs font-bold text-[#F7D160] mb-1">
              Payload QRIS Statis Terbaca (EMVCo)
            </label>
            <input
              id="qris-static-payload"
              type="text"
              value={form.fallbackQrisStaticPayload}
              onChange={(e) => setForm({ ...form, fallbackQrisStaticPayload: e.target.value })}
              placeholder="000201010211..."
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#26042A] border border-[#F5C538]/35 text-xs font-mono text-[#A0D9CA]"
            />
          </div>

          <label className="flex items-center gap-2.5 min-h-[44px] text-xs font-bold text-[#FDF39D] cursor-pointer">
            <input
              type="checkbox"
              checked={form.fallbackQrisForce}
              onChange={(e) => setForm({ ...form, fallbackQrisForce: e.target.checked })}
              className="w-4 h-4 accent-[#F5C538]"
            />
            Aktifkan Mode QRIS Fallback Sekarang (gunakan QRIS Statis ke Dinamis + Bukti Transfer meski gateway aktif)
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {form.contacts.map((cp: any, idx: number) => (
            <div key={idx} className="rounded-xl bg-[#1A021D] border border-white/10 p-3 space-y-2">
              <div className="text-xs font-bold text-[#A0D9CA]">Narahubung Sponsor #{idx + 1}</div>
              <input
                aria-label={`Nama narahubung ${idx + 1}`}
                type="text"
                value={cp.name}
                onChange={(e) => {
                  const next = [...form.contacts];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setForm({ ...form, contacts: next });
                }}
                className="w-full min-h-[44px] px-3 rounded bg-[#26042A] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
              />
              <input
                aria-label={`Nomor tampil narahubung ${idx + 1}`}
                type="text"
                value={cp.phoneDisplay}
                onChange={(e) => {
                  const next = [...form.contacts];
                  next[idx] = { ...next[idx], phoneDisplay: e.target.value };
                  setForm({ ...form, contacts: next });
                }}
                className="w-full min-h-[44px] px-3 rounded bg-[#26042A] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="soc-ig" className="block text-sm font-bold text-[#F7D160] mb-1">
              Instagram
            </label>
            <input
              id="soc-ig"
              type="text"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="soc-tt" className="block text-sm font-bold text-[#F7D160] mb-1">
              TikTok
            </label>
            <input
              id="soc-tt"
              type="text"
              value={form.tiktok}
              onChange={(e) => setForm({ ...form, tiktok: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="soc-fb" className="block text-sm font-bold text-[#F7D160] mb-1">
              Facebook
            </label>
            <input
              id="soc-fb"
              type="text"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="min-h-[48px] px-6 py-3 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
      >
        Simpan Semua Pengaturan Panggung Depan
      </button>
    </form>
      </ResponsiveSheet>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7. EVENT TIMELINE (RANGKAIAN ACARA) CMS
// ---------------------------------------------------------------------------
export const OfficeTimelineCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const events: TimelineEvent[] = adminData.timeline || [];
  const [editingId, setEditingId] = useState<number | 'NEW' | null>(null);
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    date_label: '',
    category: 'KOMPETISI',
    venue: '',
    description: '',
    cta_label: 'Lihat Detail',
    cta_target: 'timeline',
    sort_order: 10,
    is_active: true,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingId === 'NEW' ? '/api/admin/timeline' : `/api/admin/timeline/${editingId}`;
    const method = editingId === 'NEW' ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify('Agenda kegiatan berhasil disimpan.');
      setEditingId(null);
      await onRefresh();
      onCatalogRefresh();
    } else {
      onNotify(d.error || 'Gagal menyimpan agenda.', true);
    }
  };

  const toggleActive = async (ev: TimelineEvent) => {
    const res = await fetch(`/api/admin/timeline/${ev.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !(ev.is_active !== false) }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Agenda "${ev.title}" diperbarui.`);
      await onRefresh();
      onCatalogRefresh();
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<TimelineEvent | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const handleDelete = async (ev: TimelineEvent) => {
    setConfirmBusy(true);
    try {
      await fetch(`/api/admin/timeline/${ev.id}`, { method: 'DELETE' });
      onNotify(`Agenda "${ev.title}" dihapus.`);
      await onRefresh();
      onCatalogRefresh();
      setDeleteTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
            Manajemen Rangkaian Acara (Timeline)
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
            Tambah, ubah jadwal/tempat, aktifkan/nonaktifkan, atau hapus agenda acara yang tampil di beranda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId('NEW');
            setForm({
              title: '',
              subtitle: '',
              date_label: '',
              category: 'KOMPETISI',
              venue: 'SMA Negeri 1 Gedeg',
              description: '',
              cta_label: 'Ambil E-Ticket',
              cta_target: 'tickets',
              sort_order: events.length + 1,
              is_active: true,
            });
          }}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold shrink-0"
        >
          + Tambah Agenda Baru
        </button>
      </div>

      <ResponsiveSheet
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingId === 'NEW' ? 'Tambah Agenda Kegiatan' : 'Edit Agenda Kegiatan'}
        subtitle="Jadwal dan deskripsi acara tampil pada linimasa beranda."
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tl-title" className="block text-sm font-bold text-[#F7D160] mb-1">
                Judul Kegiatan *
              </label>
              <input
                id="tl-title"
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tl-sub" className="block text-sm font-bold text-[#F7D160] mb-1">
                Subjudul Kegiatan *
              </label>
              <input
                id="tl-sub"
                type="text"
                required
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="tl-date" className="block text-sm font-bold text-[#F7D160] mb-1">
                Label Tanggal *
              </label>
              <input
                id="tl-date"
                type="text"
                required
                value={form.date_label}
                onChange={(e) => setForm({ ...form, date_label: e.target.value })}
                placeholder="Contoh: 17 Desember 2026"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
            <div>
              <label htmlFor="tl-cat" className="block text-sm font-bold text-[#F7D160] mb-1">
                Kategori *
              </label>
              <select
                id="tl-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              >
                <option value="KOMPETISI">KOMPETISI</option>
                <option value="SOSIAL & SAINS">SOSIAL &amp; SAINS</option>
                <option value="PUNCAK ACARA">PUNCAK ACARA</option>
              </select>
            </div>
            <div>
              <label htmlFor="tl-venue" className="block text-sm font-bold text-[#F7D160] mb-1">
                Lokasi / Venue *
              </label>
              <input
                id="tl-venue"
                type="text"
                required
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tl-desc" className="block text-sm font-bold text-[#F7D160] mb-1">
              Deskripsi Lengkap *
            </label>
            <textarea
              id="tl-desc"
              rows={2}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-sm text-[#FFF5D6]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#F5B8CB]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[48px] px-6 py-2.5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
            >
              Simpan Agenda Kegiatan
            </button>
          </div>
        </form>
      </ResponsiveSheet>

      <div className="space-y-3">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#1A021D] text-[11px] font-bold text-[#F7D160]">
                  {ev.date_label} • {ev.category}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                    ev.is_active !== false ? 'bg-[#0F2F28] text-[#A0D9CA]' : 'bg-[#310603] text-[#F5B8CB]'
                  }`}
                >
                  {ev.is_active !== false ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <div className="text-base font-extrabold text-[#FFF5D6]">{ev.title}</div>
              <div className="text-xs text-[#FFF5D6]/80">{ev.venue}</div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleActive(ev)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D]"
              >
                {ev.is_active !== false ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(ev.id);
                  setForm({
                    title: ev.title,
                    subtitle: ev.subtitle,
                    date_label: ev.date_label,
                    category: ev.category,
                    venue: ev.venue,
                    description: ev.description,
                    cta_label: ev.cta_label,
                    cta_target: ev.cta_target,
                    sort_order: ev.sort_order ?? 10,
                    is_active: ev.is_active !== false,
                  });
                }}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F5C538] text-[#310603] text-xs font-extrabold"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(ev)}
                className="min-h-[44px] px-3 py-2 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return handleDelete(deleteTarget);
        }}
        busy={confirmBusy}
        title="Hapus Agenda Kegiatan?"
        message={
          deleteTarget
            ? `Agenda "${deleteTarget.title}" akan dihapus dari linimasa kegiatan.`
            : ''
        }
        confirmLabel="Ya, Hapus"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8. ANATOMY V6 & CREATIVE CREDITS CMS
// ---------------------------------------------------------------------------
export const OfficeAnatomyCreditsCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onCatalogRefresh,
  onNotify,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const s = adminData.siteSettings || {};
  const [anatomy, setAnatomy] = useState<AnatomySlide[]>(s.anatomyItems || []);
  const [credits, setCredits] = useState<Array<{ role: string; name: string; affiliation: string }>>(
    s.creativeCredits || []
  );

  const saveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/site-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anatomyItems: anatomy, creativeCredits: credits }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify('Museum Anatomi V6 dan Tim Kreatif diperbarui.');
      await onRefresh();
      onCatalogRefresh();
      setEditorOpen(false);
    } else {
      onNotify(d.error || 'Gagal menyimpan.', true);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">Anatomi Lambang &amp; Tim Kreatif</h2>
      <p className="text-sm text-[#FFF5D6]/80">Kelola penjelasan lambang dan daftar kreator.</p>
      <button type="button" onClick={() => setEditorOpen(true)} className="min-h-[44px] px-5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold">Ubah Anatomi &amp; Tim Kreatif</button>
      <ResponsiveSheet open={editorOpen} onClose={() => setEditorOpen(false)} title="Ubah Anatomi &amp; Tim Kreatif" maxWidthClass="md:max-w-3xl">
    <form onSubmit={saveAll} className="space-y-6">
      <div>
        <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
          Museum Anatomi V6 &amp; Atribusi Tim Kreatif
        </h2>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
          Ubah penjelasan filosofis tiap bagian lambang V6 dan kelola daftar kreator resmi SMAN 1 Gedeg.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-extrabold text-[#FDF39D]">Slide Fokus Anatomi V6</h3>
        {anatomy.map((item, idx) => (
          <div key={item.id} className="rounded-xl bg-[#26042A] border border-[#F5C538]/30 p-4 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`an-lbl-${idx}`} className="block text-sm font-bold text-[#F7D160] mb-1">
                  Label Tab
                </label>
                <input
                  id={`an-lbl-${idx}`}
                  type="text"
                  value={item.label}
                  onChange={(e) => {
                    const next = [...anatomy];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setAnatomy(next);
                  }}
                  className="w-full min-h-[44px] px-3 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
                />
              </div>
              <div>
                <label htmlFor={`an-ttl-${idx}`} className="block text-sm font-bold text-[#F7D160] mb-1">
                  Judul Filosofi
                </label>
                <input
                  id={`an-ttl-${idx}`}
                  type="text"
                  value={item.title}
                  onChange={(e) => {
                    const next = [...anatomy];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setAnatomy(next);
                  }}
                  className="w-full min-h-[44px] px-3 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
                />
              </div>
            </div>
            <div>
              <label htmlFor={`an-dsc-${idx}`} className="block text-sm font-bold text-[#F7D160] mb-1">
                Penjelasan Filosofis
              </label>
              <textarea
                id={`an-dsc-${idx}`}
                rows={2}
                value={item.desc}
                onChange={(e) => {
                  const next = [...anatomy];
                  next[idx] = { ...next[idx], desc: e.target.value };
                  setAnatomy(next);
                }}
                className="w-full p-2.5 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[#FDF39D]">Tim Kreatif &amp; Atribusi Karya</h3>
          <button
            type="button"
            onClick={() => setCredits([...credits, { name: '', affiliation: '', role: '' }])}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-[#A0D9CA]/50 text-xs font-bold text-[#A0D9CA]"
          >
            + Tambah Anggota Kreator
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {credits.map((cr, idx) => (
            <div key={idx} className="rounded-xl bg-[#26042A] border border-[#F5C538]/30 p-4 space-y-2">
              <input
                aria-label={`Nama kreator ${idx + 1}`}
                type="text"
                placeholder="Nama Kreator"
                value={cr.name}
                onChange={(e) => {
                  const next = [...credits];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setCredits(next);
                }}
                className="w-full min-h-[44px] px-3 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
              />
              <input
                aria-label={`Afiliasi angkatan ${idx + 1}`}
                type="text"
                placeholder="Kelas / Angkatan / Jabatan"
                value={cr.affiliation}
                onChange={(e) => {
                  const next = [...credits];
                  next[idx] = { ...next[idx], affiliation: e.target.value };
                  setCredits(next);
                }}
                className="w-full min-h-[44px] px-3 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
              />
              <div className="flex gap-2">
                <input
                  aria-label={`Peran artistik ${idx + 1}`}
                  type="text"
                  placeholder="Peran Artistik"
                  value={cr.role}
                  onChange={(e) => {
                    const next = [...credits];
                    next[idx] = { ...next[idx], role: e.target.value };
                    setCredits(next);
                  }}
                  className="flex-1 min-h-[44px] px-3 rounded bg-[#1A021D] border border-[#F5C538]/30 text-xs text-[#FFF5D6]"
                />
                <button
                  type="button"
                  onClick={() => setCredits(credits.filter((_, i) => i !== idx))}
                  className="min-h-[44px] px-3 rounded border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="min-h-[48px] px-6 py-3 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold"
      >
        Simpan Anatomi &amp; Tim Kreatif
      </button>
    </form>
      </ResponsiveSheet>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 9. SPONSORSHIP INBOX & STATUS MANAGER
// ---------------------------------------------------------------------------
export const OfficeSponsorshipCmsView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onNotify,
}) => {
  const inquiries = adminData.sponsorships || [];

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/admin/sponsorships/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Status mitra diperbarui ke ${status}.`);
      await onRefresh();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
          Kotak Masuk Pengajuan Sponsorship ({inquiries.length})
        </h2>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
          Kelola penawaran kerja sama perusahaan, instansi, UMKM bazar, dan donatur alumni.
        </p>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-8 text-center text-sm text-[#FFF5D6]/80">
          Belum ada pengajuan kemitraan masuk dari formulir publik.
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((sp: any) => (
            <div
              key={sp.id}
              className="rounded-2xl bg-[#26042A] border border-[#F5C538]/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 text-xs">
                <div className="text-base font-extrabold text-[#FDF39D]">
                  {sp.company_name} <span className="text-xs text-[#F5B8CB]">({sp.tier_interest})</span>
                </div>
                <div className="text-[#A0D9CA] font-semibold">
                  PIC: {sp.contact_person} • WA {sp.phone} {sp.email ? `• ${sp.email}` : ''}
                </div>
                <p className="text-[#FFF5D6]/85 pt-1">{sp.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor={`sp-st-${sp.id}`} className="sr-only">
                  Status sponsorship {sp.company_name}
                </label>
                <select
                  id={`sp-st-${sp.id}`}
                  value={sp.status}
                  onChange={(e) => updateStatus(sp.id, e.target.value)}
                  className="min-h-[44px] px-3 rounded-xl bg-[#1A021D] border border-[#F5C538]/40 text-xs font-extrabold text-[#FDF39D]"
                >
                  <option value="NEW">BARU (NEW)</option>
                  <option value="CONTACTED">DIHUBUNGI</option>
                  <option value="CONFIRMED">TERKONFIRMASI</option>
                  <option value="REJECTED">DITOLAK</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 10. STAFF RBAC ACCOUNTS MANAGER
// ---------------------------------------------------------------------------
export const OfficeStaffRbacView: React.FC<CmsCommonProps> = ({
  adminData,
  onRefresh,
  onNotify,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const staff = adminData.staffUsers || [];
  const [newUser, setNewUser] = useState({
    username: '',
    full_name: '',
    role: 'SCANNER' as 'ADMIN' | 'CASHIER' | 'SCANNER' | 'MEDIA',
    password: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Akun petugas "${d.staff.username}" (${d.staff.role}) berhasil dibuat.`);
      setNewUser({ username: '', full_name: '', role: 'SCANNER', password: '' });
      await onRefresh();
      setEditorOpen(false);
    } else {
      onNotify(d.error || 'Gagal membuat akun petugas.', true);
    }
  };

  const toggleStaff = async (u: any) => {
    const res = await fetch(`/api/admin/staff/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    const d = await res.json();
    if (d.success) {
      onNotify(`Akun "${u.username}" sekarang ${d.staff.is_active ? 'AKTIF' : 'NONAKTIF'}.`);
      await onRefresh();
    } else {
      onNotify(d.error || 'Tidak dapat mengubah status akun.', true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
          Manajemen Akun Petugas &amp; Hak Akses (RBAC)
        </h2>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/80">
          Tambahkan akun panitia untuk petugas Gate Scanner, Kasir POS Booth, atau Admin CMS baru.
        </p>
      </div>

      <button type="button" onClick={() => setEditorOpen(true)} className="min-h-[44px] px-5 rounded-xl bg-[#F5C538] text-[#310603] text-sm font-extrabold">Tambah Akun Petugas</button>
      <ResponsiveSheet open={editorOpen} onClose={() => setEditorOpen(false)} title="Tambah Akun Petugas">
      <form onSubmit={handleCreate} className="space-y-4">
        <h3 className="text-base font-extrabold text-[#FDF39D]">Tambah Akun Petugas Baru</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="st-uname" className="block text-sm font-bold text-[#F7D160] mb-1">
              Username *
            </label>
            <input
              id="st-uname"
              type="text"
              required
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              placeholder="gate_utara"
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="st-fname" className="block text-sm font-bold text-[#F7D160] mb-1">
              Nama Lengkap *
            </label>
            <input
              id="st-fname"
              type="text"
              required
              value={newUser.full_name}
              onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              placeholder="Petugas Gate Utara"
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
          <div>
            <label htmlFor="st-role" className="block text-sm font-bold text-[#F7D160] mb-1">
              Peran RBAC *
            </label>
            <select
              id="st-role"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            >
              <option value="SCANNER">SCANNER (Gate &amp; Merch)</option>
              <option value="CASHIER">CASHIER (Kasir Booth POS)</option>
              <option value="MEDIA">MEDIA (Studio Konten &amp; OBS)</option>
              <option value="ADMIN">ADMIN (Akses Penuh CMS)</option>
            </select>
          </div>
          <div>
            <label htmlFor="st-pwd" className="block text-sm font-bold text-[#F7D160] mb-1">
              Kata Sandi (Min 6 karakter) *
            </label>
            <input
              id="st-pwd"
              type="password"
              required
              minLength={6}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              placeholder="Minimal 6 karakter"
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
            />
          </div>
        </div>
        <button
          type="submit"
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#F5C538] text-[#310603] text-xs font-extrabold"
        >
          Buat Akun Petugas
        </button>
      </form>
      </ResponsiveSheet>

      <div className="space-y-2.5">
        {staff.map((u: any) => (
          <div
            key={u.id}
            className="rounded-xl bg-[#26042A] border border-[#F5C538]/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-extrabold text-[#FFF5D6]">
                {u.full_name} <span className="font-mono text-xs text-[#FDF39D]">(@{u.username})</span>
              </div>
              <div className="text-xs text-[#A0D9CA]">
                Peran: <strong>{u.role}</strong> • Status: {u.is_active ? 'Aktif' : 'Dinonaktifkan'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleStaff(u)}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-extrabold ${
                u.is_active
                  ? 'bg-[#310603] border border-[#F5B8CB]/40 text-[#F5B8CB]'
                  : 'bg-[#A0D9CA] text-[#1A021D]'
              }`}
            >
              {u.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
