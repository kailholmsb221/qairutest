import type { Point } from '@/types/plan';

interface Props {
  poly: Point[];
}

/** Лифтовая шахта: внутренний прямоугольник с диагоналями. */
export function LiftShape({ poly }: Props) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const inset = Math.min(maxX - minX, maxY - minY) * 0.18;
  const x0 = minX + inset, y0 = minY + inset, x1 = maxX - inset, y1 = maxY - inset;
  return (
    <g className="lift" pointerEvents="none">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} vectorEffect="non-scaling-stroke" />
      <line x1={x0} y1={y0} x2={x1} y2={y1} vectorEffect="non-scaling-stroke" />
      <line x1={x1} y1={y0} x2={x0} y2={y1} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
