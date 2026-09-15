/**
 * Автоматическое разбиение стен в Т-образных стыках.
 * Прямые стены делятся во всех точках, лежащих строго внутри них; дуговые
 * стены контура — в точках контура между их концами. Ссылки boundary/exterior
 * и позиции дверей переписываются, поэтому комнаты можно задавать простыми
 * прямоугольниками, не заботясь о стыках с соседями.
 */
import type { BoundaryRef, Door, DoorSwing, Wall } from '../src/types/plan';
import type { PlanBuilder } from './planBuilder';

export interface FinalizeReport {
  splitLines: number;
  splitArcs: number;
}

const r5 = (n: number) => Math.round(n * 100000) / 100000;

export function finalizePlan(b: PlanBuilder): FinalizeReport {
  const report: FinalizeReport = { splitLines: 0, splitArcs: 0 };
  const replacements = new Map<string, string[]>();
  const internals = b as unknown as { stationOf: Map<string, number>; wallByPair: Map<string, string> };
  const stationOf = internals.stationOf;
  const wallByPair = internals.wallByPair;
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  let seq = Object.keys(b.walls).length;

  const doorsByWall = new Map<string, Door[]>();
  for (const d of b.doors) {
    const list = doorsByWall.get(d.wallId) ?? [];
    list.push(d);
    doorsByWall.set(d.wallId, list);
  }

  for (const [wid, w] of Object.entries(b.walls)) {
    const a = b.points[w.start];
    const c = b.points[w.end];
    const inner: { id: string; t: number }[] = [];
    let clockwise = true;
    if (w.type === 'line') {
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      for (const [pid, p] of Object.entries(b.points)) {
        if (pid === w.start || pid === w.end) continue;
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        if (Math.hypot(px - p.x, py - p.y) < 0.02) inner.push({ id: pid, t });
      }
      if (inner.length) report.splitLines++;
    } else if (b.outline && stationOf.has(w.start) && stationOf.has(w.end)) {
      const total = b.outline.total;
      const sa = stationOf.get(w.start)!;
      const sb = stationOf.get(w.end)!;
      clockwise = (w.bulge ?? 0) > 0;
      const s0 = clockwise ? sa : sb;
      let s1 = clockwise ? sb : sa;
      if (s1 <= s0) s1 += total;
      for (const [pid, s] of stationOf) {
        if (pid === w.start || pid === w.end) continue;
        for (const k of [0, 1]) {
          const ss = s + k * total;
          if (ss > s0 + 1e-6 && ss < s1 - 1e-6) {
            const t = (ss - s0) / (s1 - s0);
            inner.push({ id: pid, t: clockwise ? t : 1 - t });
          }
        }
      }
      if (inner.length) report.splitArcs++;
    }
    if (!inner.length) continue;
    inner.sort((p, q) => p.t - q.t);
    const chainIds = [w.start, ...inner.map((i) => i.id), w.end];
    const subIds: string[] = [];
    for (let i = 0; i < chainIds.length - 1; i++) {
      const from = chainIds[i];
      const to = chainIds[i + 1];
      const key = pairKey(from, to);
      let id = wallByPair.get(key);
      if (!id) {
        id = `w${++seq}`;
        const sub: Wall = { start: from, end: to, type: w.type };
        if (w.type === 'arc') {
          const total = b.outline!.total;
          const sf = stationOf.get(from)!;
          const st = stationOf.get(to)!;
          let ds = clockwise ? st - sf : sf - st;
          if (ds <= 0) ds += total;
          const { piece } = b.outline!.locate((clockwise ? sf : st) + ds / 2);
          const theta = ds / piece.radius!;
          sub.bulge = r5((clockwise ? 1 : -1) * Math.tan(theta / 4));
        }
        if (w.exterior) sub.exterior = true;
        if (w.virtual) sub.virtual = true;
        b.walls[id] = sub;
        wallByPair.set(key, id);
      } else if (w.exterior) {
        b.walls[id].exterior = true;
      }
      subIds.push(id);
    }
    replacements.set(wid, subIds);

    const doors = doorsByWall.get(wid) ?? [];
    const ts = [0, ...inner.map((i) => i.t), 1];
    for (const d of doors) {
      for (let i = 0; i < subIds.length; i++) {
        if (d.position >= ts[i] && d.position <= ts[i + 1]) {
          const sub = b.walls[subIds[i]];
          const local = (d.position - ts[i]) / (ts[i + 1] - ts[i]);
          d.wallId = subIds[i];
          const forward = sub.start === chainIds[i];
          d.position = Math.round((forward ? local : 1 - local) * 100) / 100;
          if (!forward) d.swing = mirrorSwing(d.swing);
          break;
        }
      }
    }
  }

  const rewrite = (refs: BoundaryRef[]): BoundaryRef[] => {
    const out: BoundaryRef[] = [];
    for (const r of refs) {
      const subs = replacements.get(r.wallId);
      if (!subs) {
        out.push(r);
        continue;
      }
      const orig = b.walls[r.wallId];
      const ordered = r.direction === 1 ? subs : [...subs].reverse();
      let cursor = r.direction === 1 ? orig.start : orig.end;
      for (const sid of ordered) {
        const sw = b.walls[sid];
        const dir: 1 | -1 = sw.start === cursor ? 1 : -1;
        out.push({ wallId: sid, direction: dir });
        cursor = dir === 1 ? sw.end : sw.start;
      }
    }
    return out;
  };
  for (const room of b.rooms) room.boundary = rewrite(room.boundary);
  b.exteriorRefs = rewrite(b.exteriorRefs);
  for (const wid of replacements.keys()) {
    const w = b.walls[wid];
    wallByPair.delete(pairKey(w.start, w.end));
    delete b.walls[wid];
  }
  return report;
}

function mirrorSwing(s: DoorSwing): DoorSwing {
  const map: Record<string, DoorSwing> = {
    'left-in': 'right-in',
    'right-in': 'left-in',
    'left-out': 'right-out',
    'right-out': 'left-out',
  };
  return map[s] ?? s;
}
