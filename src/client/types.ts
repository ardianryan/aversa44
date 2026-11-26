export type ActiveTab = 'stage' | 'tickets' | 'merch' | 'wallet';

export interface TimelineEvent {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  date_label: string;
  start_date: string;
  end_date: string;
  category: string;
  venue: string;
  description: string;
  badge_text: string;
  cta_label: string;
  cta_target: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface AnatomySlide {
  id: string;
  label: string;
  title: string;
  image: string;
  desc: string;
}

export interface TicketTier {
  id: number;
  code: string;
  name: string;
  category: 'INTERNAL' | 'EXTERNAL' | 'VIP' | 'BUNDLING';
  description: string;
  price: number;
  original_price: number | null;
  quota_total: number;
  quota_sold: number;
  requires_student_id: boolean;
  included_merch_info: string | null;
  perks_json: string[];
  is_active: boolean;
  sort_order?: number;
}

export interface MerchProduct {
  id: number;
  slug: string;
  name: string;
  category: string;
  short_spec: string;
  full_description: string;
  material_spec: string;
  price: number;
  stock_total: number;
  weight_grams: number;
  image_url: string;
  variants_json: string[];
  is_active: boolean;
  sort_order?: number;
}

export interface ShippingZone {
  id: number;
  code: string;
  mode: 'PICKUP_BOOTH' | 'LOCAL_COURIER' | 'REGULER_EXPEDITION';
  zone_name: string;
  description: string;
  base_cost: number;
  cost_per_kg: number;
  estimated_days: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface CatalogResponse {
  success: boolean;
  qrisEnabled: boolean;
  xenditEnabled?: boolean;
  eventMeta: {
    school: string;
    location: string;
    address: string;
    era: string;
    edition: string;
    themeName: string;
    heroBadgeText: string;
    heroTitlePrefix: string;
    heroTitleHighlight: string;
    heroDescription: string;
    peakDateIso: string;
    peakDateLabel: string;
    guestStar1Name: string;
    guestStar2Name: string;
    guestStarDescription: string;
    guestStarVenue: string;
    guestStarAccessNote: string;
    bankPaymentInfo: string;
    sponsorshipHeadline: string;
    sponsorshipDescription: string;
    guestStars: string[];
    sponsorshipContacts: Array<{
      name: string;
      phoneDisplay: string;
      whatsapp: string;
      role: string;
    }>;
    socials: {
      website: string;
      instagram: string;
      tiktok: string;
      facebook: string;
      humas: string;
    };
    anatomyItems: AnatomySlide[];
    creativeCredits: Array<{
      role: string;
      name: string;
      affiliation: string;
    }>;
  };
  timeline: TimelineEvent[];
  ticketTiers: TicketTier[];
  merchProducts: MerchProduct[];
  shippingZones: ShippingZone[];
}

export interface CartItem {
  key: string;
  itemType: 'TICKET' | 'MERCH';
  id: number;
  name: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  requiresStudentId?: boolean;
  weightGrams?: number;
  imageUrl?: string;
}

export interface IssuedTicket {
  id: number;
  ticket_code: string;
  order_id: number;
  tier_name: string;
  tier_category: string;
  holder_name: string;
  holder_phone: string;
  holder_identity: string | null;
  seat_zone: string;
  qr_payload: string;
  qrDataUrl?: string | null;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'USED' | 'REVOKED';
  checked_in_at: string | null;
  checked_in_by: string | null;
  gate_name: string | null;
}

export interface OrderRecord {
  id: number;
  order_code: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_type: string;
  identity_number: string | null;
  kelas_angkatan: string | null;
  order_type: 'TICKET_ONLY' | 'MERCH_ONLY' | 'MIXED';
  fulfillment_mode: 'PICKUP_BOOTH' | 'LOCAL_COURIER' | 'REGULER_EXPEDITION';
  shipping_address: string | null;
  shipping_notes: string | null;
  tracking_number: string | null;
  fulfillment_status: string;
  pickup_qr_token: string | null;
  pickup_verified_at: string | null;
  pickup_verified_by: string | null;
  subtotal_amount: number;
  shipping_amount: number;
  unique_code: number;
  total_amount: number;
  payment_method: 'QBIZ_QRIS' | 'XENDIT' | 'CASH_BOOTH' | 'MANUAL_TRANSFER';
  payment_status: 'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED' | 'REJECTED';
  qbiz_invoice_id: string | null;
  qbiz_qris_payload: string | null;
  qbiz_mode: string | null;
  payment_proof_note: string | null;
  payment_proof_url?: string | null;
  coupon_code?: string | null;
  discount_amount?: number;
  paid_at: string | null;
  expired_at: string | null;
  created_at: string;
}

export interface CouponRecord {
  id: number;
  code: string;
  description: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_purchase: number;
  max_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  applies_to: 'ALL' | 'TICKET' | 'MERCH';
  is_active: boolean;
  expires_at: string | null;
  created_at?: string;
}

export interface HydratedOrder {
  order: OrderRecord;
  items: Array<{
    id: number;
    item_type: 'TICKET' | 'MERCH';
    item_name: string;
    variant_label: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }>;
  tickets: IssuedTicket[];
  shippingZone: ShippingZone | null;
  qrisDataUrl: string | null;
  pickupQrDataUrl: string | null;
}

export interface StaffUser {
  userId?: number;
  id?: number;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'CASHIER' | 'SCANNER' | 'MEDIA';
}

export type ObsLayoutPreset =
  | 'lower_third'
  | 'corner_bug'
  | 'guest_spotlight'
  | 'rundown_schedule'
  | 'standby_soon'
  | 'sponsor_wall'
  | 'full_frame';

export type ObsTransitionPreset =
  | 'broadcast_wipe'
  | 'slide_edge'
  | 'zoom_pop'
  | 'fade_smooth'
  | 'cut';

export interface ObsOverlay {
  id: number;
  slug: string;
  name: string;
  access_token?: string;
  layout_preset: ObsLayoutPreset;
  theme_mode: 'dark' | 'light';
  transition_preset: ObsTransitionPreset;
  lower_third_title: string;
  lower_third_subtitle: string;
  corner_bug_text: string;
  show_countdown: boolean;
  show_sponsors: boolean;
  is_active: boolean;
  updated_at?: string;
}

export interface MediaSponsor {
  id: number;
  name: string;
  tier: string;
  logo_url: string;
  dark_logo_url?: string | null;
  boxed: boolean;
  is_active: boolean;
  sort_order: number;
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}
