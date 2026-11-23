import React, { useRef, useState } from 'react';

interface TiltedCardProps {
  children: React.ReactNode;
  className?: string;
  rotateAmplitude?: number;
  scaleOnHover?: number;
  disabled?: boolean;
}

/**
 * ReactBits TiltedCard: 3D perspective spring-tilt surface responding to pointer motion.
 */
export const TiltedCard: React.FC<TiltedCardProps> = ({
  children,
  className = '',
  rotateAmplitude = 8,
  scaleOnHover = 1.02,
  disabled = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'touch' || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotY = (px - 0.5) * 2 * rotateAmplitude;
    const rotX = (0.5 - py) * 2 * rotateAmplitude;
    setTransform(
      `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(${scaleOnHover},${scaleOnHover},1)`
    );
    setGlare({ x: px * 100, y: py * 100, opacity: 0.14 });
  };

  const handleLeave = () => {
    setTransform('perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
    setGlare((g) => ({ ...g, opacity: 0 }));
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`relative transition-transform duration-300 ease-out ${className}`}
      style={{ transform: disabled ? undefined : transform }}
    >
      {!disabled && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: glare.opacity,
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(253, 243, 157, 0.45), transparent 55%)`,
          }}
        />
      )}
      {children}
    </div>
  );
};
