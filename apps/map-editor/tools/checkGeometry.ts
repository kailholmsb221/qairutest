/** Проверка готовых JSON-файлов этажей: схема + геометрия + покрытие площади. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { floorPlanSchema } from '../src/schemas/planSchema';
import { validateFloor } from '../src/geometry/validateBoundary';
import { boundaryPolyline, signedArea } from '../src/geometry/buildRoomPath';
import type { FloorPlan } from '../src/types/plan';

const dir = resolve(process.cwd(), '../../packages/map-data/vector');
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
  const parsed = floorPlanSchema.safeParse(raw);
  if (!parsed.success) {
    failed = true;
    console.error(`✖ ${file}: схема — ${parsed.error.issues.length} проблем`);
    for (const i of parsed.error.issues.slice(0, 10)) console.error('   ', i.path.join('.'), i.message);
    continue;
  }
  const plan = parsed.data as FloorPlan;
  const issues = validateFloor(plan);
  const errors = issues.filter((i) => i.level === 'error');
  const sum = plan.rooms.reduce((s, r) => s + Math.abs(signedArea(boundaryPolyline(plan, r.boundary))), 0);
  const ext = Math.abs(signedArea(boundaryPolyline(plan, plan.exterior)));
  const arcs = Object.values(plan.walls).filter((w) => w.type === 'arc').length;
  const axisAligned = Object.values(plan.walls).filter((w) => {
    if (w.type !== 'line') return false;
    const a = plan.points[w.start], b = plan.points[w.end];
    return a.x === b.x || a.y === b.y;
  }).length;
  console.log(`${errors.length ? '✖' : '✔'} ${file}: помещений ${plan.rooms.length}, стен ${Object.keys(plan.walls).length} (дуг ${arcs}, строго гор./верт. ${axisAligned}), дверей ${plan.doors.length}`);
  console.log(`   ошибок ${errors.length}, предупреждений ${issues.length - errors.length}; Σ площадей / контур = ${((sum / ext) * 100).toFixed(3)}%`);
  for (const i of issues) console.log(`   ${i.level === 'error' ? 'ERROR' : 'warn '} ${i.message}`);
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
