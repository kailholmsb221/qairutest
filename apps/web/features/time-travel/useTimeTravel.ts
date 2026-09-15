'use client';

import { useCallback, useEffect, useRef } from 'react';
import { api, BUILDING } from '@/lib/api/client';
import { useBoardStore, useBoardStoreApi } from '@/lib/store/boardStore';

const DEBOUNCE_MS = 120;

/**
 * Dragging the bar sets `travelAt` (debounced 120 ms) → GET /board?at= → store (mode = travel).
 * SSE snapshots are ignored while travelling; `goLive()` re-applies the last live snapshot.
 */
export function useTimeTravel(building = BUILDING) {
  const store = useBoardStoreApi();
  const mode = useBoardStore((s) => s.mode);
  const travelAt = useBoardStore((s) => s.travelAt);
  const loading = useBoardStore((s) => s.travelLoading);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const travelTo = useCallback(
    (at: string) => {
      const st = store.getState();
      st.enterTravel(at);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        ctrl.current?.abort();
        const c = new AbortController();
        ctrl.current = c;
        api
          .board({ building, at }, { signal: c.signal })
          .then((s) => {
            if (store.getState().travelAt === at) store.getState().setSnapshot(s, 'rest');
          })
          .catch((err: unknown) => {
            if ((err as { name?: string })?.name === 'AbortError') return;
            store.getState().setTravelLoading(false);
            store.getState().setError('travel_failed');
          });
      }, DEBOUNCE_MS);
    },
    [building, store],
  );

  const goLive = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    ctrl.current?.abort();
    store.getState().exitTravel();
  }, [store]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      ctrl.current?.abort();
    },
    [],
  );

  return { mode, travelAt, loading, travelTo, goLive };
}
