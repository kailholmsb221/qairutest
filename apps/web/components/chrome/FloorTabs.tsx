'use client';

import { useTranslations } from 'next-intl';
import { FLOOR_NUMBERS } from '@/lib/vector-map';
import { useUiStore } from '@/lib/store/uiStore';
import { useBusyByFloor } from '@/lib/store/boardStore';

/** All · 1 · 2 — each tab shows a busy-count badge; the tab also filters the board by floor. */
export function FloorTabs() {
  const t = useTranslations('header');
  const focused = useUiStore((s) => s.focusedFloor);
  const setFocused = useUiStore((s) => s.setFocusedFloor);
  const setFilters = useUiStore((s) => s.setFilters);
  const busy = useBusyByFloor();
  const total = Object.values(busy).reduce((s, n) => s + n, 0);
  const pick = (n: number | null) => {
    setFocused(n);
    setFilters({ floors: n === null ? [] : [n] });
  };
  return (
    <div className="floor-tabs" role="tablist" aria-label="Floors" data-testid="floor-tabs">
      <button type="button" role="tab" aria-selected={focused === null} className="floor-tab" onClick={() => pick(null)} data-testid="floor-tab-all" aria-label={`${t('floorsAll')} · ${t('busyAll', { n: total })}`}>
        {t('floorsAll')}
        {total ? <span className="badge">{total}</span> : null}
      </button>
      {FLOOR_NUMBERS.map((n) => (
        <button key={n} type="button" role="tab" aria-selected={focused === n} className="floor-tab" onClick={() => pick(n)} data-testid={`floor-tab-${n}`} aria-label={`${t('floor', { n })} · ${t('busyOnFloor', { n: busy[n] ?? 0 })}`}>
          {t('floor', { n })}
          {busy[n] ? <span className="badge">{busy[n]}</span> : null}
        </button>
      ))}
    </div>
  );
}
