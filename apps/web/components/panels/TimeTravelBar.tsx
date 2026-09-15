'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useTimeTravel } from '@/features/time-travel/useTimeTravel';
import { useNow, useTimeStore } from '@/features/time/useNow';
import { atLocalTime, formatClock, minutesOfDay } from '@/features/time/derive';

const DAY_START = 7 * 60; // 07:00
const DAY_END = 20 * 60; // 20:00
const SPAN = DAY_END - DAY_START;

/**
 * Collapsed to a 4 px line at the bottom of the stage; expands on hover into a day timeline with
 * slot ticks and an occupancy heat strip (from /timeline). Dragging sets the simulated time.
 */
export function TimeTravelBar() {
  const t = useTranslations('travel');
  const now = useNow();
  const tz = useTimeStore((s) => s.timezone);
  const date = useBoardStore((s) => s.snapshot.date);
  const roomsTotal = useBoardStore((s) => s.snapshot.stats.roomsTotal);
  const { mode, travelAt, loading, travelTo, goLive } = useTimeTravel();
  const kiosk = useUiStore((s) => s.kiosk);
  const scaleRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const { data: timeline } = useQuery({
    queryKey: ['timeline', date],
    queryFn: () => api.timeline({ date: date && date !== '1970-01-01' ? date : undefined }),
    staleTime: 5 * 60_000,
    enabled: !kiosk,
  });

  // occupancy heat: for each 10-minute bucket, the share of schedulable rooms with a session
  const heat = useMemo(() => {
    if (!timeline) return [] as { left: number; width: number; alpha: number }[];
    const total = Math.max(1, roomsTotal || 14);
    const buckets: number[] = new Array(SPAN / 10).fill(0);
    for (const s of timeline.sessions) {
      if (s.status === 'cancelled') continue;
      const a = minutesOfDay(Date.parse(s.startAt), tz);
      const b = minutesOfDay(Date.parse(s.endAt), tz);
      for (let m = a; m < b; m += 10) {
        const i = Math.floor((m - DAY_START) / 10);
        if (i >= 0 && i < buckets.length) buckets[i]++;
      }
    }
    return buckets.map((n, i) => ({ left: (i * 10 * 100) / SPAN, width: (10 * 100) / SPAN + 0.1, alpha: Math.min(1, n / total) })).filter((b) => b.alpha > 0);
  }, [timeline, tz, roomsTotal]);

  const shownAt = mode === 'travel' && travelAt ? Date.parse(travelAt) : now;
  const pct = ((minutesOfDay(shownAt, tz) - DAY_START) / SPAN) * 100;
  const nowPct = ((minutesOfDay(now, tz) - DAY_START) / SPAN) * 100;

  const pick = useCallback(
    (clientX: number) => {
      const el = scaleRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const minutes = Math.round((DAY_START + f * SPAN) / 5) * 5;
      const at = atLocalTime(now, tz, minutes);
      travelTo(new Date(at).toISOString());
    },
    [now, tz, travelTo],
  );

  const onDown = (e: React.PointerEvent) => {
    if (kiosk) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    pick(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging) pick(e.clientX);
  };
  const onUp = () => setDragging(false);
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 60 : 10;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = minutesOfDay(shownAt, tz);
      const next = Math.min(DAY_END, Math.max(DAY_START, cur + (e.key === 'ArrowRight' ? step : -step)));
      travelTo(new Date(atLocalTime(now, tz, next)).toISOString());
    } else if (e.key === 'Home' || e.key === 'Escape') {
      goLive();
    }
  };

  if (kiosk) return null;
  const ticks = timeline?.slots?.length ? timeline.slots.map((s) => ({ m: minutesOfDay(Date.parse(s.startsAt), tz), label: `${String(Math.floor(minutesOfDay(Date.parse(s.startsAt), tz) / 60)).padStart(2, '0')}` })) : Array.from({ length: 13 }, (_, i) => ({ m: DAY_START + i * 60, label: String(7 + i).padStart(2, '0') }));

  return (
    <div className={mode === 'travel' || dragging ? 'tt-bar is-open' : 'tt-bar'} data-testid="time-travel" data-mode={mode}>
      <div className="tt-line" aria-hidden>
        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="tt-panel">
        <div className="tt-head">
          <span>{t('title')}</span>
          <span className="mono" style={{ color: 'var(--text)' }} data-testid="time-travel-at">
            {formatClock(shownAt, tz).slice(0, 5)}
          </span>
          {mode === 'travel' && <span className="clock-sim">{t('simulated')}</span>}
          {loading && <span>{t('loading')}</span>}
          <span style={{ color: 'var(--text-faint)' }}>{t('hint')}</span>
          <button type="button" className={mode === 'travel' ? 'btn tt-live' : 'btn tt-live is-active'} onClick={goLive} data-testid="time-travel-live" style={{ height: 26, fontSize: 12 }}>
            {t('live')}
          </button>
        </div>
        <div ref={scaleRef} className="tt-scale" role="slider" tabIndex={0} aria-label={t('title')} aria-valuemin={DAY_START} aria-valuemax={DAY_END} aria-valuenow={minutesOfDay(shownAt, tz)} aria-valuetext={formatClock(shownAt, tz).slice(0, 5)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} data-testid="time-travel-scale">
          <div className="tt-heat" aria-hidden>
            {heat.map((h, i) => (
              <i key={i} style={{ left: `${h.left}%`, width: `${h.width}%`, opacity: 0.25 + h.alpha * 0.75 }} />
            ))}
          </div>
          <div className="tt-ticks" aria-hidden>
            {ticks.map((tk) => (
              <span key={tk.m} style={{ left: `${((tk.m - DAY_START) / SPAN) * 100}%` }}>
                {tk.label}
              </span>
            ))}
          </div>
          {nowPct >= 0 && nowPct <= 100 && <div className="tt-now" style={{ left: `${nowPct}%` }} aria-hidden />}
          <div className="tt-cursor" style={{ left: `${Math.min(100, Math.max(0, pct))}%` }} aria-hidden />
        </div>
      </div>
    </div>
  );
}
