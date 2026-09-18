/**
 * vector/floor-*.json + room-codes.json  →  building-a.json (идентичность) + vector-map.json (геометрия) + docs/BUILDING.md.
 *
 *   pnpm map:build            — собрать артефакты
 *   pnpm map:build -- --check — только проверить, что артефакты актуальны (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type {
  BuildingData, BuildingFloor, BuildingRoom, MapRoomType, RoomNames, RoomType, VectorFloorPlan, VectorMap, VmFloor, VmRoom, VmZone, Wing,
} from '../src/types';
import { bbox, boundaryPolyline, buildRoomPath, centroid, doorGeometry, doorLeaves, labelLayout, stairPaths, wallPath } from '../src/geometry';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repoRoot = resolve(root, '../..');
const check = process.argv.includes('--check');

interface RoomCodes {
  building: { code: string; name: string; timezone: string };
  rooms: Record<string, { code: string; schedulable: boolean; type?: RoomType; capacity?: number; names?: Partial<RoomNames> }>;
}

/** Служебные типы карты: рисуются отдельным слоем и красятся по типу (как в редакторе). */
const SERVICE_TYPES = new Set<MapRoomType>(['corridor', 'wc', 'stairs', 'lift', 'tech']);
/** TYPE_COLORS из apps/map-editor/src/styles/theme.ts */
const TYPE_FILL: Partial<Record<MapRoomType, string>> = {
  corridor: '#172432', wc: '#2b4766', stairs: '#293a51', lift: '#2f4059', tech: '#2a3443',
};
/** STATUS_COLORS из редактора: free — синий, service — серо-синий; типы office/class/hall/cafe по умолчанию «свободны» */
const FILL_FREE = '#2d6fd6';
const FILL_SERVICE = '#3b4b60';
const FREE_TYPES = new Set<MapRoomType>(['office', 'class', 'hall', 'cafe']);
const DEFAULT_TYPE: Record<MapRoomType, RoomType> = {
  office: 'admin', class: 'seminar', hall: 'lecture', cafe: 'service', corridor: 'service', wc: 'service',
  stairs: 'service', lift: 'service', service: 'service', tech: 'service', lobby: 'service', storage: 'service',
};

function parseCapacity(name: string): number | null {
  const m = /на\s+(\d+)/i.exec(name);
  return m ? Number(m[1]) : null;
}

function wingOf(cx: number, vbWidth: number): Wing {
  // центральный холл занимает полосу 700–900 при ширине 1600; масштабируем на случай другого viewBox
  const l = (700 / 1600) * vbWidth;
  const r = (900 / 1600) * vbWidth;
  if (cx < l) return 'west';
  if (cx > r) return 'east';
  return 'core';
}

const codes = JSON.parse(readFileSync(resolve(root, 'room-codes.json'), 'utf8')) as RoomCodes;
const floorFiles = ['floor-1.json', 'floor-2.json'];
const plans = floorFiles.map((f) => JSON.parse(readFileSync(resolve(root, 'vector', f), 'utf8')) as VectorFloorPlan).sort((a, b) => a.level - b.level);

const errors: string[] = [];
const seenCodes = new Map<string, string>();
const vb = plans[0].viewBox;
for (const p of plans) {
  if (p.viewBox.width !== vb.width || p.viewBox.height !== vb.height) errors.push(`${p.id}: viewBox отличается от ${plans[0].id}`);
}
const knownIds = new Set(plans.flatMap((p) => p.rooms.map((r) => r.id)));
for (const id of Object.keys(codes.rooms)) if (!knownIds.has(id)) errors.push(`room-codes.json: id "${id}" нет в vector/*.json`);

const buildingFloors: BuildingFloor[] = [];
const vmFloors: VmFloor[] = [];

