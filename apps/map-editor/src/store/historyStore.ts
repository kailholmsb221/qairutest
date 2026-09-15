import { create } from 'zustand';
import type { FloorPlan } from '@/types/plan';

interface FloorHistory {
  past: FloorPlan[];
  future: FloorPlan[];
}

interface HistoryState {
  byFloor: Record<string, FloorHistory>;
  limit: number;
  /** Сохранить снимок ДО изменения. */
  push: (floorId: string, snapshot: FloorPlan) => void;
  /** Вернуть предыдущий снимок, положив текущий в future. */
  undo: (floorId: string, current: FloorPlan) => FloorPlan | null;
  redo: (floorId: string, current: FloorPlan) => FloorPlan | null;
  clear: (floorId?: string) => void;
  canUndo: (floorId: string) => boolean;
  canRedo: (floorId: string) => boolean;
}

const empty = (): FloorHistory => ({ past: [], future: [] });

export const useHistoryStore = create<HistoryState>((set, get) => ({
  byFloor: {},
  limit: 100,
  push: (floorId, snapshot) =>
    set((s) => {
      const h = s.byFloor[floorId] ?? empty();
      const past = [...h.past, snapshot].slice(-s.limit);
      return { byFloor: { ...s.byFloor, [floorId]: { past, future: [] } } };
    }),
  undo: (floorId, current) => {
    const h = get().byFloor[floorId];
    if (!h || h.past.length === 0) return null;
    const prev = h.past[h.past.length - 1];
    set((s) => ({
      byFloor: { ...s.byFloor, [floorId]: { past: h.past.slice(0, -1), future: [current, ...h.future] } },
    }));
    return prev;
  },
  redo: (floorId, current) => {
    const h = get().byFloor[floorId];
    if (!h || h.future.length === 0) return null;
    const next = h.future[0];
    set((s) => ({
      byFloor: { ...s.byFloor, [floorId]: { past: [...h.past, current], future: h.future.slice(1) } },
    }));
    return next;
  },
  clear: (floorId) =>
    set((s) => {
      if (!floorId) return { byFloor: {} };
      const copy = { ...s.byFloor };
      delete copy[floorId];
      return { byFloor: copy };
    }),
  canUndo: (floorId) => (get().byFloor[floorId]?.past.length ?? 0) > 0,
  canRedo: (floorId) => (get().byFloor[floorId]?.future.length ?? 0) > 0,
}));
