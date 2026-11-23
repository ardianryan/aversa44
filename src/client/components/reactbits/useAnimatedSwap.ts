import { useEffect, useRef, useState } from 'react';

/** Keep the outgoing value mounted until its exit motion has completed. */
export function useAnimatedSwap<T>(value: T, key: string, disabled: boolean) {
  const [shown, setShown] = useState({ value, key });
  const [leaving, setLeaving] = useState(false);
  const latest = useRef({ value, key });
  latest.current = { value, key };
  useEffect(() => {
    if (disabled || shown.value == null) {
      setShown(latest.current); setLeaving(false); return;
    }
    if (key === shown.key) { setLeaving(false); return; }
    setLeaving(true);
    const timer = window.setTimeout(() => { setShown(latest.current); setLeaving(false); }, 460);
    return () => window.clearTimeout(timer);
  }, [key, shown.key, disabled]);
  return { value: disabled || key === shown.key ? value : shown.value, leaving: !disabled && leaving, key: disabled ? key : shown.key };
}
