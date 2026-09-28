/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated number that counts up/down to the target value.
 * Uses requestAnimationFrame with ease-out cubic.
 */
export default function AnimatedNumber({
  value,
  duration = 800,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const cur = from + (to - from) * eased;
      setDisplay(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString();

  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}
