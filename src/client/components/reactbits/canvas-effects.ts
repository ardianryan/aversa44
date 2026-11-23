import { eases } from 'animejs';
// Canvas adapters keep the local ReactBits frame effects visible in recorded MP4s.
export const easeOutStage = (value: number) => eases.outQuint(Math.max(0, Math.min(1, value)));
export const smoothStep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return eases.inOutSine(t);
};

export function drawCanvasStarBorder(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  time: number, motion: boolean,
) {
  ctx.save();
  const unit = Math.min(width, height);
  ctx.lineWidth = Math.max(1.5, unit * 0.0015);
  ctx.strokeStyle = '#F5C53866';
  ctx.beginPath(); ctx.roundRect(x, y, width, height, unit * 0.025); ctx.stroke();
  if (motion) {
    const phase = (time / 6) % 1;
    for (const offset of [0, 0.5]) {
      const p = (phase + offset) % 1;
      const distance = p * 2 * (width + height);
      const px = distance < width ? x + distance : distance < width + height ? x + width : distance < width * 2 + height ? x + width * 2 + height - distance : x;
      const py = distance < width ? y : distance < width + height ? y + distance - width : distance < width * 2 + height ? y + height : y + (width + height) * 2 - distance;
      const light = ctx.createRadialGradient(px, py, 0, px, py, unit * 0.14);
      light.addColorStop(0, '#FDF39D'); light.addColorStop(1, '#F5C53800');
      ctx.strokeStyle = light; ctx.lineWidth = unit * 0.004;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCanvasFloatingOrnament(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, size: number, time: number, index: number, motion: boolean, reveal: number,
) {
  ctx.save();
  const phase = time * 0.62 + index * 1.7;
  ctx.globalAlpha *= reveal * 0.85;
  ctx.translate(x, y + (motion ? Math.sin(phase) * size * 0.035 : 0));
  ctx.rotate((index % 2 ? 1 : -1) * 0.13 + (motion ? Math.sin(phase * 0.73) * 0.035 : 0));
  const scale = 0.94 + reveal * 0.06;
  ctx.scale(scale, scale);
  const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Deterministic stage lighting keeps preview and exported frames in sync. */
export function drawCanvasVelvetStage(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  time: number, motion: boolean,
) {
  const u = Math.min(width, height);
  const t = motion ? time : 0;
  ctx.save();
  const velvet = ctx.createRadialGradient(width * 0.5, height * 0.38, 0, width * 0.5, height * 0.38, Math.max(width, height) * 0.8);
  velvet.addColorStop(0, '#360538');
  velvet.addColorStop(0.65, '#1A021D');
  velvet.addColorStop(1, '#140117');
  ctx.fillStyle = velvet;
  ctx.fillRect(0, 0, width, height);

  // Broad fabric folds sit at the wings, leaving the editorial centre quiet.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side < 0 ? 0 : width, 0);
    ctx.scale(side < 0 ? 1 : -1, 1);
    for (let i = 0; i < 5; i++) {
      const x = width * (i * 0.042 - 0.06);
      const fold = ctx.createLinearGradient(x, 0, x + width * 0.07, 0);
      fold.addColorStop(0, '#14011700');
      fold.addColorStop(0.4, '#360538');
      fold.addColorStop(0.8, '#18021B');
      fold.addColorStop(1, '#14011700');
      ctx.fillStyle = fold;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + width * 0.16, height * 0.3, x - width * 0.08, height * 0.6, x + width * 0.02, height);
      ctx.lineTo(x + width * 0.09, height);
      ctx.bezierCurveTo(x + width * 0.01, height * 0.6, x + width * 0.23, height * 0.3, x + width * 0.07, 0);
      ctx.fill();
    }
    const lightX = width * (0.15 + Math.sin(t * 0.17 + side) * 0.035);
    const light = ctx.createRadialGradient(lightX, -height * 0.04, 0, lightX, -height * 0.04, height * 0.75);
    light.addColorStop(0, '#FDF39D26');
    light.addColorStop(0.3, '#F5C5380D');
    light.addColorStop(1, '#F5C53800');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Foil trails curl around the frame rather than across faces or titles.
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = i === 0 ? '#E09D1759' : '#F5C53826';
    ctx.lineWidth = u * (i === 0 ? 0.0018 : 0.0008);
    ctx.beginPath();
    ctx.ellipse(width * 0.02, height * 0.9, width * (0.31 + i * 0.025), height * 0.28, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(width * 0.98, height * 0.08, width * (0.27 + i * 0.025), height * 0.19, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Fixed highlights catch the foil edges without drifting through the frame.
  for (const [index, angle] of [-0.7, 2.3].entries()) {
    const cx = width * (index === 0 ? 0.02 : 0.98);
    const cy = height * (index === 0 ? 0.9 : 0.08);
    const rx = width * (index === 0 ? 0.31 : 0.27);
    const ry = height * (index === 0 ? 0.28 : 0.19);
    const x = cx + rx * Math.cos(angle) * Math.cos(-0.4) - ry * Math.sin(angle) * Math.sin(-0.4);
    const y = cy + rx * Math.cos(angle) * Math.sin(-0.4) + ry * Math.sin(angle) * Math.cos(-0.4);
    const radius = u * 0.004;
    ctx.globalAlpha = motion ? 0.12 + Math.pow((Math.sin(t * 0.65 + index * Math.PI) + 1) / 2, 3) * 0.38 : 0.25;
    ctx.fillStyle = '#FDF39D';
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.quadraticCurveTo(x, y, x, y + radius);
    ctx.quadraticCurveTo(x, y, x - radius, y);
    ctx.quadraticCurveTo(x, y, x, y - radius);
    ctx.fill();
  }
  ctx.restore();
}
