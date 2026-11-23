import { useEffect, useState } from 'react';

export interface ParallaxState {
  scrollY: number;
  scrollProgress: number;
  pointerX: number; // -1 to 1
  pointerY: number; // -1 to 1
  reducedMotion: boolean;
}

/**
 * Hardware-friendly parallax tracker using requestAnimationFrame interpolation.
 * Automatically honors prefers-reduced-motion: reduce (R-39).
 */
export function useParallaxStage(paused: boolean): ParallaxState {
  const [state, setState] = useState<ParallaxState>({
    scrollY: 0,
    scrollProgress: 0,
    pointerX: 0,
    pointerY: 0,
    reducedMotion: false,
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePref = () => {
      setState((prev) => ({ ...prev, reducedMotion: mq.matches }));
    };
    updatePref();
    mq.addEventListener('change', updatePref);

    if (paused || mq.matches) {
      return () => mq.removeEventListener('change', updatePref);
    }

    let targetScrollY = window.scrollY;
    let currentScrollY = targetScrollY;
    let targetPX = 0;
    let targetPY = 0;
    let currentPX = 0;
    let currentPY = 0;
    let rafId = 0;

    const onScroll = () => {
      targetScrollY = window.scrollY;
    };

    const onPointerMove = (e: PointerEvent) => {
      targetPX = (e.clientX / window.innerWidth) * 2 - 1;
      targetPY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        targetPX = Math.max(-1, Math.min(1, e.gamma / 30));
        targetPY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      }
    };

    const tick = () => {
      currentScrollY += (targetScrollY - currentScrollY) * 0.1;
      currentPX += (targetPX - currentPX) * 0.08;
      currentPY += (targetPY - currentPY) * 0.08;

      const docHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, currentScrollY / docHeight));

      document.documentElement.style.setProperty('--parallax-y', `${currentScrollY.toFixed(1)}px`);
      document.documentElement.style.setProperty('--parallax-px', currentPX.toFixed(3));
      document.documentElement.style.setProperty('--parallax-py', currentPY.toFixed(3));

      setState((prev) => ({
        ...prev,
        scrollY: currentScrollY,
        scrollProgress: progress,
        pointerX: currentPX,
        pointerY: currentPY,
      }));

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      mq.removeEventListener('change', updatePref);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
    };
  }, [paused]);

  return state;
}
