'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUiStore } from '@/lib/store/uiStore';
import { useBoardStoreApi } from '@/lib/store/boardStore';
import { FLOOR_NUMBERS } from '@/lib/vector-map';

function parseSeconds(v: string | null, def: number): number {
  if (!v) return def;
  const m = /^(\d+)(s|m)?$/.exec(v);
  if (!m) return def;
  const n = Number(m[1]);
  return m[2] === 'm' ? n * 60 : n;
}

/**
 * Kiosk: every `floorCycle` seconds focus moves to the next floor that has busy rooms
 * (falling back to the exploded view); pages rotate on their own; no cursor, no panels.
 */
export function KioskDriver() {
  const params = useSearchParams();
  const setFocused = useUiStore((s) => s.setFocusedFloor);
  const setFilters = useUiStore((s) => s.setFilters);
  const setPageIntervalMs = useUiStore((s) => s.setPageIntervalMs);
  const store = useBoardStoreApi();
  useEffect(() => {
    const cycle = parseSeconds(params.get('floorCycle'), 20) * 1000;
    setPageIntervalMs(parseSeconds(params.get('page'), 8) * 1000);
    let i = -1;
    const step = () => {
      const rooms = store.getState().snapshot.rooms;
      const busyFloors = FLOOR_NUMBERS.filter((n) => rooms.some((r) => r.floor === n && (r.phase === 'live' || r.phase === 'ending')));
      const sequence: (number | null)[] = [null, ...(busyFloors.length ? busyFloors : FLOOR_NUMBERS)];
      i = (i + 1) % sequence.length;
      const f = sequence[i];
      setFocused(f);
      setFilters({ floors: f === null ? [] : [f] });
    };
    step();
    const t = setInterval(step, cycle);
    return () => clearInterval(t);
  }, [params, setFocused, setFilters, setPageIntervalMs, store]);
  return null;
}
