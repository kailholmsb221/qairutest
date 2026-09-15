import { create } from 'zustand';
import type { Door, DoorSwing, FloorPlan, Point, Room, RoomStatus, ViewBox, Wall } from '@/types/plan';
import { validateFloor, type GeometryIssue } from '@/geometry/validateBoundary';
import { pointOnArc } from '@/geometry/bulgeToArc';
import { useHistoryStore } from './historyStore';
import { loadBundledFloors } from '@/data/loadFloors';

export type Mode = 'view' | 'edit';
export type EditorTool = 'select' | 'addWall' | 'deleteWall' | 'splitWall' | 'addDoor';

export interface EditorSettings {
  grid: number;
  snapGrid: boolean;
  snapPoints: boolean;
  snapAxis: boolean;
  showCoords: boolean;
  showGrid: boolean;
}

export interface EditorSelection {
  pointId: string | null;
  wallId: string | null;
  doorId: string | null;
  /** первая точка при добавлении стены */
  pendingPointId: string | null;
}

interface MapState {
  floors: FloorPlan[];
  activeFloorId: string;
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  search: string;
  statusFilter: RoomStatus[];
  mode: Mode;
  tool: EditorTool;
  editor: EditorSettings;
  editSel: EditorSelection;
  cursor: Point | null;
  viewBox: ViewBox;
  issues: GeometryIssue[];
  message: string | null;

  // --- навигация / выбор
  setActiveFloor: (id: string) => void;
  selectRoom: (id: string | null) => void;
  hoverRoom: (id: string | null) => void;
  setSearch: (s: string) => void;
  toggleStatusFilter: (s: RoomStatus) => void;
  clearStatusFilter: () => void;
  setMode: (m: Mode) => void;
  setTool: (t: EditorTool) => void;
  setEditor: (patch: Partial<EditorSettings>) => void;
  setCursor: (p: Point | null) => void;
  setViewBox: (vb: ViewBox) => void;
  fitToScreen: () => void;
  resetView: () => void;
  setMessage: (m: string | null) => void;

  // --- редактирование
  selectPoint: (id: string | null) => void;
  selectWall: (id: string | null) => void;
  selectDoor: (id: string | null) => void;
  beginPointDrag: () => void;
  movePoint: (id: string, p: Point) => void;
  endPointDrag: () => void;
  clickPointForWall: (id: string) => void;
  deleteWall: (id: string) => void;
  splitWall: (id: string) => void;
  setWallType: (id: string, type: Wall['type'], bulge?: number) => void;
  setWallBulge: (id: string, bulge: number) => void;
  addDoor: (wallId: string, position?: number) => void;
  updateDoor: (id: string, patch: Partial<Door>) => void;
  deleteDoor: (id: string) => void;
  updateRoom: (id: string, patch: Partial<Pick<Room, 'number' | 'name' | 'type' | 'status' | 'planName' | 'hideLabel'>>) => void;
  setRoomLabel: (id: string, p: Point) => void;
  undo: () => void;
  redo: () => void;
  replaceFloor: (plan: FloorPlan) => void;
  importFloor: (plan: FloorPlan) => void;
}

const bundled = loadBundledFloors();

function activeOf(s: MapState): FloorPlan {
  return s.floors.find((f) => f.id === s.activeFloorId) ?? s.floors[0];
}

/** Применить изменение к активному этажу с записью в историю и перепроверкой. */
function withCommit(s: MapState, mutate: (plan: FloorPlan) => FloorPlan, recordHistory = true): Partial<MapState> {
  const current = activeOf(s);
  if (recordHistory) useHistoryStore.getState().push(current.id, current);
  const next = mutate(current);
  return {
    floors: s.floors.map((f) => (f.id === current.id ? next : f)),
    issues: validateFloor(next),
  };
}

function clonePlan(p: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(p)) as FloorPlan;
}

