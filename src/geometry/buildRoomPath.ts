import type { BoundaryRef, FloorPlan, Point, Wall } from '@/types/plan';
import { arcSvgCommand, fmt, sampleArc } from './bulgeToArc';

export interface ResolvedSegment {
  wallId: string;
  direction: 1 | -1;
  wall: Wall;
  from: Point;
  to: Point;
  fromId: string;
  toId: string;
  /** bulge с учётом направления обхода */
  bulge: number;
}

/** Разворачивает ссылки boundary в упорядоченные сегменты с реальными точками. */
export function resolveBoundary(plan: FloorPlan, boundary: BoundaryRef[]): ResolvedSegment[] {
  const out: ResolvedSegment[] = [];
  for (const ref of boundary) {
    const wall = plan.walls[ref.wallId];
    if (!wall) continue;
    const fromId = ref.direction === 1 ? wall.start : wall.end;
    const toId = ref.direction === 1 ? wall.end : wall.start;
    const from = plan.points[fromId];
    const to = plan.points[toId];
    if (!from || !to) continue;
    const bulge = wall.type === 'arc' ? (wall.bulge ?? 0) * ref.direction : 0;
    out.push({ wallId: ref.wallId, direction: ref.direction, wall, from, to, fromId, toId, bulge });
  }
  return out;
}

/** Замкнутый SVG path из boundary. Дуги — настоящими командами A. */
export function buildRoomPath(plan: FloorPlan, boundary: BoundaryRef[]): string {
  const segs = resolveBoundary(plan, boundary);
  if (segs.length === 0) return '';
  const parts: string[] = [`M ${fmt(segs[0].from.x)} ${fmt(segs[0].from.y)}`];
  for (const s of segs) {
    if (s.bulge !== 0) parts.push(arcSvgCommand(s.from, s.to, s.bulge));
    else parts.push(`L ${fmt(s.to.x)} ${fmt(s.to.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Полилиния (дуги аппроксимированы) — для площади, центроида, попадания. */
export function boundaryPolyline(plan: FloorPlan, boundary: BoundaryRef[], arcSegments = 10): Point[] {
  const segs = resolveBoundary(plan, boundary);
  const pts: Point[] = [];
  for (const s of segs) {
    pts.push(s.from);
    if (s.bulge !== 0) pts.push(...sampleArc(s.from, s.to, s.bulge, arcSegments));
  }
  return pts;
}

/** SVG path одной стены (отрезок или дуга). */
export function wallPath(plan: FloorPlan, wall: Wall): string {
  const a = plan.points[wall.start];
  const b = plan.points[wall.end];
  if (!a || !b) return '';
  if (wall.type === 'arc' && wall.bulge) return `M ${fmt(a.x)} ${fmt(a.y)} ${arcSvgCommand(a, b, wall.bulge)}`;
  return `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`;
}

/** Площадь многоугольника со знаком (положительная — обход по часовой в экранных координатах). */
export function signedArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function centroid(pts: Point[]): Point {
  const area = signedArea(pts);
  if (Math.abs(area) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function bbox(pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
