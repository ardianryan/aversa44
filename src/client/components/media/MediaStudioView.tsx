import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawConfectioneryTransition, CONFECTIONERY_TRANSITION_SEC } from './confectionery-transition.ts';
import { scheduleStudioSfx } from '../../lib/studioSfx.ts';
import { drawCanvasVelvetStage, drawCanvasStarBorder, drawCanvasFloatingOrnament, easeOutStage, smoothStep } from '../reactbits/canvas-effects.ts';
import { ShinyText } from '../reactbits/ShinyText.tsx';
import { SplitText } from '../reactbits/SplitText.tsx';
import { StarBorder } from '../reactbits/StarBorder.tsx';
import AnimatedContent from '../reactbits/AnimatedContent.tsx';
import { AuroraBackground } from '../reactbits/AuroraBackground.tsx';
import {
  clampMediaFraming,
  computeMaxPanFractions,
  getCollageSlotRects,
  type MediaFraming,
} from '../../../shared/media-framing.ts';
import {
  computeMediaTimeline,
  computePhotoSlideState,
  MAX_STUDIO_PHOTOS,
  type StudioMediaMode,
} from '../../../shared/media-timeline.ts';
import {
  convertToMp4InBrowser,
  ensureMp4Duration,
  IMAGE_INPUT_ACCEPT,
  normalizeImageInBrowser,
  prepareVideoInBrowser,
  VIDEO_INPUT_ACCEPT,
} from '../../lib/mediaConverter.ts';
import { MediaCropBox } from './MediaCropBox.tsx';
import { VideoTrimmerControl, type VideoClipState } from './VideoTrimmerControl.tsx';
import { formatRupiah, type MediaSponsor, type MerchProduct, type TicketTier, type TimelineEvent } from '../../types.ts';

interface MediaStudioViewProps {
  mediaData: {
    siteSettings: any;
    timeline: TimelineEvent[];
    ticketTiers: TicketTier[];
    merchProducts: MerchProduct[];
    mediaSponsors: MediaSponsor[];
  };
  onNotify: (msg: string, isErr?: boolean) => void;
}

type AspectRatio = '4:5' | '1:1' | '9:16' | '16:9';
type AversaTemplate = 'countdown' | 'guest_star' | 'schedule' | 'promo_store' | 'live_recap';
type BackdropTheme = 'velvet_stardust' | 'golden_gala' | 'pinwheel_mint';
type ColorFilterPreset = 'original' | 'crisp' | 'warm' | 'bw';

interface StudioPhotoItem {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  framing: MediaFraming;
}

const RATIO_DIMS: Record<AspectRatio, { w: number; h: number; label: string }> = {
  '4:5': { w: 1080, h: 1350, label: 'Feed IG Portrait (4:5)' },
  '1:1': { w: 1080, h: 1080, label: 'Feed Square (1:1)' },
  '9:16': { w: 1080, h: 1920, label: 'Story & Reels (9:16)' },
  '16:9': { w: 1920, h: 1080, label: 'YouTube & Banner (16:9)' },
};

const FILTER_CSS: Record<ColorFilterPreset, { label: string; css: string }> = {
  original: { label: 'Original', css: 'none' },
  crisp: { label: 'Theatrical Crisp', css: 'contrast(1.12) saturate(1.16) brightness(1.03)' },
  warm: { label: 'Golden Gala Warm', css: 'contrast(1.06) saturate(1.14) sepia(0.14) brightness(1.03)' },
  bw: { label: 'Dramatic B&W', css: 'grayscale(1) contrast(1.22) brightness(1.04)' },
};

const BACKDROP_PATHS: Record<BackdropTheme, { label: string; src: string }> = {
  velvet_stardust: { label: 'Imperial Velvet Stardust', src: '/assets/backgrounds/bg-imperial-velvet-stardust.png' },
  golden_gala: { label: 'Golden Ticket Gala', src: '/assets/backgrounds/bg-golden-ticket-gala.png' },
  pinwheel_mint: { label: 'Theatrical Mint Pinwheel', src: '/assets/backgrounds/bg-theatrical-pinwheel-mint.png' },
};

function drawRoundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitCanvasLines(ctx: CanvasRenderingContext2D, text: string, width: number, weight: number, family: string, initialSize: number): { lines: string[]; size: number } {
  let size = initialSize;
  let lines: string[] = [];
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapCanvasText(ctx, text, width);
    if (lines.length <= 3) return { lines, size };
    size -= 1;
  } while (size >= initialSize * 0.65);
  const visible = lines.slice(0, 3);
  let last = visible[2] || '';
  while (last.length && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  visible[2] = `${last.trimEnd()}…`;
  return { lines: visible, size: size + 1 };
}

