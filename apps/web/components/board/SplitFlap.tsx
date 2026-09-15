'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useUiStore } from '@/lib/store/uiStore';

/**
 * Fixed-width character cells. On value change every changed cell plays a two-half rotateX flip
 * (2 × 90 ms) staggered by index × 25 ms. At most MAX_FLIPPING cells animate at once across the
 * whole page; beyond that cells fall back to a fade (the airport board rule from the spec).
 */
const MAX_FLIPPING = 40;
let flipping = 0;

export function reserveFlips(n: number): boolean {
  if (flipping + n > MAX_FLIPPING) return false;
  flipping += n;
  setTimeout(() => {
    flipping = Math.max(0, flipping - n);
  }, 400);
  return true;
}

/** test hook */
export function _resetFlipBudget() {
  flipping = 0;
}

interface Props {
  value: string;
  /** number of cells; longer values are cut, shorter ones padded on the right */
  width?: number;
  className?: string;
  align?: 'left' | 'right';
  testId?: string;
}

export const SplitFlap = memo(function SplitFlap({ value, width, className, align = 'left', testId }: Props) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const w = width ?? value.length;
  const padded = align === 'right' ? value.slice(0, w).padStart(w, ' ') : value.slice(0, w).padEnd(w, ' ');
  const chars = [...padded];
  const prev = useRef<string[]>(chars);
  const [anim, setAnim] = useState<{ gen: number; changed: boolean[]; mode: 'flip' | 'fade' }>({ gen: 0, changed: chars.map(() => false), mode: 'flip' });

  useEffect(() => {
    const changed = chars.map((c, i) => c !== prev.current[i]);
    prev.current = chars;
    const n = changed.filter(Boolean).length;
    if (n === 0) return;
    const mode = reduced ? 'fade' : reserveFlips(n) ? 'flip' : 'fade';
    setAnim((a) => ({ gen: a.gen + 1, changed, mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padded, reduced]);

  return (
    <span className={className ? `flap ${className}` : 'flap'} data-testid={testId} aria-label={value.trim()}>
      {chars.map((c, i) => {
        const cls = anim.changed[i] ? (anim.mode === 'flip' ? 'flap-cell is-flipping' : 'flap-cell is-fading') : 'flap-cell';
        return (
          <span key={`${i}-${anim.changed[i] ? anim.gen : 0}`} className={cls} style={anim.changed[i] && anim.mode === 'flip' ? { animationDelay: `${i * 25}ms` } : undefined} aria-hidden>
            {c === ' ' ? ' ' : c}
          </span>
        );
      })}
    </span>
  );
});
