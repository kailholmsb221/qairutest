import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SessionView, Snapshot } from '@campuslive/contracts';
import { computeRowsPerPage } from './useAutoFitRows';
import { paginate, usePager } from './usePager';
import { filterSessions, pillKind, tickerLines } from './selectors';
import { createBoardStore, emptySnapshot, indexSnapshot } from '@/lib/store/boardStore';

export function session(over: Partial<SessionView> & { sessionId: string }): SessionView {
  return {
    lessonId: null,
    courseCode: 'CS201',
    courseTitle: 'Базы данных',
    lessonType: 'practice',
    teacher: { id: '00000000-0000-0000-0000-000000000001', shortName: 'Ахметов Д.Б.', fullName: 'Ахметов Дамир Болатович' },
    groups: ['ПО2301'],
    roomCode: '101',
    roomName: 'Учебный класс',
    floor: 1,
    startAt: '2026-09-15T05:00:00Z',
    endAt: '2026-09-15T05:50:00Z',
    status: 'scheduled',
    phase: 'live',
    conflict: false,
    ...over,
  };
}

describe('computeRowsPerPage', () => {
  it('floors and never returns less than min', () => {
    expect(computeRowsPerPage(450, 44)).toBe(10);
    expect(computeRowsPerPage(20, 44)).toBe(1);
    expect(computeRowsPerPage(NaN, 44)).toBe(1);
    expect(computeRowsPerPage(400, 0, 2)).toBe(2);
  });
});

describe('paginate', () => {
  it('slices pages and clamps the page index', () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginate(items, 2, 0)).toEqual({ items: [1, 2], pages: 3, page: 0 });
    expect(paginate(items, 2, 2)).toEqual({ items: [5], pages: 3, page: 2 });
    expect(paginate(items, 2, 9)).toEqual({ items: [5], pages: 3, page: 2 });
    expect(paginate([], 3, 0)).toEqual({ items: [], pages: 1, page: 0 });
  });
});

describe('usePager', () => {
  it('rotates pages on the interval and pauses while hovered', () => {
    vi.useFakeTimers();
    const items = ['a', 'b', 'c', 'd', 'e'];
    const { result, rerender } = renderHook(({ paused }) => usePager(items, 2, 1000, paused), { initialProps: { paused: false } });
    expect(result.current.page).toBe(0);
    expect(result.current.pages).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.page).toBe(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.page).toBe(0); // wrapped around
    rerender({ paused: true });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.page).toBe(0);
    vi.useRealTimers();
  });
  it('clamps when items shrink', () => {
    const { result, rerender } = renderHook(({ items }) => usePager(items, 2, 0), { initialProps: { items: ['a', 'b', 'c', 'd', 'e'] } });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    rerender({ items: ['a', 'b'] });
    expect(result.current.page).toBe(0);
    expect(result.current.items).toEqual(['a', 'b']);
  });
});

describe('pillKind', () => {
  it('maps phase and status to a pill', () => {
    expect(pillKind('live', 'scheduled')).toBe('live');
    expect(pillKind('ending', 'scheduled')).toBe('ending');
    expect(pillKind('cancelled', 'cancelled')).toBe('cancelled');
    expect(pillKind('upcoming', 'moved')).toBe('moved');
    expect(pillKind('soon', 'delayed')).toBe('delayed');
    expect(pillKind('soon', 'scheduled')).toBe('soon');
    expect(pillKind('upcoming', 'extra')).toBe('upcoming');
    expect(pillKind('done', 'scheduled')).toBe('done');
    expect(pillKind('live', 'moved')).toBe('live'); // a moved session that is running shows LIVE
  });
});

describe('filterSessions', () => {
  const rows = [session({ sessionId: 'a', floor: 1, lessonType: 'lecture' }), session({ sessionId: 'b', floor: 2 }), session({ sessionId: 'c', floor: 2, lessonType: 'lab' })];
  it('filters by floor, lesson type and highlight', () => {
    expect(filterSessions(rows, { floors: [2], lessonTypes: [] }, null).map((s) => s.sessionId)).toEqual(['b', 'c']);
    expect(filterSessions(rows, { floors: [], lessonTypes: ['lab'] }, null).map((s) => s.sessionId)).toEqual(['c']);
    expect(filterSessions(rows, { floors: [], lessonTypes: [] }, { kind: 'group', id: 'x', label: 'x', roomCodes: [], sessionIds: ['a'] }).map((s) => s.sessionId)).toEqual(['a']);
  });
});

