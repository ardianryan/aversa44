import React, { useRef, useState } from 'react';

interface MagnetProps {
  children: React.ReactNode;
  padding?: number;
  magnetStrength?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * ReactBits Magnet: Subtle magnetic cursor pull on primary CTA buttons (touch-safe).
 */
export const Magnet: React.FC<MagnetProps> = ({
  children,
  padding = 45,
  magnetStrength = 6,
  disabled = false,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'touch' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    if (Math.abs(dx) < rect.width / 2 + padding && Math.abs(dy) < rect.height / 2 + padding) {
      setActive(true);
      setPos({ x: dx / magnetStrength, y: dy / magnetStrength });
    } else {
      setActive(false);
      setPos({ x: 0, y: 0 });
    }
  };

  const onLeave = () => {
    setActive(false);
    setPos({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-block ${className}`}
    >
      <div
        style={{
          transform: disabled ? undefined : `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`,
          transition: active ? 'transform 0.12s ease-out' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