export const useMapStore = create<MapState>((set, get) => ({
  floors: bundled,
  activeFloorId: bundled[0]?.id ?? '',
  selectedRoomId: null,
  hoveredRoomId: null,
  search: '',
  statusFilter: [],
  mode: 'view',
  tool: 'select',
  editor: { grid: 5, snapGrid: true, snapPoints: true, snapAxis: true, showCoords: true, showGrid: true },
  editSel: { pointId: null, wallId: null, doorId: null, pendingPointId: null },
  cursor: null,
  viewBox: bundled[0]?.viewBox ?? { x: 0, y: 0, width: 1600, height: 1000 },
  issues: bundled[0] ? validateFloor(bundled[0]) : [],
  message: null,

  setActiveFloor: (id) =>
    set((s) => {
      const plan = s.floors.find((f) => f.id === id);
      if (!plan) return {};
      return {
        activeFloorId: id,
        selectedRoomId: null,
        hoveredRoomId: null,
        editSel: { pointId: null, wallId: null, doorId: null, pendingPointId: null },
        issues: validateFloor(plan),
      };
    }),
  selectRoom: (id) => set({ selectedRoomId: id }),
  hoverRoom: (id) => set({ hoveredRoomId: id }),
  setSearch: (search) => set({ search }),
  toggleStatusFilter: (st) =>
    set((s) => ({ statusFilter: s.statusFilter.includes(st) ? s.statusFilter.filter((x) => x !== st) : [...s.statusFilter, st] })),
  clearStatusFilter: () => set({ statusFilter: [] }),
  setMode: (mode) => set({ mode, tool: 'select', editSel: { pointId: null, wallId: null, doorId: null, pendingPointId: null } }),
  setTool: (tool) => set({ tool, editSel: { ...get().editSel, pendingPointId: null } }),
  setEditor: (patch) => set((s) => ({ editor: { ...s.editor, ...patch } })),
  setCursor: (cursor) => set({ cursor }),
  setViewBox: (viewBox) => set({ viewBox }),
  fitToScreen: () => set((s) => ({ viewBox: { ...activeOf(s).viewBox } })),
  resetView: () => set((s) => ({ viewBox: { ...activeOf(s).viewBox } })),
  setMessage: (message) => set({ message }),

  selectPoint: (pointId) => set((s) => ({ editSel: { ...s.editSel, pointId, wallId: null, doorId: null } })),
  selectWall: (wallId) => set((s) => ({ editSel: { ...s.editSel, wallId, pointId: null, doorId: null } })),
  selectDoor: (doorId) => set((s) => ({ editSel: { ...s.editSel, doorId, pointId: null, wallId: null } })),

  beginPointDrag: () => {
    const plan = activeOf(get());
    useHistoryStore.getState().push(plan.id, plan);
  },
  movePoint: (id, p) =>
    set((s) => {
      const plan = activeOf(s);
      const next = { ...plan, points: { ...plan.points, [id]: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } } };
      return { floors: s.floors.map((f) => (f.id === plan.id ? next : f)) };
    }),
  endPointDrag: () => set((s) => ({ issues: validateFloor(activeOf(s)) })),

  clickPointForWall: (id) =>
    set((s) => {
      const pending = s.editSel.pendingPointId;
      if (!pending) return { editSel: { ...s.editSel, pendingPointId: id, pointId: id } };
      if (pending === id) return { editSel: { ...s.editSel, pendingPointId: null } };
      const plan = activeOf(s);
      const exists = Object.entries(plan.walls).find(
        ([, w]) => (w.start === pending && w.end === id) || (w.start === id && w.end === pending),
      );
      if (exists) return { editSel: { ...s.editSel, pendingPointId: null, wallId: exists[0] }, message: 'Такая стена уже есть' };
      return {
        ...withCommit(s, (plan) => {
          const next = clonePlan(plan);
          const wid = nextId(next.walls, 'w');
          next.walls[wid] = { start: pending, end: id, type: 'line' };
          return next;
        }),
        editSel: { ...s.editSel, pendingPointId: null },
        message: 'Стена добавлена. Чтобы включить её в контур помещения, отредактируйте boundary в JSON или разделите соседнюю стену.',
      };
    }),

  deleteWall: (id) =>
    set((s) => {
      const plan = activeOf(s);
      const users = plan.rooms.filter((r) => r.boundary.some((b) => b.wallId === id)).map((r) => r.number || r.name);
      if (plan.exterior.some((b) => b.wallId === id)) return { message: 'Нельзя удалить стену внешнего контура' };
      if (users.length) return { message: `Стена используется контурами: ${users.join(', ')} — удаление разорвёт их boundary` };
      return {
        ...withCommit(s, (plan) => {
          const next = clonePlan(plan);
          delete next.walls[id];
          next.doors = next.doors.filter((d) => d.wallId !== id);
          return next;
        }),
        editSel: { ...s.editSel, wallId: null },
        message: 'Стена удалена',
      };
    }),

  splitWall: (id) =>
    set((s) => ({
      ...withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const w = next.walls[id];
        if (!w) return next;
        const a = next.points[w.start];
        const b = next.points[w.end];
        const mid = w.type === 'arc' && w.bulge ? pointOnArc(a, b, w.bulge, 0.5) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const pid = nextId(next.points, 'p');
        next.points[pid] = { x: Math.round(mid.x * 100) / 100, y: Math.round(mid.y * 100) / 100 };
        const halfBulge = w.type === 'arc' && w.bulge ? Math.tan(Math.atan(w.bulge) / 2) : undefined;
        const w1 = nextId(next.walls, 'w');
        next.walls[w1] = { ...w, start: w.start, end: pid, ...(halfBulge !== undefined ? { bulge: halfBulge } : {}) };
        const w2 = nextId(next.walls, 'w');
        next.walls[w2] = { ...w, start: pid, end: w.end, ...(halfBulge !== undefined ? { bulge: halfBulge } : {}) };
        delete next.walls[id];
        const rewrite = (refs: FloorPlan['exterior']) =>
          refs.flatMap((r) =>
            r.wallId !== id
              ? [r]
              : r.direction === 1
                ? [{ wallId: w1, direction: 1 as const }, { wallId: w2, direction: 1 as const }]
                : [{ wallId: w2, direction: -1 as const }, { wallId: w1, direction: -1 as const }],
          );
        for (const r of next.rooms) r.boundary = rewrite(r.boundary);
        next.exterior = rewrite(next.exterior);
        for (const d of next.doors) {
          if (d.wallId !== id) continue;
          if (d.position <= 0.5) {
            d.wallId = w1;
            d.position = d.position * 2;
          } else {
            d.wallId = w2;
            d.position = (d.position - 0.5) * 2;
          }
        }
        return next;
      }),
      editSel: { ...s.editSel, wallId: null },
      message: 'Стена разделена',
    })),

  setWallType: (id, type, bulge) =>
    set((s) =>
      withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const w = next.walls[id];
        if (!w) return next;
        w.type = type;
        if (type === 'arc') w.bulge = bulge ?? (w.bulge && w.bulge !== 0 ? w.bulge : 0.2);
        else delete w.bulge;
        return next;
      }),
    ),

  setWallBulge: (id, bulge) =>
    set((s) =>
      withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const w = next.walls[id];
        if (!w) return next;
        w.type = 'arc';
        w.bulge = Math.max(-0.99, Math.min(0.99, Math.round(bulge * 1000) / 1000)) || 0.01;
        return next;
      }),
    ),

  addDoor: (wallId, position = 0.5) =>
    set((s) => {
      let newId = '';
      const patch = withCommit(s, (plan) => {
        const next = clonePlan(plan);
        newId = nextId(Object.fromEntries(next.doors.map((d) => [d.id, d])), 'd');
        next.doors.push({ id: newId, wallId, position, width: 26, swing: 'left-in' });
        return next;
      });
      return { ...patch, editSel: { ...s.editSel, doorId: newId, wallId: null, pointId: null } };
    }),

  updateDoor: (id, patch) =>
    set((s) =>
      withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const d = next.doors.find((x) => x.id === id);
        if (d) Object.assign(d, patch);
        return next;
      }),
    ),

  deleteDoor: (id) =>
    set((s) => ({
      ...withCommit(s, (plan) => {
        const next = clonePlan(plan);
        next.doors = next.doors.filter((d) => d.id !== id);
        return next;
      }),
      editSel: { ...s.editSel, doorId: null },
    })),

  updateRoom: (id, patch) =>
    set((s) =>
      withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const r = next.rooms.find((x) => x.id === id);
        if (r) Object.assign(r, patch);
        return next;
      }),
    ),

  setRoomLabel: (id, p) =>
    set((s) =>
      withCommit(s, (plan) => {
        const next = clonePlan(plan);
        const r = next.rooms.find((x) => x.id === id);
        if (r) r.label = { ...r.label, x: Math.round(p.x), y: Math.round(p.y) };
        return next;
      }),
    ),

  undo: () =>
    set((s) => {
      const plan = activeOf(s);
      const prev = useHistoryStore.getState().undo(plan.id, plan);
      if (!prev) return {};
      return { floors: s.floors.map((f) => (f.id === plan.id ? prev : f)), issues: validateFloor(prev) };
    }),
  redo: () =>
    set((s) => {
      const plan = activeOf(s);
      const next = useHistoryStore.getState().redo(plan.id, plan);
      if (!next) return {};
      return { floors: s.floors.map((f) => (f.id === plan.id ? next : f)), issues: validateFloor(next) };
    }),

  replaceFloor: (plan) =>
    set((s) => ({
      floors: s.floors.map((f) => (f.id === plan.id ? plan : f)),
      issues: s.activeFloorId === plan.id ? validateFloor(plan) : s.issues,
    })),

  importFloor: (plan) =>
    set((s) => {
      const exists = s.floors.some((f) => f.id === plan.id);
      const floors = exists ? s.floors.map((f) => (f.id === plan.id ? plan : f)) : [...s.floors, plan].sort((a, b) => a.level - b.level);
      useHistoryStore.getState().clear(plan.id);
      return {
        floors,
        activeFloorId: plan.id,
        selectedRoomId: null,
        viewBox: { ...plan.viewBox },
        issues: validateFloor(plan),
        message: exists ? `Этаж «${plan.name}» заменён из файла` : `Этаж «${plan.name}» импортирован`,
      };
    }),
}));

function nextId(dict: Record<string, unknown>, prefix: string): string {
  let n = Object.keys(dict).length + 1;
  while (dict[`${prefix}${n}`]) n++;
  return `${prefix}${n}`;
}

export const selectActiveFloor = (s: MapState) => activeOf(s);
export type { GeometryIssue, DoorSwing };