for (const plan of plans) {
  const rooms: BuildingRoom[] = [];
  const vmRooms: VmRoom[] = [];
  for (const r of plan.rooms) {
    const poly = boundaryPolyline(plan, r.boundary);
    const path = buildRoomPath(plan, r.boundary, r.holes);
    if (poly.length < 3 || !path) {
      errors.push(`${plan.id}/${r.id}: пустой контур`);
      continue;
    }
    const b = bbox(poly);
    const c = centroid(poly);
    const override = codes.rooms[r.id];
    const code = override?.code ?? r.id;
    if (seenCodes.has(code)) errors.push(`код "${code}" задан дважды: ${seenCodes.get(code)} и ${r.id}`);
    seenCodes.set(code, r.id);
    const schedulable = override?.schedulable ?? false;
    const type: RoomType = override?.type ?? DEFAULT_TYPE[r.type];
    if (schedulable && !override) errors.push(`${r.id}: schedulable без записи в room-codes.json`);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const bboxOut = { x: r2(b.minX), y: r2(b.minY), w: r2(b.maxX - b.minX), h: r2(b.maxY - b.minY) };
    // названия: room-codes.json (ru/kk/en) поверх русского названия из vector/*.json
    const names: RoomNames = { ru: override?.names?.ru ?? r.name, kk: override?.names?.kk ?? override?.names?.ru ?? r.name, en: override?.names?.en ?? override?.names?.ru ?? r.name };
    rooms.push({
      id: r.id,
      code,
      name: names.ru,
      names,
      mapLabel: r.number || r.name,
      type,
      mapType: r.type,
      wing: wingOf((b.minX + b.maxX) / 2, plan.viewBox.width),
      schedulable,
      capacity: override?.capacity ?? parseCapacity(r.name),
      area: r.area ?? null,
      bbox: bboxOut,
      label: { x: r.label.x, y: r.label.y },
      path,
    });
    const layout = labelLayout(plan, r);
    vmRooms.push({
      id: r.id,
      code,
      path,
      mapType: r.type,
      service: SERVICE_TYPES.has(r.type),
      typeFill: TYPE_FILL[r.type] ?? null,
      baseFill: TYPE_FILL[r.type] ?? (schedulable && FREE_TYPES.has(r.type) ? FILL_FREE : FILL_SERVICE),
      schedulable,
      label: layout ? { x: r.label.x, y: r.label.y, angle: layout.angle, fs: layout.fs, secFs: layout.secFs, primary: layout.primary, secondary: layout.secondary } : null,
      hideLabel: r.hideLabel ?? false,
      bbox: bboxOut,
      centroid: { x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 },
    });
  }

  // стены на экране: штрихи чертежа дословно, если они есть; иначе — топологические стены
  // (виртуальные мостики через проёмы и разрезы дыр не рисуются никогда)
  const walls = plan.strokes?.length
    ? plan.strokes.map((s) => ({ id: s.id, path: s.d, exterior: !!s.exterior, virtual: false }))
    : Object.entries(plan.walls)
        .filter(([, w]) => !w.virtual)
        .map(([id, w]) => ({ id, path: wallPath(plan, w), exterior: !!w.exterior, virtual: false }))
        .filter((w) => w.path);

  const doors = plan.doors.flatMap((d) => {
    const g = doorGeometry(plan, d);
    if (!g) return [];
    return [{ id: d.id, x1: g.a.x, y1: g.a.y, x2: g.b.x, y2: g.b.y, leaves: doorLeaves(d, g) }];
  });

  const zones: VmZone[] = [];
  for (const z of plan.specialZones) {
    const room = plan.rooms.find((r) => r.id === z.roomId);
    if (!room) continue;
    const poly = boundaryPolyline(plan, room.boundary);
    if (poly.length < 3) continue;
    const b = bbox(poly);
    switch (z.kind) {
      case 'stairs':
        zones.push({ id: z.id, kind: 'stairs', ...stairPaths(poly, z.angle ?? 0) });
        break;
      case 'lift': {
        const inset = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.18;
        zones.push({ id: z.id, kind: 'lift', x0: b.minX + inset, y0: b.minY + inset, x1: b.maxX - inset, y1: b.maxY - inset });
        break;
      }
      case 'wc': {
        const size = Math.min(b.maxX - b.minX, b.maxY - b.minY);
        if (!room.hideLabel || size < 30) break;
        const c = centroid(poly);
        zones.push({ id: z.id, kind: 'wc', x: c.x, y: c.y, fontSize: Math.min(9, size / 4) });
        break;
      }
      case 'tech':
      case 'shaft': {
        const inset = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.15;
        zones.push({ id: z.id, kind: z.kind, x: b.minX + inset, y: b.minY + inset, w: b.maxX - b.minX - inset * 2, h: b.maxY - b.minY - inset * 2, rx: z.kind === 'shaft' ? 12 : 0 });
        break;
      }
    }
  }

  buildingFloors.push({ number: plan.level, planKey: `a-f${plan.level}`, name: plan.name, rooms });
  vmFloors.push({ id: plan.id, number: plan.level, name: plan.name, exteriorPath: buildRoomPath(plan, plan.exterior), rooms: vmRooms, walls, doors, zones });
}

