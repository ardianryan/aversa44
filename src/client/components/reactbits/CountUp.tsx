import React, { useEffect, useState } from 'react';

interface CountUpProps {
  to: number;
  from?: number;
  durationMs?: number;
  className?: string;
  formatter?: (val: number) => string;
}

/**
 * ReactBits CountUp: Smooth eased numeric counter for real PostgreSQL quotas & metrics.
 */
export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  durationMs = 750,
  className = '',
  formatter = (v) => String(Math.round(v)),
}) => {
  const [val, setVal] = useState(from);

  useEffect(() => {
    const startVal = from;
    const diff = to - startVal;
    if (diff === 0) {
      setVal(to);
      return;
    }
    const startTime = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(startVal + diff * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, durationMs]);

  return <span className={`tabular-nums ${className}`}>{formatter(val)}</span>;
};
