import { useEffect, useMemo } from 'react';
import { useMapStore, selectActiveFloor } from '@/store/mapStore';
import { MapViewport } from '@/components/FloorMap/MapViewport';
import { FloorSelector } from '@/components/panels/FloorSelector';
import { Legend } from '@/components/panels/Legend';
import { RoomDetails } from '@/components/panels/RoomDetails';
import { EditorPanel } from '@/components/panels/EditorPanel';

export function App() {
  const plan = useMapStore(selectActiveFloor);
  const mode = useMapStore((s) => s.mode);
  const setMode = useMapStore((s) => s.setMode);
  const search = useMapStore((s) => s.search);
  const setSearch = useMapStore((s) => s.setSearch);
  const selectRoom = useMapStore((s) => s.selectRoom);
  const message = useMapStore((s) => s.message);
  const setMessage = useMapStore((s) => s.setMessage);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message, setMessage]);

  const q = search.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? plan.rooms
            .filter((r) => !r.hideLabel || r.number)
            .filter((r) => [r.number, r.name, r.planName ?? ''].some((t) => t.toLowerCase().includes(q)))
            .slice(0, 12)
        : [],
    [plan, q],
  );

  const counts = useMemo(() => {
    const c = { total: plan.rooms.length, free: 0, busy: 0, ending: 0, soon: 0 };
    for (const r of plan.rooms) if (r.status in c && r.status !== 'service') (c as Record<string, number>)[r.status]++;
    return c;
  }, [plan]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <span>Векторная карта здания</span>
          <span className="muted">· {plan.name}</span>
        </div>
        <div className="search">
          <input
            type="search"
            placeholder="Поиск по номеру или названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск помещения"
          />
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { selectRoom(r.id); }}>
                    <b>{r.number || '—'}</b> {r.name}
                    {r.planName && <span className="muted"> · {r.planName}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="stats muted">
          {counts.total} помещений · свободно {counts.free} · занято {counts.busy}
        </div>
        <button type="button" className={mode === 'edit' ? 'mode-btn is-active' : 'mode-btn'} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} title="Клавиша E">
          {mode === 'edit' ? '✎ Редактирование' : 'Просмотр'}
        </button>
      </header>

      <main className="layout">
        <section className="map-area">
          <MapViewport plan={plan} />
          <div className="overlay-left">
            <FloorSelector />
          </div>
          <div className="overlay-bottom">
            <Legend />
          </div>
        </section>
        <aside className="sidebar">
          <RoomDetails plan={plan} />
          {mode === 'edit' && <EditorPanel plan={plan} />}
        </aside>
      </main>
      {message && mode !== 'edit' && (
        <div className="toast" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
    </div>
  );
}
