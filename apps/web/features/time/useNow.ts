'use client';

import { createContext, createElement, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { ClockMode, TimeInfo } from '@campuslive/contracts';

/**
 * One 1 Hz ticker for the whole app. Only components that display countdowns or
 * progress subscribe to `useNow()`; everything else reads snapshots.
 *
 * Server time wins: `sync()` stores the offset between the API clock and Date.now().
 * With CLOCK_MODE=fixed the API clock does not move, so neither does ours.
 *
 * The store is created per page render (context), seeded with the server's TimeInfo, so the SSR
 * HTML and the client's first render show the same instant (zustand serves the *initial* state
 * during SSR, so a module-level store could not be synced per request).
 */
export interface TimeStore {
  now: number;
  offsetMs: number;
  mode: ClockMode;
  frozenAt: number | null;
  timezone: string;
  synced: boolean;
  tick: () => void;
  sync: (serverNow: string, mode: ClockMode, timezone: string) => void;
}

export type TimeStoreApi = StoreApi<TimeStore>;

export function createTimeStore(initial?: TimeInfo | null): TimeStoreApi {
  const server = initial ? Date.parse(initial.now) : NaN;
  const seeded = Number.isFinite(server);
  return createStore<TimeStore>((set, get) => ({
    now: seeded ? server : Date.now(),
    offsetMs: seeded ? server - Date.now() : 0,
    mode: initial?.mode ?? 'real',
    frozenAt: seeded && initial?.mode === 'fixed' ? server : null,
    timezone: initial?.timezone ?? 'Asia/Almaty',
    synced: seeded,
    tick: () => {
      const { frozenAt, offsetMs } = get();
      set({ now: frozenAt ?? Date.now() + offsetMs });
    },
    sync: (serverNow, mode, timezone) => {
      const s = Date.parse(serverNow);
      if (!Number.isFinite(s)) return;
      if (mode === 'fixed') set({ mode, timezone, frozenAt: s, offsetMs: s - Date.now(), now: s, synced: true });
      else set({ mode, timezone, frozenAt: null, offsetMs: s - Date.now(), now: s, synced: true });
    },
  }));
}

const TimeStoreContext = createContext<TimeStoreApi | null>(null);

export function TimeStoreProvider({ initial, children }: { initial: TimeInfo | null; children: ReactNode }) {
  const ref = useRef<TimeStoreApi | null>(null);
  if (!ref.current) ref.current = createTimeStore(initial);
  const store = ref.current;
  // the 1 Hz ticker, aligned to wall-clock seconds so the clock does not drift visually
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      store.getState().tick();
      t = setTimeout(loop, 1000 - (Date.now() % 1000));
    };
    loop();
    return () => clearTimeout(t);
  }, [store]);
  return createElement(TimeStoreContext.Provider, { value: store }, children);
}

export function useTimeStoreApi(): TimeStoreApi {
  const api = useContext(TimeStoreContext);
  if (!api) throw new Error('useTimeStore must be used inside <TimeStoreProvider>');
  return api;
}

export function useTimeStore<T>(selector: (s: TimeStore) => T): T {
  return useStore(useTimeStoreApi(), selector);
}

/** Current "now" (ms since epoch, server-aligned). Re-renders once per second. */
export function useNow(): number {
  return useTimeStore((s) => s.now);
}

export function useTimezone(): string {
  return useTimeStore((s) => s.timezone);
}
