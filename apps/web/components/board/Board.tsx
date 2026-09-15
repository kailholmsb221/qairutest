'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { filterSessions } from '@/features/board/selectors';
import { useTimeStore } from '@/features/time/useNow';
import { BoardSection } from './BoardSection';

/** NOW (sorted by end) and NEXT (sorted by start) — the server already sorted them. */
export function Board() {
  const t = useTranslations('board');
  const now = useBoardStore(useShallow((s) => s.snapshot.now));
  const next = useBoardStore(useShallow((s) => s.snapshot.next));
  const stats = useBoardStore((s) => s.snapshot.stats);
  const date = useBoardStore((s) => s.snapshot.date);
  const at = useBoardStore((s) => s.snapshot.at);
  const tz = useTimeStore((s) => s.timezone);
  const filters = useUiStore((s) => s.filters);
  const highlight = useUiStore((s) => s.highlight);
  const setHighlight = useUiStore((s) => s.setHighlight);

  const nowIds = useMemo(() => filterSessions(now, filters, highlight).map((s) => s.sessionId), [now, filters, highlight]);
  const nextIds = useMemo(() => filterSessions(next, filters, highlight).map((s) => s.sessionId), [next, filters, highlight]);

  // empty-state flavour: weekend / after hours / simply nothing
  const weekday = useMemo(() => {
    const d = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? 1 : d.getUTCDay();
  }, [date]);
  const hour = useMemo(() => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date(at))), [at, tz]);
  const weekend = weekday === 0 || weekday === 6;
  const afterHours = !weekend && stats.sessionsToday > 0 && stats.sessionsDone === stats.sessionsToday && hour >= 12;

  const emptyNow = highlight ? (
    <>
      <b>{t('filteredEmpty', { label: highlight.label })}</b>
      <button type="button" className="btn" onClick={() => setHighlight(null)}>
        {t('clearFilter')}
      </button>
    </>
  ) : weekend ? (
    <>
      <b>{t('weekend')}</b>
      <span>{t('weekendHint')}</span>
    </>
  ) : afterHours ? (
    <>
      <b>{t('afterHours')}</b>
      <span>{t('afterHoursHint')}</span>
    </>
  ) : (
    <>
      <b>{t('emptyNow')}</b>
      <span>{t('emptyNowHint')}</span>
    </>
  );
  const emptyNext = highlight ? <b>{t('filteredEmpty', { label: highlight.label })}</b> : weekend ? <b>{t('weekend')}</b> : afterHours ? <b>{t('afterHours')}</b> : <b>{t('emptyNext')}</b>;

  return (
    <>
      {highlight && (
        <div className="chip" style={{ alignSelf: 'flex-start' }} data-testid="board-filter">
          <span>{t('filter', { label: highlight.label })}</span>
          <button type="button" onClick={() => setHighlight(null)} aria-label={t('clearFilter')} style={{ color: 'var(--accent)' }}>
            ✕
          </button>
        </div>
      )}
      <BoardSection id="now" title={t('now')} count={t('nowCount', { n: nowIds.length })} sessionIds={nowIds} empty={emptyNow} />
      <BoardSection id="next" title={t('next')} count={t('nextWithin', { min: 90 })} sessionIds={nextIds} empty={emptyNext} />
    </>
  );
}
