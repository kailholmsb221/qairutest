import type { Point } from '@/types/plan';

export interface SnapOptions {
  grid: number;
  snapToGrid: boolean;
  snapToPoints: boolean;
  snapToAxis: boolean;
  /** Порог притяжения в SVG-единицах. */
  threshold: number;
}

export interface SnapResult {
  point: Point;
  snappedTo: 'grid' | 'point' | 'axis' | 'none';
  /** id точки, к которой прилипли */
  pointId?: string;
  /** Опорные направляющие для отображения */
  guides: { axis: 'x' | 'y'; value: number }[];
}

/**
 * Привязка перетаскиваемой точки. Приоритет: соседняя точка → горизонталь/вертикаль
 * относительно связанных точек → сетка.
 */
export function snapPoint(
  raw: Point,
  points: Record<string, Point>,
  excludeId: string | null,
  neighbourIds: string[],
  opts: SnapOptions,
): SnapResult {
  let best: SnapResult = { point: raw, snappedTo: 'none', guides: [] };

  if (opts.snapToPoints) {
    let minD = opts.threshold;
    for (const [id, p] of Object.entries(points)) {
      if (id === excludeId) continue;
      const d = Math.hypot(p.x - raw.x, p.y - raw.y);
      if (d < minD) {
        minD = d;
        best = { point: { ...p }, snappedTo: 'point', pointId: id, guides: [] };
      }
    }
    if (best.snappedTo === 'point') return best;
  }

  let x = raw.x;
  let y = raw.y;
  const guides: SnapResult['guides'] = [];
  let axisSnapped = false;

  if (opts.snapToAxis) {
    for (const nid of neighbourIds) {
      const n = points[nid];
      if (!n) continue;
      if (Math.abs(n.x - x) < opts.threshold) {
        x = n.x;
        guides.push({ axis: 'x', value: n.x });
        axisSnapped = true;
      }
      if (Math.abs(n.y - y) < opts.threshold) {
        y = n.y;
        guides.push({ axis: 'y', value: n.y });
        axisSnapped = true;
      }
    }
  }

  if (opts.snapToGrid) {
    const g = opts.grid;
    if (!guides.some((q) => q.axis === 'x')) x = Math.round(x / g) * g;
    if (!guides.some((q) => q.axis === 'y')) y = Math.round(y / g) * g;
    return { point: { x, y }, snappedTo: axisSnapped ? 'axis' : 'grid', guides };
  }

  return { point: { x, y }, snappedTo: axisSnapped ? 'axis' : 'none', guides };
}

/** Автовыравнивание почти горизонтальной/вертикальной линии. */
export function isAlmostAxisAligned(a: Point, b: Point, tolDeg = 1.5): 'h' | 'v' | null {
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const m = ((ang % 180) + 180) % 180;
  if (m < tolDeg || m > 180 - tolDeg) return 'h';
  if (Math.abs(m - 90) < tolDeg) return 'v';
  return null;
}
