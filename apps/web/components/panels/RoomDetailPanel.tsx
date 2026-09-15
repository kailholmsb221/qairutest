'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import type { SessionView } from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useBoardStore, selectRoom } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { roomIdentity, vmRoomByCode } from '@/lib/vector-map';
import { useNow, useTimeStore } from '@/features/time/useNow';
import { deriveProgress, formatCountdown, formatTime } from '@/features/time/derive';
import { StatusPill } from '@/components/board/StatusPill';

/**
 * 420 px glass card sliding over the board column: room name, type, capacity, current session
 * with progress bar and teacher card, the next 3 sessions today, "show on map".
 */
export function RoomDetailPanel() {
  const code = useUiStore((s) => s.selectedRoomCode);
  const reduced = useUiStore((s) => s.reducedMotion);
  return (
    <AnimatePresence>
      {code && (
        <motion.aside
          key={code}
          className="room-panel glass"
          initial={{ x: reduced ? 0 : 440, opacity: reduced ? 0 : 1 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: reduced ? 0 : 440, opacity: reduced ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          data-testid="room-panel"
          aria-label={code}
        >
          <Content code={code} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Content({ code }: { code: string }) {
  const t = useTranslations('room');
  const tm = useTranslations('map');
  const tz = useTimeStore((s) => s.timezone);
  const now = useNow();
  const state = useBoardStore(selectRoom(code));
  const date = useBoardStore((s) => s.snapshot.date);
  const at = useBoardStore((s) => s.snapshot.at);
  const selectRoomCode = useUiStore((s) => s.selectRoom);
  const setFocused = useUiStore((s) => s.setFocusedFloor);
  const setFilters = useUiStore((s) => s.setFilters);
  const id = roomIdentity(code);
  const vm = vmRoomByCode(code);
  const { data: day } = useQuery({
    queryKey: ['room-day', code, date],
    queryFn: () => api.roomDay(code, date && date !== '1970-01-01' ? date : undefined),
    enabled: !!id?.schedulable,
    staleTime: 60_000,
  });
  if (!id) return null;

  const current = state?.current ?? null;
  const cutoff = Date.parse(at);
  const upcoming = (day?.sessions ?? []).filter((s) => Date.parse(s.startAt) > cutoff && s.sessionId !== current?.sessionId).slice(0, 3);
  const swatch = !id.schedulable ? (vm?.baseFill ?? 'var(--status-service)') : `var(--status-${state?.phase ?? 'free'})`;

  return (
    <>
      <header className="room-panel-head">
        <span className="room-swatch" style={{ background: swatch }} aria-hidden />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="room-code">{id.schedulable ? code : id.mapLabel}</div>
          <div style={{ color: 'var(--text-dim)' }}>{id.name}</div>
          {id.mapLabel !== id.name && id.mapLabel !== code && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>{t('onPlan', { label: id.mapLabel })}</div>}
        </div>
        <button type="button" className="btn icon" onClick={() => selectRoomCode(null)} aria-label={t('close')} data-testid="room-panel-close">
          ✕
        </button>
      </header>
      <div className="room-panel-body">
        <dl className="room-props">
          <dt>{t('type')}</dt>
          <dd>{t(`types.${id.type}`)}</dd>
          <dt>{t('floor')}</dt>
          <dd>{id.floor}</dd>
          {id.capacity != null && (
            <>
              <dt>{t('capacity')}</dt>
              <dd>{t('seats', { n: id.capacity })}</dd>
            </>
          )}
          {id.area != null && (
            <>
              <dt>{t('area')}</dt>
              <dd>{id.area.toFixed(1)} м²</dd>
            </>
          )}
        </dl>

        {!id.schedulable ? (
          <p style={{ color: 'var(--text-dim)', margin: 0 }}>{t('notSchedulable')}</p>
        ) : (
          <>
            <div className="section-title">{t('current')}</div>
            {current ? (
              <SessionCard s={current} now={now} tz={tz} />
            ) : (
              <div className="session-card" style={{ color: 'var(--text-dim)' }}>
                {state?.freeUntil ? tm('freeUntil', { time: formatTime(state.freeUntil, tz) }) : tm('free')}
                {state?.next && state.phase === 'soon' && (
                  <span style={{ color: 'var(--status-soon-text)' }}>
                    {state.next.courseCode} · {tm('startsIn', { countdown: formatCountdown(state.next.startAt, now) })}
                  </span>
                )}
              </div>
            )}
            <div className="section-title">{t('nextToday')}</div>
            {upcoming.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', margin: 0 }}>{t('noSessions')}</p>
            ) : (
              <ul className="mini-list">
                {upcoming.map((s) => (
                  <li key={s.sessionId} className="mini-row">
                    <span className="mono">
                      {formatTime(s.startAt, tz)}–{formatTime(s.endAt, tz)}
                    </span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${s.courseTitle} · ${s.teacher.shortName}`}>
                      <b className="mono">{s.courseCode}</b> {s.courseTitle}
                    </span>
                    <StatusPill session={s} now={now} flap={false} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="admin-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFocused(id.floor);
              setFilters({ floors: [id.floor] });
            }}
            data-testid="room-panel-show"
          >
            {t('showOnMap')}
          </button>
        </div>
      </div>
    </>
  );
}

function SessionCard({ s, now, tz }: { s: SessionView; now: number; tz: string }) {
  const t = useTranslations('room');
  const tm = useTranslations('map');
  const p = deriveProgress(s.startAt, s.endAt, now);
  const initials = s.teacher.shortName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="session-card" data-testid="room-panel-current">
      <div className="sc-title">
        <span className="mono" style={{ color: 'var(--accent)', marginRight: 6 }}>
          {s.courseCode}
        </span>
        {s.courseTitle}
      </div>
      <div className="sc-meta">
        <span className="mono">
          {formatTime(s.startAt, tz)}–{formatTime(s.endAt, tz)}
        </span>
        <span>{t(`lesson.${s.lessonType}`)}</span>
        <span>{s.groups.join(', ')}</span>
      </div>
      <div className="progress-bar" aria-hidden>
        <i style={{ transform: `scaleX(${p.toFixed(3)})` }} />
      </div>
      <div className="sc-meta">
        <span style={{ color: 'var(--status-live-text)' }}>{tm('endsIn', { countdown: formatCountdown(s.endAt, now) })}</span>
        <StatusPill session={s} now={now} flap={false} />
      </div>
      <div className="teacher-card">
        <span className="avatar" aria-hidden>
          {initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <div>{s.teacher.fullName}</div>
          {s.teacher.department && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.teacher.department}</div>}
        </div>
      </div>
    </div>
  );
}
