import { STUDIO_TRANSITION_SEC } from '../../../shared/media-timeline.ts';
import { smoothStep } from '../reactbits/canvas-effects.ts';

export type ConfectioneryTransition = 'chocolate_bubbles' | 'golden_wrapper';
export const CONFECTIONERY_TRANSITION_SEC = STUDIO_TRANSITION_SEC;

/** Both masks cover the entire frame during the scene change at progress 0.5. */
export function drawConfectioneryTransition(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  progress: number, kind: ConfectioneryTransition, ornament: HTMLImageElement | null,
) {
  if (progress <= 0 || progress >= 1) return;
  const unit = Math.min(width, height);
  const cover = progress < 0.4 ? smoothStep(progress / 0.4)
    : progress > 0.6 ? 1 - smoothStep((progress - 0.6) / 0.4) : 1;
  ctx.save();
  if (kind === 'chocolate_bubbles') {
    const cell = unit * 0.32;
    const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
    const cw = width / columns, ch = height / rows;
    const radius = Math.hypot(cw, ch) * 0.8;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const seed = ((row * 7 + col * 13) % 9) / 9;
        const travel = (col / Math.max(1, columns - 1) + row / Math.max(1, rows - 1)) / 2;
        const delay = travel * 0.12 + seed * 0.035;
        const expansion = progress < 0.4 ? smoothStep((progress - delay) / (0.4 - delay))
          : progress > 0.6 ? 1 - smoothStep((progress - 0.6 - delay) / (0.4 - delay)) : 1;
        const size = radius * expansion;
        if (size < 0.1) continue;
        const drift = Math.sin(progress * Math.PI * 2 + seed * Math.PI) * (1 - expansion);
        const x = (col + 0.5 + Math.sin(row * 17 + col * 5) * 0.14 + drift * 0.18) * cw;
        const y = (row + 0.5 + Math.cos(row * 3 + col * 11) * 0.14 - (1 - expansion) * 0.3) * ch;
        const glaze = ctx.createRadialGradient(x - size * 0.35, y - size * 0.4, 0, x, y, size);
        glaze.addColorStop(0, '#7D1B05'); glaze.addColorStop(0.45, '#310603'); glaze.addColorStop(1, '#18021B');
        ctx.fillStyle = glaze;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#E09D1780'; ctx.lineWidth = unit * 0.002;
        ctx.beginPath(); ctx.arc(x, y, size * 0.86, Math.PI * 1.1, Math.PI * 1.48); ctx.stroke();
      }
    }
  } else {
    // An oversized foil sheet folds over the outgoing scene, then unwraps the next.
    const skew = width * 0.16;
    const edge = progress <= 0.5 ? -skew + (width + skew * 2) * cover : -skew + (width + skew * 2) * (1 - cover);
    ctx.beginPath();
    if (progress <= 0.5) {
      ctx.moveTo(-skew, 0); ctx.lineTo(edge + skew, 0); ctx.bezierCurveTo(edge - skew * 0.2, height * 0.3, edge + skew * 0.8, height * 0.65, edge, height); ctx.lineTo(-skew, height);
    } else {
      ctx.moveTo(edge + skew, 0); ctx.lineTo(width + skew, 0); ctx.lineTo(width + skew, height); ctx.lineTo(edge, height); ctx.bezierCurveTo(edge + skew * 0.8, height * 0.65, edge - skew * 0.2, height * 0.3, edge + skew, 0);
    }
    ctx.closePath(); ctx.clip();
    const foil = ctx.createLinearGradient(0, 0, width, height);
    foil.addColorStop(0, '#E09D17'); foil.addColorStop(0.36, '#F5C538'); foil.addColorStop(0.5, '#FDF39D'); foil.addColorStop(0.63, '#F7D160'); foil.addColorStop(1, '#E09D17');
    ctx.fillStyle = foil; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#31060333'; ctx.lineWidth = unit * 0.0015;
    for (let i = -2; i < 9; i++) {
      ctx.beginPath(); ctx.moveTo(i * width / 6 + skew, 0); ctx.lineTo(i * width / 6, height); ctx.stroke();
    }
  }
  if (ornament) {
    const reveal = smoothStep((cover - 0.6) / 0.4);
    const size = unit * 0.3;
    const fit = Math.min(size / ornament.naturalWidth, size / ornament.naturalHeight);
    ctx.globalAlpha = reveal;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.sin((progress - 0.5) * Math.PI) * 0.28);
    const propScale = 0.9 + Math.sin(progress * Math.PI) * 0.1;
    ctx.scale(propScale, propScale);
    ctx.drawImage(ornament, -ornament.naturalWidth * fit / 2, -ornament.naturalHeight * fit / 2, ornament.naturalWidth * fit, ornament.naturalHeight * fit);
  }
  ctx.restore();
}