const building: BuildingData = {
  building: codes.building.code,
  name: codes.building.name,
  timezone: codes.building.timezone,
  viewBox: [vb.x, vb.y, vb.width, vb.height],
  floors: buildingFloors,
};
const vectorMap: VectorMap = { building: codes.building.code, viewBox: vb, floors: vmFloors };

// ---- schema
const ajv = new Ajv({ allErrors: true });
const schema = JSON.parse(readFileSync(resolve(root, 'schema.json'), 'utf8'));
const validate = ajv.compile(schema);
if (!validate(building)) for (const e of validate.errors ?? []) errors.push(`schema: ${e.instancePath} ${e.message}`);

if (errors.length) {
  for (const e of errors) console.error('✖', e);
  process.exit(1);
}

// ---- docs/BUILDING.md
const md: string[] = [
  '# Программа помещений здания A',
  '',
  '> Сгенерировано `pnpm map:build` из `packages/map-data/vector/*.json` и `room-codes.json`. Не редактировать руками.',
  '',
  `Здание **${building.name}** (${building.building}), часовой пояс ${building.timezone}, ${building.floors.length} этажа, ` +
    `${building.floors.reduce((s, f) => s + f.rooms.length, 0)} помещений, из них с расписанием: ` +
    `${building.floors.reduce((s, f) => s + f.rooms.filter((r) => r.schedulable).length, 0)}.`,
  '',
  'Коды помещений — единственная идентичность для API и табло; подписи на карте (колонка «На карте») не меняются.',
  '',
];
for (const f of building.floors) {
  md.push(`## Этаж ${f.number} — ${f.name}`, '', '| Код | На карте | Название | Қазақша | English | Тип | Крыло | Вмест. | Пары |', '|---|---|---|---|---|---|---|---|---|');
  const sorted = [...f.rooms].sort((a, b) => Number(b.schedulable) - Number(a.schedulable) || a.code.localeCompare(b.code, 'ru', { numeric: true }));
  for (const r of sorted) md.push(`| ${r.code} | ${r.mapLabel} | ${r.name} | ${r.names.kk} | ${r.names.en} | ${r.type} | ${r.wing} | ${r.capacity ?? '—'} | ${r.schedulable ? 'да' : 'нет'} |`);
  md.push('');
}

const outputs: [string, string][] = [
  [resolve(root, 'building-a.json'), JSON.stringify(building, null, 2) + '\n'],
  [resolve(root, 'vector-map.json'), JSON.stringify(vectorMap) + '\n'],
  [resolve(repoRoot, 'docs/BUILDING.md'), md.join('\n')],
];

if (check) {
  let stale = false;
  for (const [file, content] of outputs) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
      console.error('✖ устарел:', file);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log('✔ артефакты map-data актуальны');
} else {
  for (const [file, content] of outputs) {
    writeFileSync(file, content, 'utf8');
    console.log('→', file);
  }
  const total = building.floors.reduce((s, f) => s + f.rooms.length, 0);
  const sched = building.floors.reduce((s, f) => s + f.rooms.filter((r) => r.schedulable).length, 0);
  console.log(`✔ ${building.floors.length} этажа, ${total} помещений, с расписанием: ${sched}`);
}
