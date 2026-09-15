import type { Door, FloorPlan, Point } from '@/types/plan';
import { arcTangent, pointOnArc } from './bulgeToArc';

export interface DoorGeometry {
  /** центр проёма */
  center: Point;
  /** единичный вектор вдоль стены */
  along: Point;
  /** единичная нормаль (в сторону "in") */
  normal: Point;
  a: Point;
  b: Point;
}

/** Положение проёма на стене (прямой или дуговой). */
export function doorGeometry(plan: FloorPlan, door: Door): DoorGeometry | null {
  const w = plan.walls[door.wallId];
  if (!w) return null;
  const p0 = plan.points[w.start];
  const p1 = plan.points[w.end];
  if (!p0 || !p1) return null;
  let center: Point;
  let along: Point;
  if (w.type === 'arc' && w.bulge) {
    center = pointOnArc(p0, p1, w.bulge, door.position);
    along = arcTangent(p0, p1, w.bulge, door.position);
  } else {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    along = { x: dx / len, y: dy / len };
    center = { x: p0.x + dx * door.position, y: p0.y + dy * door.position };
  }
  const normal = { x: -along.y, y: along.x };
  const h = door.width / 2;
  return {
    center,
    along,
    normal,
    a: { x: center.x - along.x * h, y: center.y - along.y * h },
    b: { x: center.x + along.x * h, y: center.y + along.y * h },
  };
}
