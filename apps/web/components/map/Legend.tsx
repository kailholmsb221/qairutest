'use client';

import { useTranslations } from 'next-intl';
import { useUiStore } from '@/lib/store/uiStore';
import { useBoardStoreApi } from '@/lib/store/boardStore';
import type { RoomPhase } from '@campuslive/contracts';

const ORDER: { phase: RoomPhase; color: string; key: 'legendLive' | 'legendEnding' | 'legendSoon' | 'legendFree' }[] = [
  { phase: 'live', color: 'var(--status-live)', key: 'legendLive' },
  { phase: 'ending', color: 'var(--status-ending)', key: 'legendEnding' },
  { phase: 'soon', color: 'var(--status-soon)', key: 'legendSoon' },
  { phase: 'free', color: 'var(--status-free)', key: 'legendFree' },
];

/** The editor's legend; clicking a status row highlights the rooms in that phase (a filter on the map + board). */
export function Legend() {
  const t = useTranslations('map');
  const highlight = useUiStore((s) => s.highlight);
  const setHighlight = useUiStore((s) => s.setHighlight);
  const store = useBoardStoreApi();
  const active = highlight?.kind === 'room' && highlight.id.startsWith('phase:') ? highlight.id.slice(6) : null;

  const toggle = (phase: RoomPhase) => {
    if (active === phase) {
      setHighlight(null);
      return;
    }
    const snap = store.getState().snapshot;
    const rooms = snap.rooms.filter((r) => r.phase === phase);
    const codes = rooms.map((r) => r.roomCode);
    const ids = [...snap.now, ...snap.next].filter((s) => codes.includes(s.roomCode) && (phase === 'free' ? false : true)).map((s) => s.sessionId);
    setHighlight({ kind: 'room', id: `phase:${phase}`, label: t(ORDER.find((o) => o.phase === phase)!.key), roomCodes: codes, sessionIds: ids });
  };

  return (
    <div className="legend" data-testid="legend" role="group" aria-label="Legend">
      {ORDER.map((o) => (
        <button key={o.phase} type="button" className={['legend-row', active === o.phase ? 'is-active' : '', active && active !== o.phase ? 'is-muted' : ''].filter(Boolean).join(' ')} onClick={() => toggle(o.phase)} aria-pressed={active === o.phase}>
          <span className="swatch" style={{ background: o.color }} />
          <span>{t(o.key)}</span>
        </button>
      ))}
      <div className="legend-row legend-static">
        <span className="swatch" style={{ background: 'var(--status-service)' }} />
        <span>{t('legendService')}</span>
      </div>
      <div className="legend-row legend-static">
        <span className="swatch" style={{ background: '#172432' }} />
        <span>{t('legendCorridors')}</span>
      </div>
      <div className="legend-row legend-static">
        <span className="swatch" style={{ background: '#2b4766' }} />
        <span>{t('legendWc')}</span>
      </div>
      <div className="legend-row legend-static">
        <span className="swatch swatch-hatch" style={{ background: '#293a51' }} />
        <span>{t('legendTech')}</span>
      </div>
      {active && (
        <button type="button" className="legend-row" style={{ color: 'var(--accent)' }} onClick={() => setHighlight(null)}>
          {t('clearFilter')}
        </button>
      )}
    </div>
  );
}
