'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import type { SessionView } from '@campuslive/contracts';
import { pillKind } from '@/features/board/selectors';
import { formatTime, minutesUntil } from '@/features/time/derive';
import { useTimeStore } from '@/features/time/useNow';
import { SplitFlap } from './SplitFlap';

/** LIVE · STARTS 09:00 · ENDS 5 MIN · CANCELLED · MOVED → 214 · DELAYED +15. Text + icon, never colour alone. */
export const StatusPill = memo(function StatusPill({ session, now, flap = true }: { session: SessionView; now: number; flap?: boolean }) {
  const t = useTranslations('pill');
  const tz = useTimeStore((s) => s.timezone);
  const kind = pillKind(session.phase, session.status);
  let text: string;
  let icon = '●';
  switch (kind) {
    case 'live':
      text = t('live');
      break;
    case 'ending':
      text = t('ending', { min: Math.max(1, minutesUntil(session.endAt, now)) });
      icon = '◔';
      break;
    case 'cancelled':
      text = t('cancelled');
      icon = '✕';
      break;
    case 'moved':
      text = t('moved', { room: session.roomCode });
      icon = '→';
      break;
    case 'delayed':
      text = t('delayed', { min: session.delayMinutes ?? 0 });
      icon = '⏱';
      break;
    case 'done':
      text = t('done');
      icon = '✓';
      break;
    case 'soon':
      text = t('soon', { time: formatTime(session.startAt, tz) });
      icon = '◷';
      break;
    default:
      text = t('upcoming', { time: formatTime(session.startAt, tz) });
      icon = '○';
  }
  return (
    <span className="pill" data-kind={kind} data-testid="status-pill" title={session.conflict ? t('conflict') : undefined}>
      {kind === 'live' ? <i className="dot" aria-hidden /> : <span aria-hidden>{icon}</span>}
      {flap ? <SplitFlap value={text} width={Math.min(14, text.length)} /> : <span>{text}</span>}
      {session.conflict && (
        <span aria-label={t('conflict')} style={{ color: 'var(--status-conflict)' }}>
          ⚠
        </span>
      )}
    </span>
  );
});
