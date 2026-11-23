import React, { useLayoutEffect, useRef } from 'react';
import { createTimeline, stagger } from 'animejs';

/** Each scene owns its timeline so route changes cannot leave detached animations running. */
export function SceneMotion({ children, className = '', disabled = false, observe = false }: {
  children: React.ReactNode; className?: string; disabled?: boolean; observe?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timelines: ReturnType<typeof createTimeline>[] = [];
    let observer: IntersectionObserver | undefined;
    const stop = () => { observer?.disconnect(); timelines.forEach(t => t.revert()); timelines.length = 0; };
    const setup = () => {
      stop();
      if (disabled || preference.matches) return;
      const targets = observe ? Array.from(node.querySelectorAll('section h2, section h3')) : [node];
      const play = (target: Element) => {
        const timeline = createTimeline({ defaults: { ease: 'outQuint' } });
        const panel = target.classList.contains('obs-panel');
        timeline.add(target, {
          opacity: [0, 1], translateY: [panel ? 12 : observe ? 26 : 32, 0], duration: 1100,
          ...(panel ? { clipPath: ['inset(0 100% 0 0 round 16px)', 'inset(0 0% 0 0 round 16px)'] } : {}),
        }, 0);
        if (!observe) {
          const details = target.querySelectorAll('[data-motion-detail]');
          if (details.length) timeline.add(details, {
            opacity: [0, 1], translateY: [18, 0], duration: 900, delay: stagger(110),
          }, 180);
        }
        timelines.push(timeline);
      };
      if (observe) {
        observer = new IntersectionObserver(entries => entries.forEach(entry => {
          if (entry.isIntersecting) { play(entry.target); observer?.unobserve(entry.target); }
        }), { threshold: 0.2 });
        targets.forEach(target => observer!.observe(target));
      } else play(node);
    };
    setup();
    preference.addEventListener('change', setup);
    return () => { stop(); preference.removeEventListener('change', setup); };
  }, [disabled, observe]);
  return <div ref={root} className={className}>{children}</div>;
}
