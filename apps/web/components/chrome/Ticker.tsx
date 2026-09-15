'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useNow } from '@/features/time/useNow';
import { tickerLines } from '@/features/board/selectors';

/** Announcements + auto-generated lines, connection dot, app version, hidden demo-admin button. */
export function Ticker() {
  const t = useTranslations('ticker');
  const now = useNow();
  const announcements = useBoardStore((s) => s.announcements);
  const next = useBoardStore(useShallow((s) => s.snapshot.next));
  const connection = useBoardStore((s) => s.connection);
  const kiosk = useUiStore((s) => s.kiosk);
  const setAdminOpen = useUiStore((s) => s.setAdminOpen);
  const adminOpen = useUiStore((s) => s.adminOpen);

  const items = useMemo(() => {
    const out: { id: string; severity: 'info' | 'warning' | 'alert'; room?: string; text: string }[] = [];
    for (const a of announcements) out.push({ id: a.id, severity: a.severity, text: a.text });
    for (const l of tickerLines(next, now, 8)) {
      const s = next.find((x) => x.sessionId === l.id);
      if (!s) continue;
      const text =
        l.kind === 'cancelled'
          ? t('cancelled', { course: s.courseTitle })
          : l.kind === 'moved'
            ? t('moved', { course: s.courseTitle, room: s.roomCode })
            : l.kind === 'delayed'
              ? t('delayed', { course: s.courseTitle, min: s.delayMinutes ?? 0 })
              : l.minutes <= 0
                ? t('startsNow', { course: s.courseTitle, teacher: s.teacher.shortName })
                : t('startsIn', { course: s.courseTitle, min: l.minutes, teacher: s.teacher.shortName });
      out.push({ id: l.id, severity: l.kind === 'cancelled' ? 'alert' : l.kind === 'soon' ? 'info' : 'warning', room: l.kind === 'moved' && s.movedFrom ? s.movedFrom : s.roomCode, text });
    }
    return out;
    // `now` only matters at minute granularity for the generated lines
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, next, Math.floor(now / 60_000), t]);

  const duration = Math.max(30, items.length * 9);
  const label = connection === 'online' ? t('online') : connection === 'reconnecting' ? t('reconnecting') : t('offline');

  return (
    <footer className="ticker panel" data-testid="ticker">
      <div className="ticker-track" aria-live="polite" aria-atomic="false">
        {items.length === 0 ? (
          <div className="ticker-run" style={{ animation: 'none', position: 'static' }}>
            <span className="ticker-item">{t('quiet')}</span>
          </div>
        ) : (
          <div className="ticker-run" style={{ ['--ticker-duration' as string]: `${duration}s` }}>
            {[0, 1].map((copy) =>
              items.map((it) => (
                <span key={`${copy}-${it.id}`} className="ticker-item" data-severity={it.severity} aria-hidden={copy === 1}>
                  <i className="tk-dot" aria-hidden />
                  {it.room && <b>{it.room}</b>}
                  <span>{it.text}</span>
                </span>
              )),
            )}
          </div>
        )}
      </div>
      <span className="conn" data-state={connection} data-testid="connection" role="status">
        <i aria-hidden />
        {label}
      </span>
      <span className="version">v{process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}</span>
      {!kiosk && (
        <button type="button" className={adminOpen ? 'btn icon is-active' : 'btn icon'} style={{ height: 28, width: 28, opacity: 0.55 }} onClick={() => setAdminOpen(!adminOpen)} aria-label={t('admin')} title={t('admin')} data-testid="admin-toggle">
          <span aria-hidden>⚙</span>
        </button>
      )}
    </footer>
  );
}
