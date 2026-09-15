'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface Pager<T> {
  page: number;
  pages: number;
  items: T[];
  setPage: (p: number) => void;
}

/** Pure paging: which items are on page `page` given `perPage`. */
export function paginate<T>(items: T[], perPage: number, page: number): { items: T[]; pages: number; page: number } {
  const per = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * per, p * per + per), pages, page: p };
}

/**
 * Rotates pages every `intervalMs` when there are more items than fit; paused while `paused`
 * (the board is hovered). The current page is clamped when items shrink.
 */
export function usePager<T>(items: T[], perPage: number, intervalMs = 8000, paused = false): Pager<T> {
  const [page, setPage] = useState(0);
  const pagesRef = useRef(1);
  const { items: pageItems, pages, page: clamped } = useMemo(() => paginate(items, perPage, page), [items, perPage, page]);
  pagesRef.current = pages;

  useEffect(() => {
    if (clamped !== page) setPage(clamped);
  }, [clamped, page]);

  // the interval survives item changes (kiosk floor cycling) — it only restarts on pause/interval changes
  useEffect(() => {
    if (paused || intervalMs <= 0) return;
    const t = setInterval(() => {
      if (pagesRef.current > 1) setPage((p) => (p + 1) % pagesRef.current);
    }, intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs]);

  return { page: clamped, pages, items: pageItems, setPage };
}
