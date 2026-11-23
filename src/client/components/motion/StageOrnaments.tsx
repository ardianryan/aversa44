import React, { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';

const ornaments = ['item-golden-ticket-badge.svg', 'item-golden-chocolate-bar.svg', 'item-golden-cane.svg', 'item-stardust-sparkle-stars.svg'];

export function StageOrnaments({ disabled }: { disabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (disabled || !root.current) return;
    const targets = Array.from(root.current.children);
    const entrance = createTimeline().add(targets, {
      opacity: [0, 1], scale: [0.88, 1], duration: 1400, delay: stagger(160), ease: 'outQuint',
    });
    const floats = targets.map((target, i) => animate(target, {
      translateY: [0, i % 2 ? -7 : 7, 0],
      rotate: [0, i % 2 ? 2 : -2, 0],
      duration: 7600 + i * 650, delay: i * 270, loop: true, ease: 'inOutSine',
    }));
    const visibility = () => {
      if (document.hidden) { entrance.pause(); floats.forEach(a => a.pause()); }
      else { entrance.resume(); floats.forEach(a => a.resume()); }
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      entrance.revert(); floats.forEach(a => a.revert());
    };
  }, [disabled]);
  return <div ref={root} aria-hidden="true" className="obs-stage-props obs-anime-props">
    {ornaments.map(name => <img key={name} src={`/assets/brandkit/${name}`} alt="" />)}
  </div>;
}
