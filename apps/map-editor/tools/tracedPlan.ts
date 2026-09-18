/**
 * Сборка FloorPlan из топологии чертежа (tools/traced/<floor>.json, см. svg2plan.py):
 * штрихи чертежа, точки, стены, грани (с дырами), контур берутся как есть; идентичность
 * помещений назначается таблицей «точка внутри грани → id/номер/название/тип».
 * Грани без записи получают тип по классификации конвертера (коридор / тип из конфигурации /
 * служебное) и имя «Коридор»/«Холл»/«Помещение».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BoundaryRef, FloorPlan, Point, Room, RoomStatus, RoomType, SpecialZone, Stroke, Wall } from '../src/types/plan';

export type TracedKind = 'room' | 'corridor' | 'space';

export interface TracedLabel {
  x: number;
  y: number;
  angle: number;
  /** высота цифр в единицах холста */
  glyph: number;
  /** текст подписи на чертеже */
  text?: string;
}

export interface TracedRegion {
  id: string;
  kind: TracedKind;
  /** тип из конфигурации конвертера для безымянных граней (hall/lobby/stairs/…) */
  type?: RoomType | null;
  /** код подписи/якоря (справочно; идентичность задаётся таблицей ниже) */
  code?: string | null;
  area: number;
  centroid: Point;
  label: TracedLabel | null;
  boundary: BoundaryRef[];
  holes?: BoundaryRef[][];
}

export interface Traced {
  id: string;
  viewBox: FloorPlan['viewBox'];
  source: Record<string, unknown>;
  strokes: Stroke[];
  points: { id: string; x: number; y: number }[];
  walls: ({ id: string } & Wall)[];
  rooms: TracedRegion[];
  exterior: BoundaryRef[];
  doors: FloorPlan['doors'];
}

export interface Identity {
  /** точка холста внутри грани */
  at: [number, number];
  id: string;
  number?: string;
  name: string;
  type: RoomType;
  status?: RoomStatus;
  hideLabel?: boolean;
  /** подпись: по умолчанию — из чертежа (позиция, угол, размер) */
  label?: Partial<Room['label']>;
}

export interface TracedBuildOptions {
  name: string;
  level: number;
  prefix: string;
  identity: Identity[];
}

