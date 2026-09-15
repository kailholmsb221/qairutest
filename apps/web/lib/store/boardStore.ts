'use client';

import { createContext, createElement, useContext, useRef, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { Announcement, RoomLiveState, SessionView, Snapshot } from '@campuslive/contracts';

export type Connection = 'online' | 'reconnecting' | 'offline';
export type BoardMode = 'live' | 'travel';
export type SnapshotSource = 'sse' | 'rest' | 'ssr';

export interface Indexed {
  byId: Map<string, SessionView>;
  roomByCode: Map<string, RoomLiveState>;
  nowIds: string[];
  nextIds: string[];
}

export function indexSnapshot(s: Snapshot): Indexed {
  const byId = new Map<string, SessionView>();
  for (const x of s.now) byId.set(x.sessionId, x);
  for (const x of s.next) byId.set(x.sessionId, x);
  const roomByCode = new Map<string, RoomLiveState>();
  for (const r of s.rooms) roomByCode.set(r.roomCode, r);
  return { byId, roomByCode, nowIds: s.now.map((x) => x.sessionId), nextIds: s.next.map((x) => x.sessionId) };
}

export interface BoardStore {
  mode: BoardMode;
  /** the snapshot currently displayed (live or travelled) */
  snapshot: Snapshot;
  index: Indexed;
  /** last live snapshot received over SSE/REST; re-applied when leaving travel mode */
  liveSnapshot: Snapshot;
  travelAt: string | null;
  travelLoading: boolean;
  connection: Connection;
  lastHeartbeatAt: number | null;
  lastSnapshotAt: number | null;
  announcements: Announcement[];
  error: string | null;

  setSnapshot: (s: Snapshot, source: SnapshotSource) => void;
  setConnection: (c: Connection) => void;
  heartbeat: (at: number) => void;
  addAnnouncement: (a: Announcement) => void;
  enterTravel: (at: string) => void;
  setTravelLoading: (v: boolean) => void;
  exitTravel: () => void;
  setError: (e: string | null) => void;
}

export function emptySnapshot(building = 'A'): Snapshot {
  const at = new Date(0).toISOString();
  return { building, at, date: '1970-01-01', nextTransitionAt: null, stats: { roomsTotal: 0, roomsBusy: 0, sessionsToday: 0, sessionsDone: 0 }, rooms: [], now: [], next: [], announcements: [] };
}

function mergeAnnouncements(existing: Announcement[], incoming: Announcement[], nowIso: string): Announcement[] {
  const map = new Map<string, Announcement>();
  for (const a of existing) map.set(a.id, a);
  for (const a of incoming) map.set(a.id, a);
  return [...map.values()].filter((a) => a.endsAt > nowIso).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface BoardStoreInit {
  snapshot?: Snapshot | null;
  /** when set, the store starts in travel mode showing `snapshot` at that instant */
  travelAt?: string | null;
  error?: string | null;
}

export const createBoardStore = (init: BoardStoreInit = {}) => {
  const snap = init.snapshot ?? emptySnapshot();
  const travel = !!(init.travelAt && init.snapshot);
  return createStore<BoardStore>((set, get) => ({
    mode: travel ? 'travel' : 'live',
    snapshot: snap,
    index: indexSnapshot(snap),
    liveSnapshot: travel ? emptySnapshot(snap.building) : snap,
    travelAt: travel ? init.travelAt! : null,
    travelLoading: false,
    connection: init.error ? 'offline' : 'online',
    lastHeartbeatAt: null,
    lastSnapshotAt: init.snapshot ? Date.now() : null,
    announcements: snap.announcements ?? [],
    error: init.error ?? null,

    setSnapshot: (s, source) => {
      const st = get();
      if (source === 'sse' || source === 'ssr') {
        // live snapshots are ignored while travelling but remembered for LIVE
        const announcements = mergeAnnouncements(st.announcements, s.announcements ?? [], s.at);
        if (st.mode === 'travel') {
          set({ liveSnapshot: s, announcements, lastSnapshotAt: Date.now(), error: null });
          return;
        }
        set({ snapshot: s, index: indexSnapshot(s), liveSnapshot: s, announcements, lastSnapshotAt: Date.now(), error: null });
        return;
      }
      // rest: either a travel snapshot or a refetch after reconnect
      if (st.mode === 'travel') {
        set({ snapshot: s, index: indexSnapshot(s), travelLoading: false, error: null });
      } else {
        const announcements = mergeAnnouncements(st.announcements, s.announcements ?? [], s.at);
        set({ snapshot: s, index: indexSnapshot(s), liveSnapshot: s, announcements, lastSnapshotAt: Date.now(), error: null });
      }
    },
    setConnection: (connection) => set({ connection }),
    heartbeat: (at) => set({ lastHeartbeatAt: at, connection: 'online' }),
    addAnnouncement: (a) => set((st) => ({ announcements: mergeAnnouncements(st.announcements, [a], new Date(0).toISOString()) })),
    enterTravel: (at) => set({ mode: 'travel', travelAt: at, travelLoading: true }),
    setTravelLoading: (travelLoading) => set({ travelLoading }),
    exitTravel: () => {
      const live = get().liveSnapshot;
      set({ mode: 'live', travelAt: null, travelLoading: false, snapshot: live, index: indexSnapshot(live) });
    },
    setError: (error) => set({ error }),
  }));
};

export type BoardStoreApi = StoreApi<BoardStore>;

// ---------------------------------------------------------------- per-request store (SSR-safe)

const BoardStoreContext = createContext<BoardStoreApi | null>(null);

/** One store per rendered page: the server and the client's first render see the same data. */
export function BoardStoreProvider({ init, children }: { init: BoardStoreInit; children: ReactNode }) {
  const ref = useRef<BoardStoreApi | null>(null);
  if (!ref.current) ref.current = createBoardStore(init);
  return createElement(BoardStoreContext.Provider, { value: ref.current }, children);
}

export function useBoardStoreApi(): BoardStoreApi {
  const api = useContext(BoardStoreContext);
  if (!api) throw new Error('useBoardStore must be used inside <BoardStoreProvider>');
  return api;
}

export function useBoardStore<T>(selector: (s: BoardStore) => T): T {
  return useStore(useBoardStoreApi(), selector);
}

// ---------------------------------------------------------------- selectors (memo-friendly)

export const selectSession = (id: string) => (s: BoardStore) => s.index.byId.get(id);
export const selectRoom = (code: string) => (s: BoardStore) => s.index.roomByCode.get(code);
export const selectNowIds = (s: BoardStore) => s.index.nowIds;
export const selectNextIds = (s: BoardStore) => s.index.nextIds;
export const selectStats = (s: BoardStore) => s.snapshot.stats;
export const selectAt = (s: BoardStore) => s.snapshot.at;
export const selectMode = (s: BoardStore) => s.mode;

/** Busy counts per floor for the floor tabs. */
export function useBusyByFloor(): Record<number, number> {
  return useBoardStore(
    useShallow((s) => {
      const out: Record<number, number> = {};
      for (const r of s.snapshot.rooms) {
        if (r.phase === 'live' || r.phase === 'ending') out[r.floor] = (out[r.floor] ?? 0) + 1;
      }
      return out;
    }),
  );
}
