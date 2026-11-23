import React, { useEffect, useState } from 'react';

interface SplitTextProps {
  text: string;
  className?: string;
  delayMs?: number;
  staggerMs?: number;
  reducedMotion?: boolean;
}

/**
 * ReactBits SplitText / BlurText: Word-by-word choreographed spring reveal on stage entry.
 */
export const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  delayMs = 80,
  staggerMs = 55,
  reducedMotion = false,
}) => {
  const [visible, setVisible] = useState(reducedMotion);
  const words = text.split(' ');

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, reducedMotion]);

  return (
    <span className={`inline-flex flex-wrap gap-x-[0.26em] ${className}`}>
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          className="inline-block transition-all duration-700 ease-out"
          style={{
            transitionDelay: reducedMotion ? '0ms' : `${idx * staggerMs}ms`,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 14px, 0)',
            filter: visible ? 'blur(0px)' : 'blur(4px)',
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
};