// Canvas equivalent of the ReactBits SplitText entrance, shared by preview and export.
function drawStaggeredLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, elapsed: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const gap = ctx.measureText(' ').width;
  const widths = words.map((word) => ctx.measureText(word).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, words.length - 1) * gap;
  const scale = Math.min(1, maxWidth / Math.max(1, total));
  const start = ctx.textAlign === 'center' ? x - total * scale / 2 : x;
  let offset = 0;
  ctx.save();
  ctx.textAlign = 'left';
  for (let i = 0; i < words.length; i++) {
    const progress = easeOutStage((elapsed - i * 0.09) / 0.9);
    ctx.save();
    ctx.globalAlpha *= progress;
    ctx.translate(start + offset * scale, y + (1 - progress) * 12 * scale);
    ctx.scale(scale, 1);
    ctx.fillText(words[i]!, 0, 0);
    ctx.restore();
    offset += widths[i]! + gap;
  }
  ctx.restore();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  framing: MediaFraming = { zoom: 1, panX: 0, panY: 0 },
  extraScale = 1
) {
  const srcW = img instanceof HTMLVideoElement ? img.videoWidth || 1080 : img.naturalWidth || 1080;
  const srcH = img instanceof HTMLVideoElement ? img.videoHeight || 1080 : img.naturalHeight || 1080;
  const srcAspect = srcW / Math.max(1, srcH);
  const rectAspect = rw / Math.max(1, rh);

  const safeFraming = clampMediaFraming(framing, srcW, srcH, rw, rh);
  const zoom = safeFraming.zoom * extraScale;
  let dw = rw;
  let dh = rh;
  if (srcAspect > rectAspect) {
    dh = rh * zoom;
    dw = dh * srcAspect;
  } else {
    dw = rw * zoom;
    dh = dw / srcAspect;
  }
  const dx = rx + (rw - dw) / 2 + safeFraming.panX * rw;
  const dy = ry + (rh - dh) / 2 + safeFraming.panY * rh;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

export const MediaStudioView: React.FC<MediaStudioViewProps> = ({ mediaData, onNotify }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('4:5');
  const [template, setTemplate] = useState<AversaTemplate>('guest_star');
  const [backdrop, setBackdrop] = useState<BackdropTheme>('velvet_stardust');
  const [mediaMode, setMediaMode] = useState<StudioMediaMode>('photo');
  const [colorFilter, setColorFilter] = useState<ColorFilterPreset>('crisp');
  const [showCurtain, setShowCurtain] = useState(true);
  const [showSwoosh, setShowSwoosh] = useState(true);
  const [posterLayout, setPosterLayout] = useState<'collage' | 'single'>('collage');

  const [photos, setPhotos] = useState<StudioPhotoItem[]>([]);
  const [videoClip, setVideoClip] = useState<VideoClipState | null>(null);

  const captureVideoPoster = useCallback((video: HTMLVideoElement) => {
    if (!video.videoWidth || !video.videoHeight) return;
    const offscreen = document.createElement('canvas');
    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    offscreen.width = Math.max(1, Math.round(video.videoWidth * scale));
    offscreen.height = Math.max(1, Math.round(video.videoHeight * scale));
    const octx = offscreen.getContext('2d');
    if (octx) {
      octx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
      try {
        const dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
        setVideoClip((prev) => {
          if (!prev) return null;
          if (prev.posterDataUrl === dataUrl && prev.width === video.videoWidth && prev.height === video.videoHeight) return prev;
          return {
            ...prev,
            width: video.videoWidth,
            height: video.videoHeight,
            posterDataUrl: dataUrl,
          };
        });
      } catch {
        // ignore
      }
    }
  }, []);
  const [selectedTimelineId, setSelectedTimelineId] = useState<number>(mediaData.timeline[0]?.id || 0);
  const [promoTarget, setPromoTarget] = useState<string>(
    mediaData.ticketTiers[0]
      ? `TKT:${mediaData.ticketTiers[0].id}`
      : mediaData.merchProducts[0]
      ? `MRC:${mediaData.merchProducts[0].id}`
      : ''
  );

  const meta = mediaData.siteSettings || {};
  const [customBadge, setCustomBadge] = useState('DIES NATALIS KE-44 • SMAN 1 GEDEG');
  const [customTitle, setCustomTitle] = useState('Malam Puncak AVERSA 44');
  const [customSubtitle, setCustomSubtitle] = useState(
    `${meta.peakDateLabel || '17 Desember 2026'} • ${meta.guestStarVenue || 'Lapangan Tengah SMAN 1 Gedeg'}`
  );
  const [customFooterNote, setCustomFooterNote] = useState('Info & Pemesanan Tiket Resmi di Website AVERSA 44');
  const [mediaPartner, setMediaPartner] = useState('');
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/media-partner').then(r => { if (!r.ok) throw Error('Logo media partner gagal dimuat.'); return r.json(); }).then(d => { if (alive) setMediaPartner(d.url); }).catch(e => onNotify(e.message, true));
    return () => { alive = false; };
  }, [onNotify]);
  const [includeSponsors, setIncludeSponsors] = useState(true);
  const [includeSfx, setIncludeSfx] = useState(true);
  const [mediaStatus, setMediaStatus] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [includeOutro, setIncludeOutro] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(true);

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [assetTick, setAssetTick] = useState(0);
  const previewStopRef = useRef<(() => void) | null>(null);
  const animationBusyRef = useRef(false);
  const resultUrlRef = useRef('');
  useEffect(() => () => { previewStopRef.current?.(); if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current); }, []);

  const ensureImage = useCallback((src: string): HTMLImageElement | null => {
    if (!src) return null;
    const cached = loadedImagesRef.current.get(src);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setAssetTick((n) => n + 1);
    img.src = src;
    loadedImagesRef.current.set(src, img);
    return null;
  }, []);

  // Preload all official Canva / brandkit reference assets
  useEffect(() => {
    [
      BACKDROP_PATHS[backdrop].src,
      '/assets/brandkit/aversa-media-curtain.svg',
      '/assets/brandkit/golden-stardust-arc-swoosh.png',
      '/assets/brandkit/hypnotic-swirl-disc.svg',
      '/assets/brandkit/item-magic-top-hat.svg',
      '/assets/brandkit/item-golden-ticket-badge.svg',
      '/assets/brandkit/item-golden-chocolate-bar.svg',
      '/assets/brandkit/item-golden-cane.svg',
      '/assets/brandkit/item-stardust-sparkle-stars.svg',
      '/assets/extracted/logo-sman1gedeg.png',
      '/assets/brandkit/item-ornate-corner-filigree.svg',
      '/assets/extracted/aversa-tophat-2026.png',
      '/assets/extracted/guest-title-gold.png',
      '/assets/extracted/guest-niken-salindry.png',
      '/assets/extracted/guest-kembange-jagad.png',
      '/assets/png/logo-symbol-color.png',
      '/assets/png/aversa-logotype-horizontal.png',
      ...mediaData.mediaSponsors.filter((s) => s.is_active).map((s) => s.dark_logo_url || s.logo_url),
      ...mediaData.merchProducts.map((m) => m.image_url),
    ].forEach((src) => ensureImage(src));
  }, [backdrop, mediaData, ensureImage]);

  // Sync template defaults when switching preset
  const applyTemplateDefaults = (tpl: AversaTemplate) => {
    setTemplate(tpl);
    if (tpl === 'countdown') {
      setCustomBadge('HITUNG MUNDUR • 1982 - 2026');
      setCustomTitle(meta.heroTitleHighlight || 'Action, Compassion, Celebration');
      setCustomSubtitle(`${meta.peakDateLabel || '17 Desember 2026'} • ${meta.guestStarVenue || 'SMAN 1 Gedeg'}`);
    } else if (tpl === 'guest_star') {
      setCustomBadge('PUNCAK AVERSA • 17 DESEMBER 2026');
      setCustomTitle(`${meta.guestStar1Name || 'Niken Salindry'} & ${meta.guestStar2Name || 'Kembange Jagad'}`);
      setCustomSubtitle(meta.guestStarVenue || 'Lapangan Tengah SMA Negeri 1 Gedeg');
    } else if (tpl === 'schedule') {
      const ev = mediaData.timeline.find((e) => e.id === selectedTimelineId) || mediaData.timeline[0];
      setCustomBadge(ev ? `${ev.date_label} • ${ev.category}` : 'RANGKAIAN ACARA');
      setCustomTitle(ev?.title || 'Rangkaian Acara Dies Natalis ke-44');
      setCustomSubtitle(ev ? `${ev.subtitle} • ${ev.venue}` : 'SMA Negeri 1 Gedeg');
    } else if (tpl === 'promo_store') {
      setCustomBadge('OFFICIAL E-TICKET & MERCH');
      if (promoTarget.startsWith('TKT:')) {
        const t = mediaData.ticketTiers.find((x) => x.id === Number(promoTarget.slice(4)));
        if (t) {
          setCustomTitle(t.name);
          setCustomSubtitle(`Mulai ${formatRupiah(t.price)} • ${t.description.slice(0, 72)}`);
        }
      } else if (promoTarget.startsWith('MRC:')) {
        const m = mediaData.merchProducts.find((x) => x.id === Number(promoTarget.slice(4)));
        if (m) {
          setCustomTitle(m.name);
          setCustomSubtitle(`${formatRupiah(m.price)} • ${m.short_spec}`);
        }
      }
    } else if (tpl === 'live_recap') {
      setCustomBadge('LIVE MOMENT • AVERSA 44');
      setCustomTitle('Kemeriahan Dies Natalis ke-44');
      setCustomSubtitle(`${meta.school || 'SMA Negeri 1 Gedeg'} • Kabupaten Mojokerto`);
    }
  };

  const timelinePlan = useMemo(() => {
    const clipDur = videoClip ? Math.max(0.5, videoClip.trimEnd - videoClip.trimStart) : 8;
    return computeMediaTimeline({
      mediaMode,
      photoCount: photos.length || 1,
      clipDurationSec: clipDur,
      includeOutro,
    });
  }, [mediaMode, photos.length, videoClip, includeOutro]);

  const drawStudioFrame = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, elapsedSec = 2.0, isAnimated = false) => {
      const u = Math.min(w, h);
      const isLandscape = w > h;
      const motionEnabled = isAnimated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const safePad = Math.round(u * 0.055);
      const activeFilter = FILTER_CSS[colorFilter].css;
      const activeSponsors = includeSponsors ? mediaData.mediaSponsors.filter(s => s.is_active).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) : [];
      const extraRows = Math.ceil(Math.max(0, activeSponsors.length - 3) / 6);
      const sponsorHeight = activeSponsors.length ? u * (0.13 + extraRows * 0.055) : 0;
      const partnerHeight = mediaPartner ? u * 0.085 : 0;
      const creditsHeight = sponsorHeight + partnerHeight;
      const verticalSafe = aspectRatio === '9:16' ? h * 0.12 : safePad;
      const cardBottomY = h - verticalSafe - (creditsHeight + u * 0.02);
      const textWidth = isLandscape && template === 'promo_store' ? w * 0.4 : w - safePad * 2;
      ctx.save();
      const titleFit = fitCanvasLines(ctx, customTitle, textWidth, 800, '"Playfair Display", Georgia, serif', Math.round(u * 0.068));
      const subtitleFit = fitCanvasLines(ctx, customSubtitle, textWidth, 600, '"Plus Jakarta Sans", sans-serif', Math.round(u * 0.036));
      ctx.restore();
      const titleFontSize = titleFit.size;
      const subtitleFontSize = subtitleFit.size;
      const titleLineHeight = titleFontSize * 1.13;
      const subtitleLineHeight = subtitleFontSize * 1.22;
      const titleLines = titleFit.lines;
      const subLines = subtitleFit.lines;
      const footerY = cardBottomY - u * 0.028;
      const subtitleLastY = footerY - u * 0.058;
      const subtitleFirstY = subtitleLastY - Math.max(0, subLines.length - 1) * subtitleLineHeight;
      const titleLastY = subtitleFirstY - subtitleFontSize * 0.65 - titleFontSize * 0.65 - u * 0.014;
      const titleFirstY = titleLastY - Math.max(0, titleLines.length - 1) * titleLineHeight;
      const badgeH = Math.round(u * 0.054);
      const textTopStart = titleFirstY - titleFontSize * 0.68 - badgeH - u * 0.016;

      // Stage texture remains behind uploaded media.
      ctx.save();
      drawCanvasVelvetStage(ctx, w, h, elapsedSec, motionEnabled);
      const bgImg = ensureImage(BACKDROP_PATHS[backdrop].src);
      if (bgImg) {
        ctx.globalAlpha = 0.22;
        drawCoverImage(ctx, bgImg, 0, 0, w, h);
      }
      ctx.restore();

      // 2. Uploaded User Media Layer (Photo collage / Slideshow / Trimmed Video)
      const isLiveOrPhotoCanvas = mediaMode === 'photo' ? photos.length > 0 : Boolean(videoElRef.current && videoElRef.current.readyState >= 2);
      if (isLiveOrPhotoCanvas && (template === 'live_recap' || photos.length > 0 || mediaMode === 'video')) {
        ctx.save();
        ctx.filter = activeFilter;
        const mediaTop = 0;
        const mediaH = h;
        const mediaX = 0;
        const mediaW = w;

        drawRoundRectPath(ctx, mediaX, mediaTop, mediaW, mediaH, Math.round(u * 0.028));
        ctx.clip();

        if (mediaMode === 'video' && videoElRef.current && videoElRef.current.readyState >= 2) {
          drawCoverImage(ctx, videoElRef.current, mediaX, mediaTop, mediaW, mediaH, videoClip?.framing);
        } else if (mediaMode === 'photo' && photos.length > 0) {
          if (isAnimated) {
            const slideState = computePhotoSlideState(
              photos.length,
              Math.max(0, elapsedSec - timelinePlan.mainStartSec),
              timelinePlan.mainHoldSec
            );
            const primary = photos[slideState.primaryIdx]!;
            const pImg = ensureImage(primary.dataUrl);
            if (pImg) {
              drawCoverImage(
                ctx,
                pImg,
                mediaX,
                mediaTop,
                mediaW,
                mediaH,
                primary.framing,
                1 + slideState.localProgressPrimary * 0.06
              );
            }
            if (slideState.nextIdx !== null && slideState.wipeProgress > 0) {
              const nxt = photos[slideState.nextIdx]!;
              const nImg = ensureImage(nxt.dataUrl);
              if (nImg) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(mediaX, mediaTop, mediaW * slideState.wipeProgress, mediaH);
                ctx.clip();
                drawCoverImage(ctx, nImg, mediaX, mediaTop, mediaW, mediaH, nxt.framing, 1);
                ctx.restore();
              }
            }
          } else {
            const rects = getCollageSlotRects(
              photos.length,
              posterLayout,
              mediaW,
              mediaH,
              0,
              0,
              u,
              isLandscape
            );
            photos.slice(0, rects.length).forEach((ph, idx) => {
              const r = rects[idx]!;
              const pImg = ensureImage(ph.dataUrl);
              if (pImg) {
                drawCoverImage(ctx, pImg, mediaX + r.rx, mediaTop + r.ry, r.rw, r.rh, ph.framing);
              }
            });
          }
        }
        ctx.restore();

      }

      // Animated royal gold StarBorder & corner filigrees framing the main stage.
      drawCanvasStarBorder(ctx, Math.round(safePad * 0.45), Math.round(verticalSafe * 0.45), w - Math.round(safePad * 0.9), h - Math.round(verticalSafe * 0.9), elapsedSec, motionEnabled);
      if (showSwoosh) {
        const filigree = ensureImage('/assets/brandkit/item-ornate-corner-filigree.svg');
        if (filigree) {
          const fSize = Math.round(u * 0.095);
          const fAlpha = motionEnabled ? 0.55 + Math.sin(elapsedSec * 1.8) * 0.2 : 0.65;
          const corners: Array<[number, number, number, number]> = [
            [safePad * 0.45, verticalSafe * 0.45, 1, 1],
            [w - safePad * 0.45, verticalSafe * 0.45, -1, 1],
            [safePad * 0.45, h - verticalSafe * 0.45, 1, -1],
            [w - safePad * 0.45, h - verticalSafe * 0.45, -1, -1],
          ];
          corners.forEach(([cx, cy, sx, sy]) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(sx, sy);
            ctx.globalAlpha = fAlpha;
            ctx.drawImage(filigree, 0, 0, fSize, fSize);
            ctx.restore();
          });
        }
        // Drifting golden stardust particles along the stage edges
        if (motionEnabled) {
          ctx.save();
          for (let p = 0; p < 14; p++) {
            const side = p % 2 === 0;
            const px = side ? u * (0.04 + ((p * 37) % 12) * 0.012) : w - u * (0.04 + ((p * 53) % 12) * 0.012);
            const py = ((h * 0.15 + (p * 117) % (h * 0.7) - elapsedSec * u * 0.045) % (h * 0.75) + h * 0.75) % (h * 0.75) + h * 0.12;
            const pr = u * (0.003 + (p % 3) * 0.002);
            const alpha = 0.25 + 0.45 * Math.abs(Math.sin(elapsedSec * 1.9 + p * 0.9));
            ctx.fillStyle = p % 3 === 0 ? '#FDF39D' : '#F5C538';
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Small animated props stay near the frame, leaving the center for the subject.
      const propPaths: Record<AversaTemplate, string[]> = {
        guest_star: ['item-golden-cane.svg', 'item-stardust-sparkle-stars.svg', 'item-golden-ticket-badge.svg'],
        countdown: ['item-golden-ticket-badge.svg', 'item-stardust-sparkle-stars.svg', 'item-golden-chocolate-bar.svg'],
        schedule: ['item-golden-cane.svg', 'item-stardust-sparkle-stars.svg', 'item-golden-ticket-badge.svg'],
        promo_store: ['item-golden-ticket-badge.svg', 'item-golden-chocolate-bar.svg', 'item-stardust-sparkle-stars.svg'],
        live_recap: ['item-stardust-sparkle-stars.svg', 'item-golden-cane.svg', 'item-golden-ticket-badge.svg'],
      };
      propPaths[template].forEach((name, index) => {
        const prop = ensureImage(`/assets/brandkit/${name}`);
        if (!prop || (name.includes('stars') && !showSwoosh)) return;
        const size = u * (name.includes('stars') ? 0.11 : 0.13);
        const x = index === 0 ? u * 0.08 : index === 1 ? w - u * 0.08 : w - u * 0.095;
        const yBase = index === 2 ? Math.max(h * 0.24, textTopStart - size * 1.45) : Math.min(h * 0.44, Math.max(h * 0.2, textTopStart - size * 0.8));
        const phase = elapsedSec * 1.35 + index * 2.1;
        ctx.save();
        ctx.translate(x, yBase + (motionEnabled ? Math.sin(phase) * u * 0.012 : 0));
        ctx.rotate((index === 0 ? -0.14 : 0.14) + (motionEnabled ? Math.sin(phase) * 0.08 : 0));
        ctx.globalAlpha = 0.9;
        ctx.drawImage(prop, -size / 2, -size / 2, size, size);
        ctx.restore();
      });

      // The curtain is drawn in narrow strips so its lower edge can sway gently.
      if (showCurtain) {
        const curtain = ensureImage('/assets/brandkit/aversa-media-curtain.svg');
        if (curtain) {
          const curtainH = Math.min(u * 0.13, h * 0.15);
          if (motionEnabled) {
            const strips = 32;
            for (let i = 0; i < strips; i++) {
              const sx = curtain.naturalWidth * i / strips;
              const sw = curtain.naturalWidth / strips;
              const dx = w * i / strips;
              const dh = curtainH + Math.sin(elapsedSec * 1.1 + i * 0.25) * u * 0.003;
              ctx.drawImage(curtain, sx, 0, sw, curtain.naturalHeight, dx, 0, w / strips + 1, dh);
            }
          } else ctx.drawImage(curtain, 0, 0, w, curtainH);
        }
      }

      // Official school crest and AVERSA wordmark form the identity lockup.
      const topY = verticalSafe + Math.round(u * 0.015);
      const crestH = Math.round(u * 0.074);
      ctx.save();
      ctx.fillStyle = 'rgba(26,2,29,0.88)';
      ctx.strokeStyle = 'rgba(245,197,56,0.62)';
      ctx.lineWidth = Math.max(1.5, u * 0.002);
      drawRoundRectPath(ctx, safePad - u * 0.015, topY - u * 0.012, w - safePad * 2 + u * 0.03, crestH + u * 0.024, u * 0.018);
      ctx.fill(); ctx.stroke(); ctx.restore();
      let cursorX = safePad;
      for (const crestPath of [
        '/assets/extracted/logo-sman1gedeg.png',
      ]) {
        const cImg = ensureImage(crestPath);
        if (cImg) {
          const cw = Math.round(crestH * (cImg.naturalWidth / Math.max(1, cImg.naturalHeight)));
          ctx.drawImage(cImg, cursorX, topY, cw, crestH);
          cursorX += cw + Math.round(u * 0.016);
        }
      }

      ctx.save();
      ctx.fillStyle = '#FFF5D6';
      ctx.font = `700 ${Math.round(u * 0.025)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('SMA NEGERI 1 GEDEG', cursorX, topY + crestH * 0.5, w * 0.42);
      ctx.restore();

      const logotype = ensureImage('/assets/png/aversa-logotype-horizontal.png');
      if (logotype) {
        const lH = Math.round(u * 0.064);
        const lW = Math.round(lH * (logotype.naturalWidth / Math.max(1, logotype.naturalHeight)));
        ctx.drawImage(logotype, w - safePad - lW, topY + 4, lW, lH);
      }

      // 7. Bottom Theatrical Typography Card & Sponsor Auto-Stamp Strip
      ctx.save();
      const grad = ctx.createLinearGradient(0, textTopStart - Math.round(u * 0.12), 0, h);
      grad.addColorStop(0, 'rgba(26, 2, 29, 0)');
      grad.addColorStop(0.28, 'rgba(26, 2, 29, 0.90)');
      grad.addColorStop(1, 'rgba(13, 1, 15, 0.97)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, textTopStart - Math.round(u * 0.12), w, h - (textTopStart - Math.round(u * 0.12)));

      // A short staggered entrance keeps the video preview and rendered export in sync.
      if (motionEnabled) {
        const reveal = Math.min(1, Math.max(0, (elapsedSec - timelinePlan.mainStartSec) / 0.8));
        ctx.globalAlpha = reveal;
        ctx.translate(0, (1 - reveal) * u * 0.035);
      }

      // Pill Badge with animated golden sheen
      ctx.font = `700 ${Math.round(u * 0.026)}px "Cinzel", Georgia, serif`;
      const badgeW = Math.min(w - safePad * 2, ctx.measureText(customBadge.toUpperCase()).width + Math.round(u * 0.07));
      const centered = template === 'countdown';
      const textX = centered ? w / 2 : safePad;
      const badgeX = centered ? (w - badgeW) / 2 : safePad;

      ctx.fillStyle = '#310603';
      ctx.strokeStyle = '#F5C538';
      ctx.lineWidth = 2.5;
      drawRoundRectPath(ctx, badgeX, textTopStart, badgeW, badgeH, badgeH / 2);
      ctx.fill();
      ctx.stroke();

      if (motionEnabled) {
        ctx.save();
        drawRoundRectPath(ctx, badgeX, textTopStart, badgeW, badgeH, badgeH / 2);
        ctx.clip();
        const sweep = ((elapsedSec * 0.55) % 1.8) - 0.4;
        const sheenX = badgeX + sweep * badgeW;
        const sheen = ctx.createLinearGradient(sheenX - u * 0.08, 0, sheenX + u * 0.08, 0);
        sheen.addColorStop(0, 'rgba(253, 243, 157, 0)');
        sheen.addColorStop(0.5, 'rgba(253, 243, 157, 0.28)');
        sheen.addColorStop(1, 'rgba(253, 243, 157, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(badgeX, textTopStart, badgeW, badgeH);
        ctx.restore();
      }

      ctx.fillStyle = '#FDF39D';
      ctx.textAlign = centered ? 'center' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(customBadge.toUpperCase(), centered ? textX : badgeX + Math.round(u * 0.035), textTopStart + badgeH / 2, badgeW - Math.round(u * 0.07));

      // Headline in Playfair Display Gold-Cream
      ctx.font = `800 ${titleFontSize}px "Playfair Display", Georgia, serif`;
      ctx.fillStyle = '#FFF5D6';
      let ty = titleFirstY;
      for (const [lineIndex, ln] of titleLines.entries()) {
        if (motionEnabled) drawStaggeredLine(ctx, ln, textX, ty, textWidth, Math.max(0, elapsedSec - timelinePlan.mainStartSec - lineIndex * 0.25));
        else ctx.fillText(ln, textX, ty, textWidth);
        ty += titleLineHeight;
      }

      // Subtitle
      ctx.font = `600 ${subtitleFontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#A0D9CA';
      ty = subtitleFirstY;
      for (const sl of subLines) {
        ctx.fillText(sl, textX, ty, textWidth);
        ty += subtitleLineHeight;
      }

      // Footer CTA Note
      ctx.font = `700 ${Math.round(u * 0.028)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#F5B8CB';
      ctx.fillText(customFooterNote, textX, footerY, textWidth);

      // Reserve a separate credit area, keeping logos inside the safe margin.
      const drawCredits = () => {
      if (creditsHeight > 0) {
        ctx.save();
        const creditsY = h - verticalSafe - creditsHeight;
        ctx.fillStyle = '#1A021D';
        ctx.fillRect(safePad, creditsY, w - safePad * 2, creditsHeight);
        ctx.strokeStyle = '#F5C53866';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(safePad, creditsY); ctx.lineTo(w - safePad, creditsY); ctx.stroke();
        const drawLogo = (src: string, x: number, y: number, width: number, height: number, boxed = false) => {
          const img = ensureImage(src);
          if (!img) return;
          const scale = Math.min((width - u * 0.025) / img.naturalWidth, (height - u * 0.012) / img.naturalHeight);
          const lw = img.naturalWidth * scale, lh = img.naturalHeight * scale;
          const lx = x + (width - lw) / 2, ly = y + (height - lh) / 2;
          if (boxed) { ctx.fillStyle = '#FFF5D6'; ctx.fillRect(lx - 4, ly - 4, lw + 8, lh + 8); }
          ctx.drawImage(img, lx, ly, lw, lh);
        };
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(u * 0.022)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#FFF5D6';
        if (activeSponsors.length) {
          ctx.fillText('DIDUKUNG OLEH', w / 2, creditsY + u * 0.016);
          const main = activeSponsors.slice(0, 3);
          const mainWidth = (w - safePad * 2) / 3;
          main.forEach((sp, i) => drawLogo(sp.dark_logo_url || sp.logo_url, (w - main.length * mainWidth) / 2 + i * mainWidth, creditsY + u * 0.032, mainWidth, u * 0.085, sp.boxed && !sp.dark_logo_url));
          const smallWidth = (w - safePad * 2) / 6;
          activeSponsors.slice(3).forEach((sp, i) => {
            const count = Math.min(6, activeSponsors.length - 3 - Math.floor(i / 6) * 6);
            drawLogo(sp.dark_logo_url || sp.logo_url, (w - count * smallWidth) / 2 + (i % 6) * smallWidth, creditsY + u * 0.13 + Math.floor(i / 6) * u * 0.055, smallWidth, u * 0.044, sp.boxed && !sp.dark_logo_url);
          });
        }
        if (mediaPartner) {
          const py = creditsY + sponsorHeight;
          ctx.fillStyle = '#FFF5D6';
          ctx.fillText('OFFICIAL MEDIA PARTNER', w / 2, py + u * 0.012);
          drawLogo(mediaPartner, w / 2 - u * 0.16, py + u * 0.025, u * 0.32, u * 0.058);
        }
        ctx.restore();
      }

      };
      drawCredits();

      // The announcement uses a ceremonial frame; other layouts keep a lighter single edge.
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 197, 56, 0.95)';
      ctx.lineWidth = Math.max(4, Math.round(u * 0.006));
      const bPad = Math.round(u * 0.025);
      drawRoundRectPath(ctx, bPad, bPad, w - bPad * 2, h - bPad * 2, Math.round(u * 0.025));
      ctx.stroke();
      // Curved stage flourishes scale with the shorter edge, leaving the subject clear.
      ctx.strokeStyle = 'rgba(245, 197, 56, 0.65)';
      ctx.lineWidth = Math.max(2, u * 0.002);
      const flourish = u * 0.14;
      for (const side of (template === 'guest_star' || template === 'countdown' ? [1, -1] : [])) {
        ctx.save();
        ctx.translate(side === 1 ? bPad : w - bPad, h * 0.5);
        ctx.scale(side, 1);
        ctx.beginPath();
        ctx.moveTo(0, -flourish);
        ctx.bezierCurveTo(flourish * 0.12, -flourish * 0.45, flourish * 0.27, -flourish * 0.35, flourish * 0.3, 0);
        ctx.bezierCurveTo(flourish * 0.27, flourish * 0.35, flourish * 0.12, flourish * 0.45, 0, flourish);
        ctx.stroke();
        ctx.restore();
      }
      if (template === 'countdown' || template === 'guest_star') {
        ctx.strokeStyle = 'rgba(245, 197, 56, 0.3)';
        ctx.lineWidth = 1.5;
        drawRoundRectPath(ctx, bPad + 10, bPad + 10, w - (bPad + 10) * 2, h - (bPad + 10) * 2, Math.round(u * 0.02));
        ctx.stroke();
      }
      if (template === 'promo_store') {
        // Perforations echo the physical golden ticket without covering the photo.
        ctx.save();
        ctx.strokeStyle = '#F5C538';
        ctx.lineWidth = u * 0.002;
        ctx.setLineDash([u * 0.006, u * 0.009]);
        ctx.beginPath();
        ctx.moveTo(bPad, textTopStart - u * 0.025);
        ctx.lineTo(w - bPad, textTopStart - u * 0.025);
        ctx.stroke();
        ctx.restore();
      }
      if (template === 'schedule' || template === 'live_recap') {
        ctx.strokeStyle = '#FDF39D';
        ctx.lineWidth = u * 0.004;
        const arm = u * 0.055;
        for (const [x, y, sx, sy] of [[bPad, bPad, 1, 1], [w - bPad, bPad, -1, 1], [bPad, h - bPad, 1, -1], [w - bPad, h - bPad, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x! + sx! * arm, y!); ctx.lineTo(x!, y!); ctx.lineTo(x!, y! + sy! * arm); ctx.stroke();
        }
      }
      const corner = ensureImage('/assets/brandkit/item-ornate-corner-filigree.svg');
      if (corner && (template === 'guest_star' || template === 'countdown')) {
        const size = Math.round(u * 0.09);
        ctx.globalAlpha = 0.8;
        for (const [x, y, sx, sy] of [[bPad, bPad, 1, 1], [w - bPad, bPad, -1, 1], [bPad, h - bPad, 1, -1], [w - bPad, h - bPad, -1, -1]]) {
          ctx.save(); ctx.translate(x!, y!); ctx.scale(sx!, sy!); ctx.drawImage(corner, 0, 0, size, size); ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      if (motionEnabled) {
        const sweepX = ((elapsedSec * 0.18) % 1.3 - 0.15) * w;
        const sweep = ctx.createLinearGradient(sweepX - u * 0.12, 0, sweepX + u * 0.12, 0);
        sweep.addColorStop(0, 'rgba(245,197,56,0)');
        sweep.addColorStop(0.5, 'rgba(253,243,157,0.95)');
        sweep.addColorStop(1, 'rgba(245,197,56,0)');
        ctx.strokeStyle = sweep; ctx.lineWidth = Math.max(3, u * 0.005);
        drawRoundRectPath(ctx, bPad, bPad, w - bPad * 2, h - bPad * 2, Math.round(u * 0.025)); ctx.stroke();
      }
      ctx.restore();


      ctx.restore();

      // Every animated export uses the same four editorial beats as its preview.
      if (isAnimated) {
        const outro = includeOutro && elapsedSec >= timelinePlan.outroStartSec;
        const opening = elapsedSec < timelinePlan.mainTransitionSec;
        if (opening || outro) {
          const highlight = !outro && elapsedSec >= timelinePlan.introSec;
          const sceneStart = outro ? timelinePlan.outroStartSec : highlight ? timelinePlan.introSec : 0;
          const localTime = elapsedSec - sceneStart;
          const ease = easeOutStage;
          const enter = motionEnabled ? ease(localTime / 1.1) : 1;
          ctx.save();
          ctx.globalAlpha = 1;
          drawCanvasVelvetStage(ctx, w, h, elapsedSec, motionEnabled);
          drawCanvasStarBorder(ctx, safePad, verticalSafe, w - safePad * 2, h - verticalSafe * 2, elapsedSec, motionEnabled);
          const ornamentReveal = motionEnabled ? ease(elapsedSec / 1.3) : 1;
          const ornamentNames = ['item-golden-ticket-badge.svg', 'item-golden-chocolate-bar.svg', 'item-golden-cane.svg', 'item-stardust-sparkle-stars.svg'];
          const ornamentPositions = [[0.15, 0.22], [0.85, 0.22], [0.14, 0.82], [0.86, 0.82]];
          ornamentNames.forEach((name, index) => {
            if (index === 3 && !showSwoosh) return;
            const ornament = ensureImage(`/assets/brandkit/${name}`);
            const position = ornamentPositions[index]!;
            if (ornament) drawCanvasFloatingOrnament(ctx, ornament, w * position[0]!, h * position[1]!, u * 0.11, elapsedSec, index, motionEnabled, motionEnabled ? ease(Math.max(0, elapsedSec - index * 0.16) / 1.3) : ornamentReveal);
          });
          const emblem = ensureImage('/assets/extracted/aversa-tophat-2026.png');
          // The same logo travels into the highlight position across the scene boundary.
          const morph = outro ? 0 : motionEnabled ? smoothStep((elapsedSec - timelinePlan.introSec + 0.6) / 0.9) : highlight ? 1 : 0;
          const sceneUnit = Math.min(u, h - creditsHeight - verticalSafe * 2);
          const logoSize = sceneUnit * (0.36 - morph * 0.19);
          const logoY = (h - creditsHeight) * (0.20 - morph * 0.01);
          const logoEnter = outro ? enter : motionEnabled ? ease(elapsedSec / 1.1) : 1;
          ctx.save();
          ctx.globalAlpha *= logoEnter;
          ctx.translate(w / 2, logoY + logoSize / 2 + (1 - logoEnter) * u * 0.025);
          const scale = motionEnabled ? 0.94 + logoEnter * 0.06 : 1;
          ctx.scale(scale, scale);
          if (emblem) {
            const ratio = Math.min(logoSize / emblem.naturalWidth, logoSize / emblem.naturalHeight);
            const lw = emblem.naturalWidth * ratio, lh = emblem.naturalHeight * ratio;
            ctx.drawImage(emblem, -lw / 2, -lh / 2, lw, lh);
          }
          ctx.restore();
          const copyOpacity = motionEnabled ? highlight || outro ? smoothStep(localTime / 0.4) : smoothStep((timelinePlan.introSec - elapsedSec) / 0.4) : 1;
          ctx.globalAlpha *= copyOpacity;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const heading = highlight ? customTitle : outro ? 'Sampai jumpa di AVERSA 44' : 'AVERSA 44';
          const fit = fitCanvasLines(ctx, heading, w - safePad * 3, 800, '"Playfair Display", Georgia, serif', u * (highlight ? 0.068 : 0.056));
          ctx.font = `800 ${fit.size}px "Playfair Display", Georgia, serif`;
          ctx.fillStyle = '#FFF5D6';
          const centerY = (h - creditsHeight) * (highlight ? 0.51 : 0.64);
          fit.lines.forEach((line, index) => {
            const y = centerY + (index - (fit.lines.length - 1) / 2) * fit.size * 1.2;
            if (motionEnabled) drawStaggeredLine(ctx, line, w / 2, y, w - safePad * 3, Math.max(0, localTime - 0.16 - index * 0.12));
            else ctx.fillText(line, w / 2, y, w - safePad * 3);
          });
          const detail = highlight ? customSubtitle : outro ? customFooterNote : 'SMA Negeri 1 Gedeg • 1982 - 2026';
          const detailFit = fitCanvasLines(ctx, detail, w - safePad * 3, 600, '"Plus Jakarta Sans", sans-serif', u * 0.034);
          ctx.font = `600 ${detailFit.size}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillStyle = '#A0D9CA';
          const detailY = centerY + fit.lines.length * fit.size * 0.6 + u * 0.05;
          detailFit.lines.forEach((line, index) => ctx.fillText(line, w / 2, detailY + index * detailFit.size * 1.4, w - safePad * 3));
          ctx.restore();
          drawCredits();
        }
      }
      if (motionEnabled) {
        const beats = [timelinePlan.introSec, timelinePlan.mainTransitionSec, ...(includeOutro ? [timelinePlan.outroStartSec] : [])];
        beats.forEach((beat, index) => {
          const progress = (elapsedSec - beat) / CONFECTIONERY_TRANSITION_SEC + 0.5;
          if (progress > 0 && progress < 1) {
            const wrapper = index === 1;
            const ornament = ensureImage(`/assets/brandkit/${wrapper ? 'item-golden-ticket-badge.svg' : 'item-golden-chocolate-bar.svg'}`);
            drawConfectioneryTransition(ctx, w, h, progress, wrapper ? 'golden_wrapper' : 'chocolate_bubbles', ornament);
          }
        });
      }

    },
    [
      aspectRatio,
      backdrop,
      colorFilter,
      customBadge,
      customFooterNote,
      customSubtitle,
      customTitle,
      ensureImage,
      includeOutro,
      includeSponsors,
      mediaPartner,
      mediaData.mediaSponsors,
      mediaData.merchProducts,
      mediaMode,
      meta.guestStar1Name,
      meta.guestStar2Name,
      meta.guestStarVenue,
      meta.peakDateIso,
      photos,
      posterLayout,
      promoTarget,
      showCurtain,
      showSwoosh,
      template,
      timelinePlan,
    ]
  );

  // Re-render live preview canvas whenever state or assets change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || previewPlaying || exportingVideo) return;
    const { w, h } = RATIO_DIMS[aspectRatio];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawStudioFrame(ctx, w, h, 2.0, false);
  }, [aspectRatio, drawStudioFrame, assetTick, previewPlaying, exportingVideo]);

  useEffect(() => {
    const video = videoElRef.current;
    if (mediaMode === 'video' && videoClip && video && !animationBusyRef.current && video.readyState >= 1) {
      video.currentTime = videoClip.coverTime ?? videoClip.trimStart;
    }
  }, [mediaMode, videoClip?.trimStart, videoClip?.coverTime, previewPlaying, exportingVideo]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_STUDIO_PHOTOS - photos.length);
    if (files.length === 0) return;
    const next: StudioPhotoItem[] = [];
    setMediaStatus('Menyiapkan foto di perangkat...');
    try {
    for (const f of files) {
      const norm = await normalizeImageInBrowser(f, 1600);
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dataUrl: norm.dataUrl,
        width: norm.width,
        height: norm.height,
        framing: { zoom: 1, panX: 0, panY: RATIO_DIMS[aspectRatio].w > RATIO_DIMS[aspectRatio].h && norm.width < norm.height ? Math.min(0.22, computeMaxPanFractions(norm.width, norm.height, RATIO_DIMS[aspectRatio].w, RATIO_DIMS[aspectRatio].h, 1).maxPanY) : 0 },
      });
    }
    setPhotos((prev) => [...prev, ...next].slice(0, MAX_STUDIO_PHOTOS));
    setMediaMode('photo');
    } catch (err: any) { onNotify(err?.message || 'Gagal membaca foto.', true); }
    finally { setMediaStatus(''); e.target.value = ''; }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setMediaStatus('Memeriksa video di perangkat...');
      const prep = await prepareVideoInBrowser(file, setMediaStatus);
      if (videoClip?.objectUrl) URL.revokeObjectURL(videoClip.objectUrl);
      setVideoClip({
        objectUrl: prep.objectUrl,
        durationSec: prep.durationSec,
        width: prep.width,
        height: prep.height,
        trimStart: 0,
        trimEnd: prep.durationSec,
        mutedOriginal: false,
        framing: { zoom: 1, panX: 0, panY: 0 },
        posterDataUrl: '',
      });
      setMediaMode('video');
    } catch (err: any) {
      onNotify(err?.message || 'Gagal memuat file video.', true);
    }
    setMediaStatus('');
    e.target.value = '';
  };

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = RATIO_DIMS[aspectRatio];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawStudioFrame(ctx, w, h, 2.0, false);
    const link = document.createElement('a');
    link.download = `aversa44-${template}-${aspectRatio.replace(':', 'x')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    onNotify(`Poster PNG ${w}x${h} berhasil diunduh!`);
  };

  const runAnimation = async (record: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || exportingVideo || previewPlaying) return;
    const { w, h } = RATIO_DIMS[aspectRatio];
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { onNotify('Kanvas tidak tersedia di browser ini.', true); return; }
    animationBusyRef.current = true;
    if (record) {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = '';
      setResultUrl('');
      setExportingVideo(true); setRenderProgress(0);
    }
    else setPreviewPlaying(true);
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let raf = 0;
    let cancelled = false;
    let videoGainNode: GainNode | null = null;
    let capturedVideoStream: MediaStream | null = null;
    let capturedSourceNode: MediaStreamAudioSourceNode | null = null;
    let keepAliveOsc: OscillatorNode | null = null;
    let keepAliveGain: GainNode | null = null;
    try {
      const totalSec = timelinePlan.totalDurationSec;
      const needAudio = record || includeSfx || (mediaMode === 'video' && videoClip && !videoClip.mutedOriginal);

      if (needAudio) {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AudioCtxClass();
        }
        audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') {
          // Call resume synchronously before any await so iOS Safari unlocks Web Audio on user tap
          const resumePromise = audioCtx.resume();
          await resumePromise;
        }
      }

      const destination = record && audioCtx ? audioCtx.createMediaStreamDestination() : null;
      if (record && destination && audioCtx) {
        // Keep a silent 48kHz PCM stream active so MediaRecorder always emits valid audio frames
        keepAliveOsc = audioCtx.createOscillator();
        keepAliveGain = audioCtx.createGain();
        keepAliveGain.gain.value = 0;
        keepAliveOsc.connect(keepAliveGain);
        keepAliveGain.connect(destination);
        keepAliveOsc.start();
      }

      if (includeSfx && audioCtx) {
        const targetAudio = destination ? destination : audioCtx.destination;
        const slideTimes = photos.length > 1
          ? Array.from({ length: photos.length - 1 }, (_, i) => timelinePlan.mainStartSec + timelinePlan.mainHoldSec * (i + 1) / photos.length - 0.4)
          : [];
        scheduleStudioSfx(
          audioCtx,
          targetAudio,
          [timelinePlan.introSec, timelinePlan.mainTransitionSec, ...(includeOutro ? [timelinePlan.outroStartSec] : [])].map(time => time - CONFECTIONERY_TRANSITION_SEC / 2),
          CONFECTIONERY_TRANSITION_SEC
        );
        scheduleStudioSfx(audioCtx, targetAudio, slideTimes);
      }

      if (mediaMode === 'video' && videoElRef.current && videoClip) {
        const videoEl = videoElRef.current;
        // Unlock <video> playback synchronously within user gesture so delayed play() at mainStartSec never blocks on mobile
        videoEl.muted = true;
        try {
          await videoEl.play();
        } catch {}
        videoEl.pause();
        videoEl.currentTime = videoClip.trimStart;
        videoEl.volume = 1.0;

        const existingSourceNode: MediaElementAudioSourceNode | undefined = (videoEl as any).__audioSourceNode;
        if (record && destination && audioCtx) {
          if (!videoClip.mutedOriginal) {
            const captureFn = (videoEl as any).captureStream || (videoEl as any).mozCaptureStream;
            if (typeof captureFn === 'function' && !existingSourceNode) {
              try {
                videoEl.muted = false;
                capturedVideoStream = captureFn.call(videoEl);
                if (capturedVideoStream && capturedVideoStream.getAudioTracks().length > 0) {
                  capturedSourceNode = audioCtx.createMediaStreamSource(capturedVideoStream);
                  videoGainNode = audioCtx.createGain();
                  videoGainNode.gain.value = 1.0;
                  capturedSourceNode.connect(videoGainNode);
                  videoGainNode.connect(destination);
                }
              } catch (err) {
                console.warn('captureStream audio notice:', err);
              }
            }
            if (!capturedSourceNode) {
              try {
                videoEl.muted = false;
                let sourceNode = existingSourceNode;
                if (!sourceNode) {
                  sourceNode = audioCtx.createMediaElementSource(videoEl);
                  (videoEl as any).__audioSourceNode = sourceNode;
                }
                videoGainNode = audioCtx.createGain();
                videoGainNode.gain.value = 1.0;
                sourceNode.connect(videoGainNode);
                videoGainNode.connect(destination);
              } catch (err) {
                console.warn('Audio node connect notice:', err);
              }
            }
          } else {
            videoEl.muted = true;
          }
        } else {
          // Preview mode: prefer native <video> audio playback on mobile unless already bound to Web Audio
          if (existingSourceNode && audioCtx) {
            videoEl.muted = false;
            videoGainNode = audioCtx.createGain();
            videoGainNode.gain.value = videoClip.mutedOriginal ? 0.0 : 1.0;
            existingSourceNode.connect(videoGainNode);
            videoGainNode.connect(audioCtx.destination);
          } else {
            videoEl.muted = Boolean(videoClip.mutedOriginal);
          }
        }
      }

      if (record) {
        stream = canvas.captureStream(30);
        if (destination) {
          destination.stream.getAudioTracks().forEach((track) => {
            stream!.addTrack(track);
          });
        }
      }
      let mimeType = '';
      const chunks: Blob[] = [];
      let done: Promise<void> | null = null;
      if (stream) {
        mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
        if (!mimeType) throw new Error('Browser ini tidak mendukung perekaman video.');
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        done = new Promise((resolve, reject) => { recorder!.onstop = () => resolve(); recorder!.onerror = () => reject(new Error('Perekaman video gagal.')); });
      }
      drawStudioFrame(ctx, w, h, 0, true);
      recorder?.start(200);
      let sourceStarted = false;
      const started = performance.now();
      await new Promise<void>((resolve) => {
        previewStopRef.current = () => { cancelled = true; cancelAnimationFrame(raf); resolve(); };
        const step = (now: number) => {
          const elapsed = Math.min(totalSec, (now - started) / 1000);
          if (mediaMode === 'video' && videoClip && videoElRef.current) {
            const v = videoElRef.current;
            if (!sourceStarted && elapsed >= timelinePlan.mainStartSec) {
              sourceStarted = true;
              if (Math.abs(v.currentTime - videoClip.trimStart) > 0.25) {
                v.currentTime = videoClip.trimStart;
              }
              void v.play().catch(() => {
                v.muted = true;
                void v.play().catch(() => onNotify('Video tidak dapat diputar. Coba pratinjau kembali.', true));
              });
            } else if (
              sourceStarted &&
              v.paused &&
              !v.ended &&
              elapsed < timelinePlan.mainStartSec + timelinePlan.mainHoldSec - 0.15 &&
              v.currentTime < videoClip.trimEnd - 0.15
            ) {
              void v.play().catch(() => {});
            }
            if (v.currentTime >= videoClip.trimEnd || elapsed >= timelinePlan.mainStartSec + timelinePlan.mainHoldSec) {
              v.pause();
            }
          }
          drawStudioFrame(ctx, w, h, elapsed, true);
          if (record) setRenderProgress(Math.round(elapsed / totalSec * 100));
          if (elapsed >= totalSec) resolve(); else raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
      previewStopRef.current = null;
      if (recorder && done) {
        recorder.stop(); await done;
        if (!cancelled) {
          let blob = new Blob(chunks, { type: mimeType });
          // Always transcode MediaRecorder output (including Chrome/Safari fMP4) to standard CFR +faststart MP4 for social media
          blob = await convertToMp4InBrowser(blob, setMediaStatus);
          blob = await ensureMp4Duration(blob, totalSec, setMediaStatus);
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          const url = URL.createObjectURL(blob); resultUrlRef.current = url; setResultUrl(url);
          onNotify('Video MP4 siap diperiksa dan diunduh.');
        }
      }
    } catch (err: any) { onNotify(err?.message || 'Gagal memproses video.', true); }
    finally {
      animationBusyRef.current = false;
      previewStopRef.current = null;
      if (keepAliveOsc) {
        try { keepAliveOsc.stop(); keepAliveOsc.disconnect(); } catch {}
      }
      if (keepAliveGain) {
        try { keepAliveGain.disconnect(); } catch {}
      }
      if (videoGainNode) {
        try { videoGainNode.disconnect(); } catch {}
      }
      if (capturedSourceNode) {
        try { capturedSourceNode.disconnect(); } catch {}
      }
      capturedVideoStream?.getTracks().forEach((track) => track.stop());
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current.muted = true;
      }
      stream?.getTracks().forEach((track) => track.stop());
      setExportingVideo(false); setPreviewPlaying(false); setRenderProgress(0); setMediaStatus('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-[#F5C538]/35 bg-[#250428] p-4 sm:p-6">
        <AuroraBackground paused={previewPlaying || exportingVideo} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-theatrical text-2xl sm:text-3xl font-extrabold text-[#FFF5D6]">
              <SplitText text="AVERSA 44 Media Studio" delayMs={35} />
            </h2>
            <p className="text-sm sm:text-base text-[#FFF5D6]/90 mt-1.5">
              Buat konten Post, Story, dan Reels berkarakter panggung AVERSA.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={exportingVideo || previewPlaying || !!mediaStatus}
              onClick={handleDownloadPng}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#A0D9CA] text-[#1A021D] text-sm font-extrabold hover:brightness-105 disabled:opacity-50"
            >
              Unduh Poster PNG ({RATIO_DIMS[aspectRatio].w}x{RATIO_DIMS[aspectRatio].h})
            </button>
            <StarBorder color="#F5C538" speed="5s">
              <button
                type="button"
                disabled={exportingVideo || previewPlaying || !!mediaStatus}
                onClick={() => void runAnimation(true)}
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E09D17] to-[#F5C538] text-[#310603] text-sm font-extrabold hover:brightness-105 disabled:opacity-50"
              >
                {exportingVideo ? `Merender Video (${renderProgress}%)...` : `Ekspor Video Reels (${timelinePlan.totalDurationSec}s)`}
              </button>
            </StarBorder>
          </div>
        </div>
      </div>

      <AnimatedContent distance={16} duration={0.55}>
        <p className="rounded-xl border border-[#F5C538]/30 bg-[#26042A] px-4 py-3 text-sm sm:text-base leading-relaxed text-[#FFF5D6]">
          Urutan video: Logo AVERSA (1,8 dtk) → Highlight acara (2,6 dtk) → Foto/video ({timelinePlan.mainHoldSec} dtk){includeOutro ? ' → Penutup (2,8 dtk)' : ''}. Setiap transisi berdurasi 2,2 detik, di luar durasi isi. Poster PNG tetap satu gambar.
        </p>
      </AnimatedContent>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Column */}
        <AnimatedContent distance={22} duration={0.6} delay={0.08} className="order-2 lg:order-1 lg:col-span-7 space-y-5">
          {/* 1. Format & Template */}
          <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-4 sm:p-5 space-y-4">
            <h3 className="text-base font-extrabold text-[#FDF39D]">1. Rasio Konten &amp; Bingkai AVERSA</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(RATIO_DIMS) as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    const { w, h } = RATIO_DIMS[r];
                    if (w > h) setPhotos((items) => items.map((photo) => {
                      if (photo.width >= photo.height || photo.framing.zoom !== 1 || photo.framing.panX !== 0 || photo.framing.panY !== 0) return photo;
                      const { maxPanY } = computeMaxPanFractions(photo.width, photo.height, w, h, 1);
                      return { ...photo, framing: { ...photo.framing, panY: Math.min(0.22, maxPanY) } };
                    }));
                    setAspectRatio(r);
                  }}
                  className={`min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                    aspectRatio === r
                      ? 'bg-[#310603] border-[#F5C538] text-[#FDF39D]'
                      : 'bg-[#1A021D] border-[#F5C538]/25 text-[#FFF5D6]/85'
                  }`}
                >
                  <div className="text-xs font-extrabold">{r}</div>
                  <div className="text-[10px] opacity-80">{RATIO_DIMS[r].label}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'guest_star', label: 'Guest Star Spotlight' },
                { id: 'countdown', label: 'Countdown & Pengumuman' },
                { id: 'schedule', label: 'Jadwal Rangkaian Acara' },
                { id: 'promo_store', label: 'Promo Tiket & Merch' },
                { id: 'live_recap', label: 'Momen Live / Recap' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplateDefaults(t.id as AversaTemplate)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold text-left transition-colors ${
                    template === t.id
                      ? 'bg-[#F5C538] border-[#F5C538] text-[#310603]'
                      : 'bg-[#1A021D] border-[#F5C538]/25 text-[#FFF5D6]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {template === 'schedule' && mediaData.timeline.length > 0 && (
              <div>
                <label htmlFor="ms-tl" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Ambil Data Agenda Otomatis
                </label>
                <select
                  id="ms-tl"
                  value={selectedTimelineId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedTimelineId(id);
                    const ev = mediaData.timeline.find((x) => x.id === id);
                    if (ev) {
                      setCustomBadge(`${ev.date_label} • ${ev.category}`);
                      setCustomTitle(ev.title);
                      setCustomSubtitle(`${ev.subtitle} • ${ev.venue}`);
                    }
                  }}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  {mediaData.timeline.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.date_label} - {ev.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {template === 'promo_store' && (
              <div>
                <label htmlFor="ms-promo" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Pilih Tiket / Merchandise Resmi
                </label>
                <select
                  id="ms-promo"
                  value={promoTarget}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPromoTarget(val);
                    if (val.startsWith('TKT:')) {
                      const t = mediaData.ticketTiers.find((x) => x.id === Number(val.slice(4)));
                      if (t) {
                        setCustomTitle(t.name);
                        setCustomSubtitle(`Mulai ${formatRupiah(t.price)} • ${t.description.slice(0, 72)}`);
                      }
                    } else if (val.startsWith('MRC:')) {
                      const m = mediaData.merchProducts.find((x) => x.id === Number(val.slice(4)));
                      if (m) {
                        setCustomTitle(m.name);
                        setCustomSubtitle(`${formatRupiah(m.price)} • ${m.short_spec}`);
                      }
                    }
                  }}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  {mediaData.ticketTiers.map((t) => (
                    <option key={`TKT:${t.id}`} value={`TKT:${t.id}`}>
                      [Tiket] {t.name} ({formatRupiah(t.price)})
                    </option>
                  ))}
                  {mediaData.merchProducts.map((m) => (
                    <option key={`MRC:${m.id}`} value={`MRC:${m.id}`}>
                      [Merch] {m.name} ({formatRupiah(m.price)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 2. Photo Collage / Video Upload + Framing */}
          <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#FDF39D]">2. Foto Kolase / Video Momen (Opsional)</h3>
              <div className="flex gap-2">
                <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1A021D] border border-[#A0D9CA]/50 text-xs font-bold text-[#A0D9CA] flex items-center cursor-pointer hover:bg-[#310603]">
                  + Unggah Foto ({photos.length}/{MAX_STUDIO_PHOTOS})
                  <input
                    type="file"
                    accept={IMAGE_INPUT_ACCEPT}
                    multiple
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </label>
                <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1A021D] border border-[#F5B8CB]/50 text-xs font-bold text-[#F5B8CB] flex items-center cursor-pointer hover:bg-[#310603]">
                  + Unggah Video
                  <input type="file" accept={VIDEO_INPUT_ACCEPT} onChange={handleVideoUpload} className="sr-only" />
                </label>
              </div>
            </div>

            {mediaMode === 'photo' && photos.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPosterLayout('collage')}
                      className={`min-h-[44px] px-3 rounded-lg text-xs font-bold ${
                        posterLayout === 'collage' ? 'bg-[#F5C538] text-[#310603]' : 'bg-[#1A021D] text-[#FFF5D6]'
                      }`}
                    >
                      Kolase Multi-Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosterLayout('single')}
                      className={`min-h-[44px] px-3 rounded-lg text-xs font-bold ${
                        posterLayout === 'single' ? 'bg-[#F5C538] text-[#310603]' : 'bg-[#1A021D] text-[#FFF5D6]'
                      }`}
                    >
                      Foto Utama Tunggal
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhotos([])}
                    className="min-h-[44px] px-3 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
                  >
                    Kosongkan Foto
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {photos.map((ph, idx) => {
                    const { w, h } = RATIO_DIMS[aspectRatio];
                    const slots = getCollageSlotRects(photos.length, posterLayout, w, h, 0, 0, Math.min(w, h), w > h);
                    const slot = slots[idx] || { rw: w, rh: h };
                    return (
                    <MediaCropBox
                      key={ph.id}
                      src={ph.dataUrl}
                      srcWidth={ph.width}
                      srcHeight={ph.height}
                      frameWidth={slot.rw}
                      frameHeight={slot.rh}
                      framing={ph.framing}
                      label={`Foto #${idx + 1}`}
                      onRemove={() => setPhotos((prev) => prev.filter((x) => x.id !== ph.id))}
                      onChange={(next) =>
                        setPhotos((prev) => prev.map((x) => (x.id === ph.id ? { ...x, framing: next } : x)))
                      }
                    />
                  ); })}
                </div>
              </div>
            )}

            {mediaMode === 'video' && videoClip && (
              <div className="space-y-3">
                <video
                  ref={videoElRef}
                  src={videoClip.objectUrl}
                  preload="auto"
                  playsInline
                  muted
                  onLoadedData={async (event) => {
                    const video = event.currentTarget;
                    if (!animationBusyRef.current) {
                      try {
                        await video.play();
                        await new Promise<void>((resolve) => {
                          if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => resolve());
                          else setTimeout(resolve, 120);
                        });
                        if (videoElRef.current === video && !animationBusyRef.current) {
                          video.pause();
                          video.currentTime = videoClip.coverTime ?? videoClip.trimStart;
                        }
                      } catch {
                        try {
                          video.currentTime = videoClip.coverTime ?? videoClip.trimStart;
                        } catch {}
                      }
                    }
                    captureVideoPoster(video);
                    setAssetTick((tick) => tick + 1);
                  }}
                  onSeeked={(event) => {
                    if (animationBusyRef.current) return;
                    captureVideoPoster(event.currentTarget);
                    setAssetTick((tick) => tick + 1);
                  }}
                  className="fixed -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
                />

                {videoClip.posterDataUrl && (
                  <MediaCropBox
                    src={videoClip.posterDataUrl}
                    srcWidth={videoClip.width || 1920}
                    srcHeight={videoClip.height || 1080}
                    frameWidth={RATIO_DIMS[aspectRatio].w}
                    frameHeight={RATIO_DIMS[aspectRatio].h}
                    framing={videoClip.framing || { zoom: 1, panX: 0, panY: 0 }}
                    label="Video"
                    onChange={(nextFraming) =>
                      setVideoClip((prev) => (prev ? { ...prev, framing: nextFraming } : null))
                    }
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[#F5C538]/30 bg-[#18021B]">
                  <div>
                    <strong className="block text-sm text-[#FDF39D]">Audio Video Asli</strong>
                    <span className="text-xs text-[#FFF5D6]/80">
                      {!videoClip.mutedOriginal
                        ? 'Suara asli video aktif di pratinjau dan ekspor MP4'
                        : 'Video dibisukan'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVideoClip((prev) => (prev ? { ...prev, mutedOriginal: !prev.mutedOriginal } : null))}
                    className={`min-h-[44px] px-4 rounded-xl border text-xs font-bold transition-colors ${
                      !videoClip.mutedOriginal
                        ? 'border-[#A0D9CA] bg-[#A0D9CA]/15 text-[#A0D9CA]'
                        : 'border-[#F5B8CB]/40 bg-[#140117] text-[#F5B8CB]'
                    }`}
                  >
                    {!videoClip.mutedOriginal ? '🔊 Suara Aktif' : '🔇 Bisu'}
                  </button>
                </div>

                <VideoTrimmerControl clip={videoClip} onChange={setVideoClip} />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(videoClip.objectUrl);
                    setVideoClip(null);
                    setMediaMode('photo');
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-[#F5B8CB]/40 text-xs font-bold text-[#F5B8CB]"
                >
                  Hapus Video &amp; Kembali ke Foto/Canva
                </button>
              </div>
            )}
          </div>

          {/* 3. Aesthetic, Text, Sponsors & Audio BGM */}
          <div className="rounded-2xl border border-[#F5C538]/30 bg-[#26042A] p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-[#FDF39D]">3. Teks, Elemen Panggung &amp; Efek Suara</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ms-bg" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Latar Resmi Brand Kit
                </label>
                <select
                  id="ms-bg"
                  value={backdrop}
                  onChange={(e) => setBackdrop(e.target.value as BackdropTheme)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  {(Object.keys(BACKDROP_PATHS) as BackdropTheme[]).map((k) => (
                    <option key={k} value={k}>
                      {BACKDROP_PATHS[k].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ms-flt" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Filter Warna Foto
                </label>
                <select
                  id="ms-flt"
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value as ColorFilterPreset)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                >
                  {(Object.keys(FILTER_CSS) as ColorFilterPreset[]).map((k) => (
                    <option key={k} value={k}>
                      {FILTER_CSS[k].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ms-badge" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Badge Kategori (Cinzel)
                </label>
                <input
                  id="ms-badge"
                  type="text"
                  value={customBadge}
                  onChange={(e) => setCustomBadge(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>

              <div>
                <label htmlFor="ms-title" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Tajuk Utama Poster
                </label>
                <input
                  id="ms-title"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="ms-sub" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Subjudul / Lokasi / Harga
                </label>
                <input
                  id="ms-sub"
                  type="text"
                  value={customSubtitle}
                  onChange={(e) => setCustomSubtitle(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="ms-note" className="block text-sm font-bold text-[#F7D160] mb-1">
                  Catatan Kaki / CTA
                </label>
                <input
                  id="ms-note"
                  type="text"
                  value={customFooterNote}
                  onChange={(e) => setCustomFooterNote(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#1A021D] border border-[#F5C538]/35 text-xs text-[#FFF5D6]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#FDF39D]">
                <input
                  type="checkbox"
                  checked={showCurtain}
                  onChange={(e) => setShowCurtain(e.target.checked)}
                  className="w-4 h-4 accent-[#F5C538]"
                />
                Tirai Beludru Atas
              </label>
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#FDF39D]">
                <input
                  type="checkbox"
                  checked={showSwoosh}
                  onChange={(e) => setShowSwoosh(e.target.checked)}
                  className="w-4 h-4 accent-[#F5C538]"
                />
                Kilau Debu Emas
              </label>
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#A0D9CA]">
                <input
                  type="checkbox"
                  checked={includeSponsors}
                  onChange={(e) => setIncludeSponsors(e.target.checked)}
                  className="w-4 h-4 accent-[#A0D9CA]"
                />
                Sponsor Auto-Stamp
              </label>
              <label className="flex items-center gap-2 min-h-[44px] text-xs font-bold text-[#F5B8CB]">
                <input
                  type="checkbox"
                  checked={includeOutro}
                  onChange={(e) => setIncludeOutro(e.target.checked)}
                  className="w-4 h-4 accent-[#F5B8CB]"
                />
                Outro Endcard (Video Reels)
              </label>
            </div>

            <p className="text-sm text-[#FFF5D6]/80">Logo partner dan urutan sponsor dikelola di <a href="/office/logo-media" className="inline-flex min-h-[44px] items-center text-[#FDF39D] underline">Logo &amp; Mitra Media</a>.</p>

            <label className="flex items-center gap-3 min-h-[44px] text-sm font-bold text-[#FFF5D6]">
              <input type="checkbox" checked={includeSfx} onChange={(e) => setIncludeSfx(e.target.checked)} className="w-5 h-5 accent-[#F5C538]" />
              Efek suara transisi
            </label>
            <p className="text-sm text-[#FFF5D6]/80">Video tanpa musik latar. Tambahkan musik melalui Instagram setelah mengunggah.</p>
          </div>
        </AnimatedContent>

        {/* Right Live Preview Canvas Column */}
        <AnimatedContent distance={22} duration={0.6} delay={0.14} className="order-1 lg:order-2 lg:col-span-5 lg:sticky lg:top-20 space-y-3">
          <StarBorder color="#F5C538" speed="6s" className="w-full block">
            <div className="rounded-2xl border border-[#F5C538]/40 bg-[#140117] p-3 sm:p-4 shadow-2xl">
              <div className="flex items-center justify-between text-sm text-[#F7D160] mb-2.5">
                <ShinyText text={`Pratinjau ${aspectRatio}`} disabled={previewPlaying || exportingVideo || window.matchMedia("(prefers-reduced-motion: reduce)").matches} className="font-bold" />
                <span className="font-mono text-[#A0D9CA]">
                  {RATIO_DIMS[aspectRatio].w}x{RATIO_DIMS[aspectRatio].h}
                </span>
              </div>
              {mediaStatus && <p role="status" className="mb-3 text-sm text-[#FDF39D]">{mediaStatus}</p>}
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => previewPlaying ? previewStopRef.current?.() : void runAnimation(false)} disabled={exportingVideo || !!mediaStatus} className="min-h-[44px] px-4 rounded-lg border border-[#F5C538]/60 text-sm font-bold text-[#FDF39D] hover:bg-[#310603]">{previewPlaying ? 'Hentikan Pratinjau' : 'Putar Pratinjau Video'}</button>
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-[#FFF5D6]"><input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} className="h-5 w-5 accent-[#F5C538]" /> Panduan area aman</label>
              </div>
              <div className="flex justify-center bg-[#0D010F] rounded-xl p-2 border border-[#F5C538]/20">
                <div className="relative inline-block max-w-full leading-[0]">
                <canvas
                  ref={canvasRef}
                  className="block max-w-full max-h-[65dvh] w-auto h-auto rounded-lg shadow-lg"
                />
                {showSafeArea && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-dashed border-[#FDF39D]" style={{ left: '6%', right: '6%', top: aspectRatio === '9:16' ? '12%' : '6%', bottom: aspectRatio === '9:16' ? '12%' : '6%' }} />}
                </div>
              </div>
              {photos.length === 0 && !videoClip && !previewPlaying && !exportingVideo && <p className="mt-2.5 text-sm text-[#FFF5D6]/90">Unggah foto atau video untuk mengisi frame.</p>}
              {showSafeArea && <p className="mt-2 text-sm leading-relaxed text-[#FFF5D6]/90">Letakkan wajah dan teks penting di dalam garis. Panduan ini tidak ikut diekspor; area tampilan dapat berbeda antarplatform.</p>}
            </div>
          </StarBorder>
          {resultUrl && <div className="rounded-2xl border border-[#F5C538]/40 bg-[#250428] p-4 space-y-3"><h3 className="text-base font-bold text-[#FDF39D]">Hasil Video MP4</h3><video controls playsInline src={resultUrl} className="w-full max-h-[55dvh] rounded-lg" /><a href={resultUrl} download={`aversa44-${template}-${aspectRatio.replace(':', 'x')}.mp4`} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#F5C538] px-4 text-sm font-bold text-[#310603]">Unduh Video MP4</a></div>}
        </AnimatedContent>
      </div>
    </div>
  );
};
