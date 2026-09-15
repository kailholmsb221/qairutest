import type { Point } from '@/types/plan';

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

/** Строгое пересечение двух отрезков (касание концами не считается). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  // Коллинеарные наложения считаем пересечением, если перекрытие ненулевое
  const eps = 1e-9;
  if (Math.abs(o1) < eps && Math.abs(o2) < eps) {
    const overlap =
      (onSegment(a, b, c) && !samePoint(c, a) && !samePoint(c, b)) ||
      (onSegment(a, b, d) && !samePoint(d, a) && !samePoint(d, b));
    return overlap;
  }
  return false;
}

export function samePoint(a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/** Есть ли самопересечения у замкнутой полилинии. */
export function polygonSelfIntersects(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // соседние рёбра пропускаем
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Расстояние от точки до отрезка и параметр проекции t∈[0,1]. */
export function distToSegment(p: Point, a: Point, b: Point): { dist: number; t: number; point: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: Math.hypot(p.x - point.x, p.y - point.y), t, point };
}