describe('tickerLines', () => {
  it('generates lines for soon/cancelled/moved/delayed sessions only', () => {
    const now = Date.parse('2026-09-15T04:56:00Z');
    const next = [
      session({ sessionId: 's', phase: 'soon' }),
      session({ sessionId: 'u', phase: 'upcoming' }),
      session({ sessionId: 'c', phase: 'cancelled', status: 'cancelled' }),
      session({ sessionId: 'm', phase: 'upcoming', status: 'moved', movedFrom: '102' }),
      session({ sessionId: 'd', phase: 'upcoming', status: 'delayed', delayMinutes: 15 }),
    ];
    const lines = tickerLines(next, now);
    expect(lines.map((l) => `${l.id}:${l.kind}`)).toEqual(['s:soon', 'c:cancelled', 'm:moved', 'd:delayed']);
    expect(lines[0].minutes).toBe(4);
  });
});

describe('boardStore', () => {
  const snap = (ids: string[], at = '2026-09-15T05:47:00Z'): Snapshot => ({
    ...emptySnapshot(),
    at,
    date: '2026-09-15',
    now: ids.map((id) => session({ sessionId: id })),
    rooms: [{ roomId: 'f1-class20a', roomCode: '101', roomName: 'x', floor: 1, phase: 'live', conflict: false, current: null, next: null, freeUntil: null }],
    announcements: [{ id: 'a1', text: 'hi', severity: 'info', startsAt: '2026-09-15T05:00:00Z', endsAt: '2026-09-15T06:00:00Z' }],
  });

  it('indexes sessions and rooms', () => {
    const idx = indexSnapshot(snap(['a', 'b']));
    expect(idx.nowIds).toEqual(['a', 'b']);
    expect(idx.byId.get('b')?.sessionId).toBe('b');
    expect(idx.roomByCode.get('101')?.phase).toBe('live');
  });

  it('ignores SSE snapshots while travelling and restores the last live one on LIVE', () => {
    const store = createBoardStore({ snapshot: snap(['live1']) });
    store.getState().enterTravel('2026-09-15T03:20:00Z');
    store.getState().setSnapshot(snap(['travel1'], '2026-09-15T03:20:00Z'), 'rest');
    expect(store.getState().snapshot.now[0].sessionId).toBe('travel1');
    expect(store.getState().travelLoading).toBe(false);
    store.getState().setSnapshot(snap(['live2']), 'sse');
    expect(store.getState().snapshot.now[0].sessionId).toBe('travel1'); // still travelling
    expect(store.getState().liveSnapshot.now[0].sessionId).toBe('live2');
    store.getState().exitTravel();
    expect(store.getState().mode).toBe('live');
    expect(store.getState().snapshot.now[0].sessionId).toBe('live2');
  });

  it('starts in travel mode when initialised with travelAt', () => {
    const store = createBoardStore({ snapshot: snap(['t']), travelAt: '2026-09-15T03:20:00Z' });
    expect(store.getState().mode).toBe('travel');
    expect(store.getState().travelAt).toBe('2026-09-15T03:20:00Z');
  });

  it('merges announcements and drops expired ones', () => {
    const store = createBoardStore({ snapshot: snap([]) });
    store.getState().addAnnouncement({ id: 'a2', text: 'later', severity: 'warning', startsAt: '2026-09-15T05:30:00Z', endsAt: '2026-09-15T07:00:00Z' });
    expect(store.getState().announcements.map((a) => a.id)).toEqual(['a1', 'a2']);
    store.getState().setSnapshot({ ...snap([], '2026-09-15T06:30:00Z'), announcements: [] }, 'sse');
    expect(store.getState().announcements.map((a) => a.id)).toEqual(['a2']); // a1 expired at 06:00
  });

  it('tracks connection and heartbeats', () => {
    const store = createBoardStore({ error: 'down' });
    expect(store.getState().connection).toBe('offline');
    store.getState().heartbeat(123);
    expect(store.getState().connection).toBe('online');
    expect(store.getState().lastHeartbeatAt).toBe(123);
  });
});
