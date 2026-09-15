/**
 * DSL для ручной оцифровки плана в топологическую модель.
 * Точки именуются, стены создаются/переиспользуются автоматически по паре точек,
 * поэтому соседние помещения гарантированно делят одну и ту же стену.
 */
import type {
  BoundaryRef, Door, DoorSwing, FloorPlan, Point, Room, RoomStatus, RoomType, SpecialZone, SpecialZoneKind, Wall,
} from '../src/types/plan';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r5 = (n: number) => Math.round(n * 100000) / 100000;

export interface OutlinePiece {
  kind: 'line' | 'arc';
  from: Point;
  to: Point;
  length: number;
  center?: Point;
  radius?: number;
  a0?: number;
  a1?: number;
}

/** Замкнутый внешний контур как набор кусков; параметр — длина дуги (станция). */
export class Outline {
  pieces: OutlinePiece[] = [];
  total = 0;

  line(from: Point, to: Point) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    this.pieces.push({ kind: 'line', from, to, length });
    this.total += length;
    return this;
  }

  /** Дуга по часовой стрелке (визуально) от угла a0 к a1 (градусы, экранные координаты). */
  arc(center: Point, radius: number, a0deg: number, a1deg: number) {
    const a0 = (a0deg * Math.PI) / 180;
    const a1 = (a1deg * Math.PI) / 180;
    const from = { x: center.x + radius * Math.cos(a0), y: center.y + radius * Math.sin(a0) };
    const to = { x: center.x + radius * Math.cos(a1), y: center.y + radius * Math.sin(a1) };
    const length = Math.abs(a1 - a0) * radius;
    this.pieces.push({ kind: 'arc', from, to, length, center, radius, a0, a1 });
    this.total += length;
    return this;
  }

  locate(station: number): { piece: OutlinePiece; index: number; local: number } {
    let s = ((station % this.total) + this.total) % this.total;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (s <= p.length + 1e-9) return { piece: p, index: i, local: s };
      s -= p.length;
    }
    const last = this.pieces.length - 1;
    return { piece: this.pieces[last], index: last, local: this.pieces[last].length };
  }

  pointAt(station: number): Point {
    const { piece, local } = this.locate(station);
    const t = piece.length === 0 ? 0 : local / piece.length;
    if (piece.kind === 'line') {
      return { x: piece.from.x + (piece.to.x - piece.from.x) * t, y: piece.from.y + (piece.to.y - piece.from.y) * t };
    }
    const ang = piece.a0! + (piece.a1! - piece.a0!) * t;
    return { x: piece.center!.x + piece.radius! * Math.cos(ang), y: piece.center!.y + piece.radius! * Math.sin(ang) };
  }

  pieceStart(index: number): number {
    let s = 0;
    for (let i = 0; i < index; i++) s += this.pieces[i].length;
    return s;
  }

  /** Станция ближайшей точки контура к заданной точке (грубый поиск + уточнение). */
  stationNear(p: Point): number {
    let best = 0;
    let bestD = Infinity;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = (this.total * i) / n;
      const q = this.pointAt(s);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    let step = this.total / n;
    for (let k = 0; k < 30; k++) {
      step /= 2;
      for (const s of [best - step, best + step]) {
        const q = this.pointAt(s);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    return ((best % this.total) + this.total) % this.total;
  }
}

export interface RoomSpec {
  id: string;
  number?: string;
  name: string;
  planName?: string;
  type: RoomType;
  status?: RoomStatus;
  area?: number;
  label?: Partial<Room['label']>;
  hideLabel?: boolean;
}

export class PlanBuilder {
  points: Record<string, Point> = {};
  walls: Record<string, Wall> = {};
  rooms: Room[] = [];
  doors: Door[] = [];
  zones: SpecialZone[] = [];
  exteriorRefs: BoundaryRef[] = [];
  outline: Outline | null = null;
  private wallSeq = 0;
  private wallByPair = new Map<string, string>();
  private stationOf = new Map<string, number>();
  private byCoords = new Map<string, string>();

  constructor(
    public id: string,
    public name: string,
    public level: number,
    public viewBox = { x: 0, y: 0, width: 1600, height: 1000 },
  ) {}

  pt(id: string, x: number, y: number): string {
    if (this.points[id]) {
      const p = this.points[id];
      if (Math.abs(p.x - r2(x)) > 1e-6 || Math.abs(p.y - r2(y)) > 1e-6) {
        throw new Error(`Точка ${id} уже определена с другими координатами (${p.x},${p.y}) vs (${x},${y})`);
      }
      return id;
    }
    this.points[id] = { x: r2(x), y: r2(y) };
    this.byCoords.set(`${r2(x)}_${r2(y)}`, id);
    return id;
  }

  /** id существующей точки с такими координатами (или undefined). */
  findByCoords(x: number, y: number): string | undefined {
    return this.byCoords.get(`${r2(x)}_${r2(y)}`);
  }

  has(id: string) {
    return !!this.points[id];
  }

  get(id: string): Point {
    const p = this.points[id];
    if (!p) throw new Error(`Нет точки ${id}`);
    return p;
  }

  /** Точка в повёрнутой системе координат (origin, angle°) — для наклонных рядов помещений. */
  frame(origin: Point, angleDeg: number) {
    const a = (angleDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return (id: string, u: number, v: number) => this.pt(id, origin.x + u * c - v * s, origin.y + u * s + v * c);
  }

  private pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  wallBetween(a: string, b: string, opts: Partial<Wall> = {}): [string, 1 | -1] {
    this.get(a);
    this.get(b);
    if (a === b) throw new Error(`Стена из точки в саму себя: ${a}`);
    const key = this.pairKey(a, b);
    const existing = this.wallByPair.get(key);
    if (existing) {
      const w = this.walls[existing];
      if (opts.exterior) w.exterior = true;
      if (opts.virtual) w.virtual = true;
      return [existing, w.start === a ? 1 : -1];
    }
    const id = `w${++this.wallSeq}`;
    const wall: Wall = { start: a, end: b, type: opts.type ?? 'line' };
    if (opts.bulge !== undefined) wall.bulge = r5(opts.bulge);
    if (opts.exterior) wall.exterior = true;
    if (opts.virtual) wall.virtual = true;
    this.walls[id] = wall;
    this.wallByPair.set(key, id);
    return [id, 1];
  }

  arc(a: string, b: string, bulge: number, opts: Partial<Wall> = {}) {
    const key = this.pairKey(a, b);
    if (this.wallByPair.has(key)) throw new Error(`Стена ${a}-${b} уже существует`);
    return this.wallBetween(a, b, { ...opts, type: 'arc', bulge });
  }

  wall(a: string, b: string, opts: Partial<Wall> = {}) {
    return this.wallBetween(a, b, opts);
  }

  virtual(a: string, b: string) {
    return this.wallBetween(a, b, { virtual: true });
  }

  private chain(ids: string[]): BoundaryRef[] {
    const refs: BoundaryRef[] = [];
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      if (a === b) continue;
      const [wallId, direction] = this.wallBetween(a, b);
      refs.push({ wallId, direction });
    }
    return refs;
  }

  private polyline(refs: BoundaryRef[]): Point[] {
    const pts: Point[] = [];
    for (const r of refs) {
      const w = this.walls[r.wallId];
      const from = this.points[r.direction === 1 ? w.start : w.end];
      const to = this.points[r.direction === 1 ? w.end : w.start];
      pts.push(from);
      if (w.type === 'arc' && w.bulge) {
        const bulge = w.bulge * r.direction;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const chord = Math.hypot(dx, dy);
        const theta = 4 * Math.atan(Math.abs(bulge));
        const radius = chord / (2 * Math.sin(theta / 2));
        const d = radius * Math.cos(theta / 2);
        const sign = bulge > 0 ? 1 : -1;
        const c = { x: (from.x + to.x) / 2 + sign * (-dy / chord) * d, y: (from.y + to.y) / 2 + sign * (dx / chord) * d };
        const a0 = Math.atan2(from.y - c.y, from.x - c.x);
        for (let i = 1; i < 8; i++) {
          const ang = a0 + (bulge > 0 ? 1 : -1) * theta * (i / 8);
          pts.push({ x: c.x + radius * Math.cos(ang), y: c.y + radius * Math.sin(ang) });
        }
      }
    }
    return pts;
  }

  private signedArea(pts: Point[]) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  private centroid(pts: Point[]): Point {
    const area = this.signedArea(pts);
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

  /** Помещение по списку точек (любого направления обхода — нормализуется по часовой). */
  room(spec: RoomSpec, ids: (string | string[])[]): string {
    const flat = ids.flat();
    let refs = this.chain(flat);
    if (this.signedArea(this.polyline(refs)) < 0) {
      refs = refs.reverse().map((r) => ({ wallId: r.wallId, direction: (r.direction * -1) as 1 | -1 }));
    }
    if (this.rooms.some((r) => r.id === spec.id)) throw new Error(`Дубликат помещения ${spec.id}`);
    const c = this.centroid(this.polyline(refs));
    const label: Room['label'] = { x: r2(spec.label?.x ?? c.x), y: r2(spec.label?.y ?? c.y) };
    if (spec.label?.angle) label.angle = spec.label.angle;
    if (spec.label?.fontSize) label.fontSize = spec.label.fontSize;
    const room: Room = {
      id: spec.id,
      number: spec.number ?? '',
      name: spec.name,
      type: spec.type,
      status: spec.status ?? (isServiceType(spec.type) ? 'service' : 'free'),
      boundary: refs,
      label,
    };
    if (spec.area !== undefined) room.area = spec.area;
    if (spec.planName) room.planName = spec.planName;
    if (spec.hideLabel) room.hideLabel = true;
    this.rooms.push(room);
    return spec.id;
  }

  exterior(ids: (string | string[])[]) {
    let refs = this.chain(ids.flat());
    if (this.signedArea(this.polyline(refs)) < 0) {
      refs = refs.reverse().map((r) => ({ wallId: r.wallId, direction: (r.direction * -1) as 1 | -1 }));
    }
    for (const r of refs) this.walls[r.wallId].exterior = true;
    this.exteriorRefs = refs;
  }

  /** Дверь на стене между точками a и b; position считается от a к b. */
  door(a: string, b: string, position: number, width = 26, swing: DoorSwing = 'left-in'): void {
    const existing = this.wallByPair.get(this.pairKey(a, b));
    if (!existing) throw new Error(`Нет стены между ${a} и ${b} для двери`);
    const wallId = existing;
    const dir: 1 | -1 = this.walls[wallId].start === a ? 1 : -1;
    const pos = dir === 1 ? position : 1 - position;
    let sw = swing;
    if (dir === -1 && swing !== 'double' && swing !== 'none') {
      const map: Record<string, DoorSwing> = {
        'left-in': 'right-in',
        'right-in': 'left-in',
        'left-out': 'right-out',
        'right-out': 'left-out',
      };
      sw = map[swing];
    }
    this.doors.push({ id: `d${this.doors.length + 1}`, wallId, position: r2(pos), width, swing: sw });
  }

  zone(kind: SpecialZoneKind, roomId: string, angle?: number) {
    const z: SpecialZone = { id: `z${this.zones.length + 1}`, kind, roomId };
    if (angle !== undefined) z.angle = angle;
    this.zones.push(z);
  }

  // ---------- Внешний контур ----------
  useOutline(o: Outline) {
    this.outline = o;
  }

  /** Именованная точка на контуре по станции. */
  op(id: string, station: number): string {
    if (!this.outline) throw new Error('Контур не задан');
    const s = ((station % this.outline.total) + this.outline.total) % this.outline.total;
    const p = this.outline.pointAt(s);
    this.stationOf.set(id, s);
    return this.pt(id, p.x, p.y);
  }

  /** Точка контура, ближайшая к заданной (например, проекция внутренней стены на фасад). */
  opNear(id: string, x: number, y: number): string {
    if (!this.outline) throw new Error('Контур не задан');
    return this.op(id, this.outline.stationNear({ x, y }));
  }

  /**
   * Цепочка точек контура от a до b по часовой стрелке; промежуточные точки
   * ставятся на стыках кусков, дуговые стены получают корректный bulge.
   */
  span(aId: string, bId: string): string[] {
    const o = this.outline;
    if (!o) throw new Error('Контур не задан');
    const sa = this.stationOf.get(aId);
    const sb0 = this.stationOf.get(bId);
    if (sa === undefined || sb0 === undefined) throw new Error(`Точки ${aId}/${bId} не на контуре`);
    let sb = sb0;
    if (sb <= sa + 1e-9) sb += o.total;
    const stations: { id: string; s: number }[] = [{ id: aId, s: sa }];
    for (let i = 0; i < o.pieces.length; i++) {
      for (const k of [0, 1]) {
        const s = o.pieceStart(i) + k * o.total;
        if (s > sa + 1e-6 && s < sb - 1e-6) {
          const id = `ol${i}`;
          this.op(id, s);
          stations.push({ id, s });
        }
      }
    }
    stations.sort((p, q) => p.s - q.s);
    stations.push({ id: bId, s: sb });
    for (let i = 0; i < stations.length - 1; i++) {
      const from = stations[i];
      const to = stations[i + 1];
      const key = this.pairKey(from.id, to.id);
      if (this.wallByPair.has(key)) {
        this.walls[this.wallByPair.get(key)!].exterior = true;
        continue;
      }
      const { piece } = o.locate((from.s + to.s) / 2);
      if (piece.kind === 'arc') {
        const theta = (to.s - from.s) / piece.radius!;
        this.arc(from.id, to.id, Math.tan(theta / 4), { exterior: true });
      } else {
        this.wall(from.id, to.id, { exterior: true });
      }
    }
    return stations.map((s) => s.id);
  }

  build(): FloorPlan {
    return {
      id: this.id,
      name: this.name,
      level: this.level,
      viewBox: this.viewBox,
      points: this.points,
      walls: this.walls,
      rooms: this.rooms,
      exterior: this.exteriorRefs,
      doors: this.doors,
      specialZones: this.zones,
    };
  }
}

function isServiceType(t: RoomType) {
  return ['wc', 'stairs', 'lift', 'tech', 'corridor', 'service', 'lobby', 'storage'].includes(t);
}
