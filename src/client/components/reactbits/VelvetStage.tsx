import React, { useEffect, useRef } from 'react';
import { drawCanvasVelvetStage } from './canvas-effects.ts';

/** Shared with Media Studio so the broadcast stage matches exported videos. */
export function VelvetStage({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = -Infinity;
    const start = performance.now();
    const paint = (now: number) => {
      drawCanvasVelvetStage(ctx, canvas.width, canvas.height, (now - start) / 1000, !reducedMotion);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1920 / Math.max(1, bounds.width), 1080 / Math.max(1, bounds.height));
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
      paint(performance.now());
    };
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) { paint(now); last = now; }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reducedMotion) frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reducedMotion]);
  return <canvas ref={ref} aria-hidden="true" className="obs-velvet-stage" />;
}
