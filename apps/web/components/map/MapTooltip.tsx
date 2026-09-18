'use client';

import { useTranslations } from 'next-intl';
import { useBoardStore, selectRoom } from '@/lib/store/boardStore';
import { roomIdentity } from '@/lib/vector-map';
import { useRoomName } from '@/lib/room-name';
import { useTimeStore } from '@/features/time/useNow';
import { formatTime } from '@/features/time/derive';

/** Hover card that follows the pointer inside the stage. */
export function MapTooltip({ code, x, y, stage }: { code: string; x: number; y: number; stage: { w: number; h: number } }) {
  const t = useTranslations('map');
  const tr = useTranslations('room');
  const tz = useTimeStore((s) => s.timezone);
  const state = useBoardStore(selectRoom(code));
  const id = roomIdentity(code);
  const name = useRoomName();
  if (!id) return null;
  const title = name(code);
  const left = Math.min(x + 14, stage.w - 270);
  const top = y + 16 > stage.h - 90 ? y - 80 : y + 16;
  let line: string;
  if (!id.schedulable) line = tr(`types.${id.type}`);
  else if (!state || state.phase === 'free') line = state?.freeUntil ? t('freeUntil', { time: formatTime(state.freeUntil, tz) }) : t('free');
  else if ((state.phase === 'live' || state.phase === 'ending') && state.current) line = `${state.current.courseCode} · ${state.current.courseTitle} · ${t('until', { time: formatTime(state.current.endAt, tz) })}`;
  else if (state.next) line = `${state.next.courseCode} · ${state.next.courseTitle} · ${t('startsAt', { time: formatTime(state.next.startAt, tz) })}`;
  else line = t(`phase.${state.phase}`);
  return (
    <div className="map-tooltip" style={{ left, top }} role="tooltip" data-testid="map-tooltip">
      <b>{id.schedulable ? code : id.mapLabel}</b> {title !== id.mapLabel && <span>· {title}</span>}
      <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>
        {line}
        {state?.conflict ? ` · ⚠ ${t('conflict')}` : ''}
      </div>
    </div>
  );
}
