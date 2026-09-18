'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import type { Override } from '@campuslive/contracts';
import { api, HttpError } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { SCHEDULABLE_CODES } from '@/lib/vector-map';
import { useTimeStore } from '@/features/time/useNow';
import { formatTime } from '@/features/time/derive';
import { useAdminKey } from '@/lib/admin-key';

/**
 * Hidden behind the ⚙ button in the ticker: cancel / move / delay a session, post an
 * announcement, open the weekly timetable editor. Talks to the admin API with the demo key;
 * the board updates over SSE.
 */
export function DemoAdminPanel() {
  const t = useTranslations('admin');
  const API_KEY = useAdminKey();
  const open = useUiStore((s) => s.adminOpen);
  const setOpen = useUiStore((s) => s.setAdminOpen);
  const setScheduleOpen = useUiStore((s) => s.setScheduleOpen);
  const setToast = useUiStore((s) => s.setToast);
  const tz = useTimeStore((s) => s.timezone);
  const sessions = useBoardStore(useShallow((s) => [...s.snapshot.now, ...s.snapshot.next].filter((x) => x.lessonId && x.status !== 'cancelled')));
  const date = useBoardStore((s) => s.snapshot.date);
  const [sessionId, setSessionId] = useState('');
  const [room, setRoom] = useState(SCHEDULABLE_CODES[0] ?? '');
  const [minutes, setMinutes] = useState(15);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Override | null>(null);

  const picked = useMemo(() => sessions.find((s) => s.sessionId === sessionId) ?? sessions[0], [sessions, sessionId]);
  const options = useMemo(() => sessions.map((s) => ({ id: s.sessionId, label: `${formatTime(s.startAt, tz)} · ${s.roomCode} · ${s.courseCode} ${s.courseTitle}` })), [sessions, tz]);

  const run = async (what: string, fn: () => Promise<Override | null>) => {
    if (!API_KEY) {
      setToast(t('noKey'));
      return;
    }
    setBusy(true);
    try {
      const o = await fn();
      if (o) setLast(o);
      setToast(t('ok', { what }));
    } catch (err) {
      setToast(t('error', { msg: err instanceof HttpError ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="admin-panel glass" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} data-testid="admin-panel" role="dialog" aria-label={t('title')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <b>{t('title')}</b>
            <button type="button" className="btn icon" onClick={() => setOpen(false)} aria-label={t('close')} style={{ height: 28, width: 28 }}>
              ✕
            </button>
          </div>
          {!API_KEY && <div style={{ color: 'var(--status-delayed)', fontSize: 12 }}>{t('noKey')}</div>}
          <div className="admin-row">
            <button type="button" className="btn is-active" onClick={() => setScheduleOpen(true)} data-testid="admin-schedule-open">
              📅 {t('schedule.open')}
            </button>
          </div>
          <label>
            {t('session')}
            <select value={picked?.sessionId ?? ''} onChange={(e) => setSessionId(e.target.value)} data-testid="admin-session">
              {options.length === 0 && <option value="">{t('pick')}</option>}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-row">
            <button type="button" className="btn" disabled={busy || !picked} data-testid="admin-cancel" onClick={() => run(t('cancel'), () => api.admin.createOverride({ kind: 'cancel', date, lessonId: picked!.lessonId!, note: 'demo' }, API_KEY))}>
              ✕ {t('cancel')}
            </button>
            <button type="button" className="btn" disabled={busy || !picked} data-testid="admin-move" onClick={() => run(`${t('move')} → ${room}`, () => api.admin.createOverride({ kind: 'move', date, lessonId: picked!.lessonId!, newRoomCode: room, note: 'demo' }, API_KEY))}>
              → {t('move')}
            </button>
            <select value={room} onChange={(e) => setRoom(e.target.value)} aria-label={t('room')} data-testid="admin-room">
              {SCHEDULABLE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-row">
            <button type="button" className="btn" disabled={busy || !picked} data-testid="admin-delay" onClick={() => run(`${t('delay')} +${minutes}`, () => api.admin.createOverride({ kind: 'delay', date, lessonId: picked!.lessonId!, delayMinutes: minutes, note: 'demo' }, API_KEY))}>
              ⏱ {t('delay')}
            </button>
            <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label={t('minutes')} style={{ width: 80 }} />
            {last && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                data-testid="admin-undo"
                onClick={() =>
                  run(t('undo'), async () => {
                    await api.admin.deleteOverride(last.id, API_KEY);
                    setLast(null);
                    return null;
                  })
                }
              >
                ↶ {t('undo')}
              </button>
            )}
          </div>
          <label>
            {t('announce')}
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('text')} data-testid="admin-text" />
          </label>
          <div className="admin-row">
            <button type="button" className="btn" disabled={busy || !text.trim()} data-testid="admin-announce" onClick={() => run(t('announce'), async () => { await api.admin.createAnnouncement({ text: text.trim(), severity: 'warning', durationMinutes: 30 }, API_KEY); setText(''); return null; })}>
              📣 {t('send')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
