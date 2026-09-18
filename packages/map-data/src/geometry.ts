/**
 * Чистая геометрия оцифровки — перенос из apps/map-editor/src/geometry (buildRoomPath, bulgeToArc, doorGeometry)
 * и из svg-компонентов редактора (DoorShape, StairShape, RoomLabel) без изменения формул,
 * чтобы vector-map.json совпадал с тем, что рисует редактор.
 */
import type { BoundaryRef, Door, Point, VectorFloorPlan, Wall } from './types';

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

interface ArcParams { center: Point; radius: number; startAngle: number; endAngle: number; clockwise: boolean; largeArc: boolean }

export function bulgeToArc(a: Point, b: Point, bulge: number): ArcParams {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));
  const d = radius * Math.cos(theta / 2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const sign = bulge > 0 ? 1 : -1;
  const center = { x: mx + sign * nx * d, y: my + sign * ny * d };
  return {
    center,
    radius,
    startAngle: Math.atan2(a.y - center.y, a.x - center.x),
    endAngle: Math.atan2(b.y - center.y, b.x - center.x),
    clockwise: bulge > 0,
    largeArc: Math.abs(bulge) > 1,
  };
}

export function arcSvgCommand(a: Point, b: Point, bulge: number): string {
  const { radius, largeArc, clockwise } = bulgeToArc(a, b, bulge);
  return `A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc ? 1 : 0} ${clockwise ? 1 : 0} ${fmt(b.x)} ${fmt(b.y)}`;
}

export function sampleArc(a: Point, b: Point, bulge: number, segments = 12): Point[] {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const pts: Point[] = [];
  for (let i = 1; i < segments; i++) {
    const ang = startAngle + (clockwise ? 1 : -1) * theta * (i / segments);
    pts.push({ x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) });
  }
  return pts;
}

export function pointOnArc(a: Point, b: Point, bulge: number, t: number): Point {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  return { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) };
}