export function loadTraced(floorId: string): Traced {
  const file = resolve(process.cwd(), 'tools/traced', `${floorId}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Traced;
}

function ringOf(refs: BoundaryRef[], pts: Record<string, Point>, walls: Record<string, Wall>): Point[] {
  const out: Point[] = [];
  for (const r of refs) {
    const w = walls[r.wallId];
    out.push(pts[r.direction === 1 ? w.start : w.end]);
  }
  return out;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Точка внутри грани: внутри внешнего кольца и вне дыр. */
function pointInRegion(p: Point, outer: Point[], holes: Point[][]): boolean {
  return pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h));
}

const SERVICE_TYPES: RoomType[] = ['wc', 'stairs', 'lift', 'tech', 'corridor', 'service', 'lobby', 'storage'];
const UNNAMED: Record<string, { type: RoomType; name: string }> = {
  corridor: { type: 'corridor', name: 'Коридор' },
  hall: { type: 'hall', name: 'Холл' },
  lobby: { type: 'lobby', name: 'Тамбур' },
  stairs: { type: 'stairs', name: 'Лестница' },
  tech: { type: 'tech', name: 'Техническое помещение' },
  service: { type: 'service', name: 'Помещение' },
};

/** Размер шрифта по высоте цифр на чертеже (высота заглавных ≈ 0.72 em). */
export const fontSizeFromGlyph = (glyph: number) => Math.round(glyph / 0.72);

export function buildFromTraced(t: Traced, o: TracedBuildOptions): { plan: FloorPlan; report: { unnamed: number; identified: number } } {
  const points: Record<string, Point> = {};
  for (const p of t.points) points[p.id] = { x: p.x, y: p.y };
  const walls: Record<string, Wall> = {};
  for (const { id, ...w } of t.walls) walls[id] = w;

  const shapes = new Map<string, { outer: Point[]; holes: Point[][] }>();
  for (const r of t.rooms) shapes.set(r.id, { outer: ringOf(r.boundary, points, walls), holes: (r.holes ?? []).map((h) => ringOf(h, points, walls)) });

  const used = new Set<string>();
  const byRegion = new Map<string, Identity>();
  for (const ident of o.identity) {
    const p = { x: ident.at[0], y: ident.at[1] };
    const hits = t.rooms.filter((r) => {
      const s = shapes.get(r.id)!;
      return pointInRegion(p, s.outer, s.holes);
    });
    const hit = hits.sort((a, b) => a.area - b.area)[0];
    if (!hit) throw new Error(`${o.prefix}: точка (${ident.at}) для ${ident.id} не попала ни в одну грань`);
    if (byRegion.has(hit.id)) throw new Error(`${o.prefix}: грань ${hit.id} назначена дважды (${byRegion.get(hit.id)!.id}, ${ident.id})`);
    if (used.has(ident.id)) throw new Error(`${o.prefix}: дубликат id ${ident.id}`);
    used.add(ident.id);
    byRegion.set(hit.id, ident);
  }
  for (const r of t.rooms) {
    if (r.kind === 'room' && !byRegion.has(r.id)) throw new Error(`${o.prefix}: подписанная грань ${r.id} (${r.label?.text ?? r.code}) не имеет записи в таблице идентичности`);
  }

  const rooms: Room[] = [];
  let unnamed = 0;
  for (const r of t.rooms) {
    const ident = byRegion.get(r.id);
    let id: string;
    let number = '';
    let name: string;
    let type: RoomType;
    let hideLabel: boolean;
    let status: RoomStatus | undefined;
    let labelOverride: Partial<Room['label']> | undefined;
    if (ident) {
      id = ident.id;
      number = ident.number ?? '';
      name = ident.name;
      type = ident.type;
      hideLabel = ident.hideLabel ?? !r.label;
      status = ident.status;
      labelOverride = ident.label;
    } else {
      unnamed++;
      const key = r.kind === 'corridor' ? 'corridor' : (r.type && r.type in UNNAMED ? r.type : 'service');
      const u = UNNAMED[key];
      type = u.type;
      name = u.name;
      const cx = Math.round(r.centroid.x / 10) * 10;
      const cy = Math.round(r.centroid.y / 10) * 10;
      id = `${o.prefix}-${key}-${cx}-${cy}`;
      hideLabel = true;
    }
    const label: Room['label'] = r.label
      ? { x: r.label.x, y: r.label.y, angle: r.label.angle || undefined, fontSize: fontSizeFromGlyph(r.label.glyph), numberOnly: true }
      : { x: r.centroid.x, y: r.centroid.y };
    if (!label.angle) delete label.angle;
    Object.assign(label, labelOverride ?? {});
    // площадь в единицах viewBox не переводится в м² — у чертежа нет масштаба, поле остаётся пустым
    const room: Room = {
      id,
      number,
      name,
      type,
      status: status ?? (SERVICE_TYPES.includes(type) ? 'service' : 'free'),
      boundary: r.boundary,
      label,
    };
    if (r.holes && r.holes.length) room.holes = r.holes;
    if (hideLabel) room.hideLabel = true;
    rooms.push(room);
  }

  const zones: SpecialZone[] = [];
  for (const r of rooms) if (r.type === 'wc') zones.push({ id: `z${zones.length + 1}`, kind: 'wc', roomId: r.id });
  for (const r of rooms) if (r.type === 'tech') zones.push({ id: `z${zones.length + 1}`, kind: 'shaft', roomId: r.id });

  const plan: FloorPlan = {
    id: t.id,
    name: o.name,
    level: o.level,
    viewBox: t.viewBox,
    points,
    walls,
    rooms,
    exterior: t.exterior,
    doors: t.doors,
    specialZones: zones,
    strokes: t.strokes,
  };
  return { plan, report: { unnamed, identified: byRegion.size } };
}
