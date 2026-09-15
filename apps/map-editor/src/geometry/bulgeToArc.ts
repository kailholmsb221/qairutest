import type { Point } from '@/types/plan';

export interface ArcParams {
  center: Point;
  radius: number;
  /** Угол начала (рад) */
  startAngle: number;
  /** Угол конца (рад) */
  endAngle: number;
  /** Дуга обходится по часовой стрелке (в экранных координатах y вниз). */
  clockwise: boolean;
  largeArc: boolean;
}

/**
 * bulge = tan(θ/4), где θ — центральный угол дуги.
 * Положительный bulge — дуга выпуклая вправо от направления start→end
 * (в экранных координатах это обход против часовой в математическом смысле).
 */
export function bulgeToArc(a: Point, b: Point, bulge: number): ArcParams {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));
  // Расстояние от середины хорды до центра
  const d = radius * Math.cos(theta / 2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Нормаль к хорде
  const nx = -dy / chord;
  const ny = dx / chord;
  const sign = bulge > 0 ? 1 : -1;
  const center = { x: mx + sign * nx * d, y: my + sign * ny * d };
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const endAngle = Math.atan2(b.y - center.y, b.x - center.x);
  return {
    center,
    radius,
    startAngle,
    endAngle,
    clockwise: bulge > 0,
    largeArc: Math.abs(bulge) > 1,
  };
}

/** Сегмент SVG-пути «A» для дуги от a к b. */
export function arcSvgCommand(a: Point, b: Point, bulge: number): string {
  const { radius, largeArc, clockwise } = bulgeToArc(a, b, bulge);
  const sweep = clockwise ? 1 : 0;
  return `A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc ? 1 : 0} ${sweep} ${fmt(b.x)} ${fmt(b.y)}`;
}

/** Точки на дуге (для расчёта площади, попадания, самопересечений). */
export function sampleArc(a: Point, b: Point, bulge: number, segments = 12): Point[] {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const pts: Point[] = [];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
    pts.push({ x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) });
  }
  return pts;
}

/** Точка на дуге по параметру t∈[0,1]. */
export function pointOnArc(a: Point, b: Point, bulge: number, t: number): Point {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  return { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) };
}

/** Касательная (единичная) к дуге в параметре t, направлена от a к b. */
export function arcTangent(a: Point, b: Point, bulge: number, t: number): Point {
  const { startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  const s = clockwise ? 1 : -1;
  return { x: -Math.sin(ang) * s, y: Math.cos(ang) * s };
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
