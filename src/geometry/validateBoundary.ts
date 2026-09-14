import type { FloorPlan, Room } from '@/types/plan';
import { boundaryPolyline, resolveBoundary, signedArea } from './buildRoomPath';
import { polygonSelfIntersects, samePoint } from './intersections';
import { isAlmostAxisAligned } from './snapping';

export type IssueLevel = 'error' | 'warning';

export interface GeometryIssue {
  level: IssueLevel;
  code:
    | 'missing-ref'
    | 'not-chained'
    | 'not-closed'
    | 'zero-area'
    | 'self-intersection'
    | 'non-finite'
    | 'almost-axis'
    | 'gap'
    | 'unshared-wall'
    | 'exterior-open';
  roomId?: string;
  wallId?: string;
  message: string;
}

/** Полная проверка этажа: замкнутость, площадь, самопересечения, щели, выравнивание. */
export function validateFloor(plan: FloorPlan): GeometryIssue[] {
  const issues: GeometryIssue[] = [];

  for (const [id, p] of Object.entries(plan.points)) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      issues.push({ level: 'error', code: 'non-finite', message: `Точка ${id} имеет неконечные координаты` });
    }
  }

  for (const [id, w] of Object.entries(plan.walls)) {
    const a = plan.points[w.start];
    const b = plan.points[w.end];
    if (!a || !b) {
      issues.push({ level: 'error', code: 'missing-ref', wallId: id, message: `Стена ${id} ссылается на несуществующую точку` });
      continue;
    }
    if (w.type === 'line' && !samePoint(a, b)) {
      const al = isAlmostAxisAligned(a, b);
      const exactlyH = a.y === b.y;
      const exactlyV = a.x === b.x;
      if (al === 'h' && !exactlyH) issues.push({ level: 'warning', code: 'almost-axis', wallId: id, message: `Стена ${id} почти горизонтальна (${(a.y - b.y).toFixed(2)})` });
      if (al === 'v' && !exactlyV) issues.push({ level: 'warning', code: 'almost-axis', wallId: id, message: `Стена ${id} почти вертикальна (${(a.x - b.x).toFixed(2)})` });
    }
  }

  for (const room of plan.rooms) issues.push(...validateRoom(plan, room));
  issues.push(...validateChain(plan, plan.exterior, undefined, 'exterior-open'));

  // Общие стены: каждая внутренняя стена должна использоваться ровно двумя контурами
  // в противоположных направлениях (или одним + внешний контур).
  const usage = new Map<string, { dirs: number[]; owners: string[] }>();
  const addUse = (owner: string, wallId: string, dir: number) => {
    const u = usage.get(wallId) ?? { dirs: [], owners: [] };
    u.dirs.push(dir);
    u.owners.push(owner);
    usage.set(wallId, u);
  };
  for (const r of plan.rooms) for (const b of r.boundary) addUse(r.id, b.wallId, b.direction);
  for (const b of plan.exterior) addUse('exterior', b.wallId, -b.direction);
  for (const [wallId, u] of usage) {
    const w = plan.walls[wallId];
    if (!w) continue;
    if (u.dirs.length === 2 && u.dirs[0] === u.dirs[1]) {
      issues.push({ level: 'warning', code: 'unshared-wall', wallId, message: `Стена ${wallId} обходится в одном направлении обоими контурами (${u.owners.join(', ')}) — возможен неверный порядок` });
    }
    if (u.dirs.length > 2) {
      issues.push({ level: 'warning', code: 'unshared-wall', wallId, message: `Стена ${wallId} используется ${u.dirs.length} контурами` });
    }
    if (u.dirs.length === 1 && !w.exterior && u.owners[0] !== 'exterior') {
      issues.push({ level: 'warning', code: 'gap', wallId, message: `Стена ${wallId} (${u.owners[0]}) не имеет соседа с другой стороны — возможна щель или незаполненная область` });
    }
  }

  return issues;
}

export function validateRoom(plan: FloorPlan, room: Room): GeometryIssue[] {
  const issues = validateChain(plan, room.boundary, room.id, 'not-closed');
  if (issues.some((i) => i.level === 'error')) return issues;
  const poly = boundaryPolyline(plan, room.boundary);
  const area = signedArea(poly);
  if (Math.abs(area) < 1e-6) {
    issues.push({ level: 'error', code: 'zero-area', roomId: room.id, message: `Помещение ${room.id}: нулевая площадь` });
  }
  if (polygonSelfIntersects(poly)) {
    issues.push({ level: 'error', code: 'self-intersection', roomId: room.id, message: `Помещение ${room.id}: контур пересекает сам себя` });
  }
  return issues;
}

function validateChain(
  plan: FloorPlan,
  boundary: Room['boundary'],
  roomId: string | undefined,
  closeCode: 'not-closed' | 'exterior-open',
): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const label = roomId ? `Помещение ${roomId}` : 'Внешний контур';
  for (const b of boundary) {
    if (!plan.walls[b.wallId]) {
      issues.push({ level: 'error', code: 'missing-ref', roomId, wallId: b.wallId, message: `${label}: нет стены ${b.wallId}` });
    }
  }
  if (issues.length) return issues;
  const segs = resolveBoundary(plan, boundary);
  if (segs.length < 3) {
    issues.push({ level: 'error', code: closeCode, roomId, message: `${label}: меньше трёх сегментов` });
    return issues;
  }
  for (let i = 0; i < segs.length; i++) {
    const cur = segs[i];
    const next = segs[(i + 1) % segs.length];
    if (cur.toId !== next.fromId) {
      const code = i === segs.length - 1 ? closeCode : 'not-chained';
      issues.push({
        level: 'error',
        code,
        roomId,
        wallId: cur.wallId,
        message: `${label}: конец ${cur.wallId} (${cur.toId}) не совпадает с началом ${next.wallId} (${next.fromId})`,
      });
    }
  }
  return issues;
}

/** Ориентация контура: true — по часовой стрелке (положительная площадь в экранных координатах). */
export function isClockwise(plan: FloorPlan, boundary: Room['boundary']): boolean {
  return signedArea(boundaryPolyline(plan, boundary)) > 0;
}