export function arcTangent(a: Point, b: Point, bulge: number, t: number): Point {
  const { startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  const s = clockwise ? 1 : -1;
  return { x: -Math.sin(ang) * s, y: Math.cos(ang) * s };
}

interface ResolvedSegment { wall: Wall; from: Point; to: Point; bulge: number }

export function resolveBoundary(plan: VectorFloorPlan, boundary: BoundaryRef[]): ResolvedSegment[] {
  const out: ResolvedSegment[] = [];
  for (const ref of boundary) {
    const wall = plan.walls[ref.wallId];
    if (!wall) continue;
    const from = plan.points[ref.direction === 1 ? wall.start : wall.end];
    const to = plan.points[ref.direction === 1 ? wall.end : wall.start];
    if (!from || !to) continue;
    out.push({ wall, from, to, bulge: wall.type === 'arc' ? (wall.bulge ?? 0) * ref.direction : 0 });
  }
  return out;
}

function ringPath(plan: VectorFloorPlan, boundary: BoundaryRef[]): string {
  const segs = resolveBoundary(plan, boundary);
  if (segs.length === 0) return '';
  const parts = [`M ${fmt(segs[0].from.x)} ${fmt(segs[0].from.y)}`];
  for (const s of segs) parts.push(s.bulge !== 0 ? arcSvgCommand(s.from, s.to, s.bulge) : `L ${fmt(s.to.x)} ${fmt(s.to.y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/** Замкнутый path помещения: внешнее кольцо + кольца-дыры (обход дыр противоположен внешнему, заливка evenodd/nonzero равнозначны). */
export function buildRoomPath(plan: VectorFloorPlan, boundary: BoundaryRef[], holes: BoundaryRef[][] = []): string {
  const outer = ringPath(plan, boundary);
  if (!outer) return '';
  return [outer, ...holes.map((h) => ringPath(plan, h)).filter(Boolean)].join(' ');
}

/** Площадь помещения с учётом дыр (по полилиниям). */
export function roomArea(plan: VectorFloorPlan, boundary: BoundaryRef[], holes: BoundaryRef[][] = []): number {
  const outer = Math.abs(signedArea(boundaryPolyline(plan, boundary)));
  return holes.reduce((s, h) => s - Math.abs(signedArea(boundaryPolyline(plan, h))), outer);
}

export function boundaryPolyline(plan: VectorFloorPlan, boundary: BoundaryRef[], arcSegments = 10): Point[] {
  const pts: Point[] = [];
  for (const s of resolveBoundary(plan, boundary)) {
    pts.push(s.from);
    if (s.bulge !== 0) pts.push(...sampleArc(s.from, s.to, s.bulge, arcSegments));
  }
  return pts;
}

export function wallPath(plan: VectorFloorPlan, wall: Wall): string {
  const a = plan.points[wall.start];
  const b = plan.points[wall.end];
  if (!a || !b) return '';
  if (wall.type === 'arc' && wall.bulge) return `M ${fmt(a.x)} ${fmt(a.y)} ${arcSvgCommand(a, b, wall.bulge)}`;
  return `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`;
}

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
  let cx = 0, cy = 0;
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

export interface DoorGeometry { center: Point; along: Point; normal: Point; a: Point; b: Point }

export function doorGeometry(plan: VectorFloorPlan, door: Door): DoorGeometry | null {
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
  return { center, along, normal, a: { x: center.x - along.x * h, y: center.y - along.y * h }, b: { x: center.x + along.x * h, y: center.y + along.y * h } };
}

/** Дуги полотен двери — те же формулы, что в apps/map-editor DoorShape. */
export function doorLeaves(door: Door, g: DoorGeometry): string[] {
  const { a, b, along, normal } = g;
  const w = door.width;
  const dir = door.swing.endsWith('out') ? -1 : 1;
  const leaves: string[] = [];
  const leaf = (hinge: Point, sign: number, len: number) => {
    const tip = { x: hinge.x + normal.x * dir * len, y: hinge.y + normal.y * dir * len };
    const end = { x: hinge.x + along.x * sign * len, y: hinge.y + along.y * sign * len };
    const sweep = (sign === 1) === (dir === 1) ? 0 : 1;
    leaves.push(`M ${fmt(hinge.x)} ${fmt(hinge.y)} L ${fmt(tip.x)} ${fmt(tip.y)} A ${fmt(len)} ${fmt(len)} 0 0 ${sweep} ${fmt(end.x)} ${fmt(end.y)}`);
  };
  switch (door.swing) {
    case 'left-in':
    case 'left-out':
      leaf(a, 1, w);
      break;
    case 'right-in':
    case 'right-out':
      leaf(b, -1, w);
      break;
    case 'double':
      leaf(a, 1, w / 2);
      leaf(b, -1, w / 2);
      break;
    default:
      break;
  }
  return leaves;
}

/** Лестничный марш (ступени + стрелка) — перенос StairShape. */
export function stairPaths(poly: Point[], angle: number): { steps: string; arrow: string } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = (maxX - minX) * 0.7;
  const h = (maxY - minY) * 0.7;
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const vx = -uy, vy = ux;
  const len = Math.abs(ux) * w + Math.abs(uy) * h;
  const wid = Math.abs(vx) * w + Math.abs(vy) * h;
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
  return { steps: lines.join(' '), arrow };
}

/** Подпись помещения — перенос RoomLabel: те же размеры шрифта, сокращение и условия показа. */
const CHAR_W = 0.58;
function shorten(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  const words = name.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).trim().length > maxChars - 1) break;
    out = (out + ' ' + w).trim();
  }
  return (out || name.slice(0, maxChars - 1)) + '…';
}
export interface LabelLayout { fs: number; secFs: number; primary: string; secondary: string; angle: number }
export function labelLayout(
  plan: VectorFloorPlan,
  room: { number: string; name: string; boundary: BoundaryRef[]; label: { angle?: number; fontSize?: number; numberOnly?: boolean } },
): LabelLayout | null {
  const poly = boundaryPolyline(plan, room.boundary);
  if (poly.length < 3) return null;
  const b = bbox(poly);
  const angle = room.label.angle ?? 0;
  const rotated = Math.abs(angle) === 90;
  const availW = (rotated ? b.maxY - b.minY : b.maxX - b.minX) - 8;
  const availH = (rotated ? b.maxX - b.minX : b.maxY - b.minY) - 6;
  const primary = room.number || room.name;
  const secondary = room.number && !room.label.numberOnly && room.name.toLowerCase() !== room.number.toLowerCase() ? room.name : '';
  let fs = room.label.fontSize ?? Math.min(14, Math.max(6, availH / 3.2));
  const fitFont = (text: string, base: number, min: number) => {
    const need = text.length * CHAR_W * base;
    return need <= availW ? base : Math.max(min, availW / (text.length * CHAR_W));
  };
  fs = fitFont(primary, fs, 5);
  const showPrimary = fs >= 5 && availH >= fs;
  if (!showPrimary) return null;
  let secFs = Math.max(4.5, fs * 0.62);
  let secText = secondary;
  if (secText) {
    const maxChars = Math.floor(availW / (CHAR_W * secFs));
    if (maxChars < 6 || availH < fs + secFs + 2) secText = '';
    else secText = shorten(secText, maxChars);
  }
  if (!secText) secFs = 0;
  return { fs, secFs, primary, secondary: secText, angle };
}
