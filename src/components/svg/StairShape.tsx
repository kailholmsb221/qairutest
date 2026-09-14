import type { Point } from '@/types/plan';
import { fmt } from '@/geometry/bulgeToArc';

interface Props {
  poly: Point[];
  angle: number;
}

/** Лестничный марш: ступени поперёк направления, стрелка вдоль. */
export function StairShape({ poly, angle }: Props) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = (maxX - minX) * 0.7;
  const h = (maxY - minY) * 0.7;
  // Локальная система: u — вдоль марша, v — поперёк
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const vx = -uy, vy = ux;
  const len = Math.abs(ux) * w + Math.abs(uy) * h;   // длина по направлению
  const wid = Math.abs(vx) * w + Math.abs(vy) * h;   // ширина марша
  const step = 9;
  const n = Math.max(3, Math.floor(len / step));
  const lines: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    const px = cx + ux * t, py = cy + uy * t;
    lines.push(`M ${fmt(px - vx * wid / 2)} ${fmt(py - vy * wid / 2)} L ${fmt(px + vx * wid / 2)} ${fmt(py + vy * wid / 2)}`);
  }
  const ax = cx - ux * len / 2, ay = cy - uy * len / 2;
  const bx = cx + ux * len / 2, by = cy + uy * len / 2;
  const arrow = `M ${fmt(ax)} ${fmt(ay)} L ${fmt(bx)} ${fmt(by)} M ${fmt(bx - ux * 6 - vx * 4)} ${fmt(by - uy * 6 - vy * 4)} L ${fmt(bx)} ${fmt(by)} L ${fmt(bx - ux * 6 + vx * 4)} ${fmt(by - uy * 6 + vy * 4)}`;
  return (
    <g className="stairs" pointerEvents="none">
      <path d={lines.join(' ')} className="stairs-steps" vectorEffect="non-scaling-stroke" />
      <path d={arrow} className="stairs-arrow" vectorEffect="non-scaling-stroke" />
    </g>
  );
}
