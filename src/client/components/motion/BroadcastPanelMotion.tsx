import React, { useLayoutEffect, useRef } from 'react';
import { createTimeline, stagger } from 'animejs';
import type { ObsTransitionPreset } from '../../types.ts';

export type BroadcastPanelOrigin = 'bottom' | 'left' | 'top' | 'center';

interface BroadcastPanelMotionProps {
  children: React.ReactNode;
  preset: ObsTransitionPreset;
  origin?: BroadcastPanelOrigin;
  leaving?: boolean;
  pulseKey?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Orchestrates broadcast-grade enter, exit, and live-text-update sheen animations
 * for OBS overlay panels using Anime.js v4 timelines.
 */
export const BroadcastPanelMotion: React.FC<BroadcastPanelMotionProps> = ({
  children,
  preset,
  origin = 'bottom',
  leaving = false,
  pulseKey = '',
  disabled = false,
  className = '',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const prevPulseRef = useRef<string>(pulseKey);

  const isOff = disabled || preset === 'cut';

  // Enter & Exit choreography
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isOff || reduced) {
      node.style.opacity = '1';
      node.style.transform = 'none';
      node.style.filter = 'none';
      node.style.clipPath = 'none';
      return;
    }

    const beam = beamRef.current;
    const tl = createTimeline();

    if (leaving) {
      if (preset === 'broadcast_wipe') {
        tl.add(node, {
          clipPath: ['inset(0 0% 0 0% round 14px)', 'inset(0 0% 0 100% round 14px)'],
          opacity: [1, 0.2],
          duration: 420,
          ease: 'inQuart',
        }, 0);
        if (beam) {
          tl.add(beam, {
            opacity: [0, 0.95, 0],
            translateX: ['-10%', '115%'],
            duration: 420,
            ease: 'inOutQuad',
          }, 0);
        }
      } else if (preset === 'slide_edge') {
        tl.add(
          node,
          origin === 'left'
            ? { translateX: [0, -56], opacity: [1, 0], duration: 380, ease: 'inCubic' }
            : { translateY: origin === 'top' ? [0, -36] : [0, 48], opacity: [1, 0], duration: 380, ease: 'inCubic' },
          0,
        );
      } else if (preset === 'zoom_pop') {
        tl.add(node, {
          scale: [1, 0.94],
          opacity: [1, 0],
          filter: ['blur(0px)', 'blur(6px)'],
          duration: 360,
          ease: 'inQuad',
        }, 0);
      } else {
        // fade_smooth
        tl.add(node, {
          opacity: [1, 0],
          translateY: [0, -8],
          filter: ['blur(0px)', 'blur(4px)'],
          duration: 400,
          ease: 'inQuad',
        }, 0);
      }
      return () => {
        tl.revert();
      };
    }

    // Enter phase: prime detail elements immediately at 0ms so they never flash before stagger starts
    const details = Array.from(node.querySelectorAll<HTMLElement>('[data-motion-detail]'));
    for (const el of details) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
    }

    if (preset === 'broadcast_wipe') {
      tl.add(node, {
        opacity: [0, 1],
        clipPath: ['inset(0 100% 0 0% round 14px)', 'inset(0 0% 0 0% round 14px)'],
        duration: 620,
        ease: 'outExpo',
      }, 0);
      if (beam) {
        tl.add(beam, {
          opacity: [0, 0.9, 0],
          translateX: ['-20%', '120%'],
          duration: 620,
          ease: 'outExpo',
        }, 30);
      }
      if (details.length) {
        tl.add(details, {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 480,
          delay: stagger(65),
          ease: 'outCubic',
        }, 120);
      }
    } else if (preset === 'slide_edge') {
      tl.add(
        node,
        origin === 'left'
          ? { translateX: [-48, 0], opacity: [0, 1], duration: 580, ease: 'outCubic' }
          : { translateY: origin === 'top' ? [-30, 0] : [40, 0], opacity: [0, 1], duration: 580, ease: 'outCubic' },
        0,
      );
      if (details.length) {
        tl.add(details, {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 460,
          delay: stagger(60),
          ease: 'outCubic',
        }, 100);
      }
    } else if (preset === 'zoom_pop') {
      tl.add(node, {
        scale: [0.93, 1],
        opacity: [0, 1],
        filter: ['blur(6px)', 'blur(0px)'],
        duration: 540,
        ease: 'outCubic',
      }, 0);
      if (details.length) {
        tl.add(details, {
          opacity: [0, 1],
          translateY: [8, 0],
          duration: 440,
          delay: stagger(55),
          ease: 'outCubic',
        }, 90);
      }
    } else {
      // fade_smooth
      tl.add(node, {
        opacity: [0, 1],
        translateY: [8, 0],
        filter: ['blur(4px)', 'blur(0px)'],
        duration: 560,
        ease: 'outQuad',
      }, 0);
      if (details.length) {
        tl.add(details, {
          opacity: [0, 1],
          translateY: [8, 0],
          duration: 460,
          delay: stagger(55),
          ease: 'outQuad',
        }, 110);
      }
    }

    return () => {
      tl.revert();
    };
  }, [preset, origin, leaving, isOff]);

  // Live text update golden sheen (box stays mounted)
  useLayoutEffect(() => {
    if (prevPulseRef.current === pulseKey) return;
    prevPulseRef.current = pulseKey;
    const sheen = sheenRef.current;
    if (!sheen || isOff || leaving) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const tl = createTimeline();
    tl.add(sheen, {
      opacity: [0, 0.85, 0],
      translateX: ['-25%', '125%'],
      duration: 620,
      ease: 'outExpo',
    }, 0);
    return () => {
      tl.revert();
    };
  }, [pulseKey, isOff, leaving]);

  return (
    <div ref={rootRef} className={`obs-motion-shell relative ${className}`}>
      {children}
      <div ref={beamRef} aria-hidden="true" className="obs-wipe-beam" />
      <div ref={sheenRef} aria-hidden="true" className="obs-update-sheen" />
    </div>
  );
};
