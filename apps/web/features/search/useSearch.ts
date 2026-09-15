'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SearchResult, SessionView } from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useBoardStoreApi } from '@/lib/store/boardStore';
import { useUiStore, type Highlight, type HighlightKind } from '@/lib/store/uiStore';
import { localDate } from '@/features/time/derive';
import { useTimeStoreApi } from '@/features/time/useNow';

const EMPTY: SearchResult = { q: '', teachers: [], groups: [], rooms: [], courses: [] };

/** Debounced unified search over the API. */
export function useSearch(query: string, delay = 150): { result: SearchResult; loading: boolean } {
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .search(q, { signal: ctrl.signal })
        .then((r) => setResult(r))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, delay);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, delay]);
  return { result, loading };
}

/** Builds a Highlight for the chosen entity: matching rooms on the map + matching sessions on the board. */
export function useHighlighter() {
  const setHighlight = useUiStore((s) => s.setHighlight);
  const store = useBoardStoreApi();
  const timeApi = useTimeStoreApi();
  return useCallback(
    async (kind: HighlightKind, id: string, label: string) => {
      const st = store.getState();
      const tz = timeApi.getState().timezone;
      const date = st.snapshot.date && st.snapshot.date !== '1970-01-01' ? st.snapshot.date : localDate(Date.now(), tz);
      let sessions: SessionView[] = [];
      try {
        if (kind === 'teacher') sessions = (await api.teacherDay(id, date)).sessions;
        else if (kind === 'group') sessions = (await api.groupDay(id, date)).sessions;
        else if (kind === 'room') sessions = (await api.roomDay(id, date)).sessions;
        else sessions = [...st.snapshot.now, ...st.snapshot.next].filter((s) => s.courseCode === id);
      } catch {
        sessions = [...st.snapshot.now, ...st.snapshot.next].filter((s) => (kind === 'teacher' ? s.teacher.id === id : kind === 'group' ? s.groups.includes(id) : kind === 'room' ? s.roomCode === id : s.courseCode === id));
      }
      const roomCodes = kind === 'room' ? [id] : [...new Set(sessions.filter((s) => s.status !== 'cancelled').map((s) => s.roomCode))];
      const h: Highlight = { kind, id, label, roomCodes, sessionIds: sessions.map((s) => s.sessionId) };
      setHighlight(h);
      return h;
    },
    [setHighlight, store, timeApi],
  );
}
