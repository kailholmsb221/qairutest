'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Measures a container and tells how many rows of `rowHeight` fit — the board never scrolls,
 * it paginates. Re-measures on resize (ResizeObserver).
 */
export function computeRowsPerPage(containerHeight: number, rowHeight: number, min = 1): number {
  if (!Number.isFinite(containerHeight) || !Number.isFinite(rowHeight) || rowHeight <= 0) return min;
  return Math.max(min, Math.floor(containerHeight / rowHeight));
}

export function useAutoFitRows(ref: RefObject<HTMLElement | null>, rowHeight: number, min = 1): number {
  const [rows, setRows] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      const rh = rowHeight > 0 ? rowHeight : parseFloat(getComputedStyle(el).getPropertyValue('--row-h')) || 44;
      setRows(computeRowsPerPage(h, rh, min));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, rowHeight, min]);
  return rows;
}

/** Row height in px from the CSS variable --row-h (clamp()), measured on an element. */
export function useRowHeight(ref: RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(44);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const probe = document.createElement('div');
    probe.style.height = 'var(--row-h)';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    el.appendChild(probe);
    const measure = () => setH(probe.getBoundingClientRect().height || 44);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, [ref]);
  return h;
}
