'use client';

import { memo } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { SessionView } from '@campuslive/contracts';
import { useBoardStore, selectSession } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useNow, useTimeStore } from '@/features/time/useNow';
import { deriveProgress, formatTime } from '@/features/time/derive';
import { pillKind } from '@/features/board/selectors';
import { SplitFlap } from './SplitFlap';
import { StatusPill } from './StatusPill';

/**
 * One row of the airport board. Subscribes only to its own session (by id) and to the 1 Hz tick
 * when it shows a progress bar or a countdown, so a tick never re-renders the whole board.
 */
export const BoardRow = memo(function BoardRow({ sessionId, index }: { sessionId: string; index: number }) {
  const session = useBoardStore(selectSession(sessionId));
  if (!session) return null;
  return <Row session={session} index={index} />;
});

function Row({ session, index }: { session: SessionView; index: number }) {
  const t = useTranslations('board');
  const tr = useTranslations('room');
  const tz = useTimeStore((s) => s.timezone);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const selected = useUiStore((s) => s.selectedRoomCode === session.roomCode);
  const kind = pillKind(session.phase, session.status);
  const live = kind === 'live' || kind === 'ending';
  const cls = ['board-row', live ? 'is-live' : '', kind === 'ending' ? 'is-ending' : '', kind === 'cancelled' ? 'is-cancelled' : '', session.conflict ? 'is-conflict' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return (
    <motion.div
      role="row"
      layout="position"
      layoutId={session.sessionId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 8) * 0.02 }}
      className={cls}
      data-testid="board-row"
      data-session-id={session.sessionId}
      data-phase={session.phase}
      data-status={session.status}
      onClick={() => selectRoom(session.roomCode)}
      style={{ background: selected ? 'rgba(79, 209, 255, 0.07)' : undefined }}
    >
      <span role="cell" className="cell-time" aria-label={t('colTime')}>
        <SplitFlap value={`${formatTime(session.startAt, tz)}`} width={5} />
      </span>
      <span role="cell" className="cell-room" aria-label={t('colRoom')}>
        <SplitFlap value={session.roomCode} width={6} />
      </span>
      <span role="cell" className="cell-course" aria-label={t('colCourse')} title={`${session.courseCode} · ${session.courseTitle} · ${tr(`lesson.${session.lessonType}`)}`}>
        <b>{session.courseCode}</b>
        {session.courseTitle}
      </span>
      <span role="cell" className="cell-teacher" aria-label={t('colTeacher')} title={session.teacher.fullName}>
        {session.teacher.shortName}
      </span>
      <span role="cell" className="cell-groups" aria-label={t('colGroups')} title={session.groups.join(', ')}>
        {session.groups.join(', ')}
      </span>
      <span role="cell" className="cell-status" aria-label={t('colStatus')}>
        <LivePill session={session} />
      </span>
      {live && <Progress startAt={session.startAt} endAt={session.endAt} />}
    </motion.div>
  );
}

/** The pill needs `now` only for the ENDS n MIN countdown; other kinds are static. */
function LivePill({ session }: { session: SessionView }) {
  const kind = pillKind(session.phase, session.status);
  if (kind === 'ending') return <EndingPill session={session} />;
  return <StatusPill session={session} now={0} />;
}
function EndingPill({ session }: { session: SessionView }) {
  const now = useNow();
  return <StatusPill session={session} now={now} />;
}

function Progress({ startAt, endAt }: { startAt: string; endAt: string }) {
  const now = useNow();
  const p = deriveProgress(startAt, endAt, now);
  return (
    <span className="progress" aria-hidden>
      <i style={{ transform: `scaleX(${p.toFixed(3)})` }} />
    </span>
  );
}
