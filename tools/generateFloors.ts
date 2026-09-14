/**
 * Генерация src/data/floor-*.json из ручной оцифровки (tools/floor*.ts)
 * с последующей геометрической проверкой тем же валидатором, что и в приложении.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFloor1 } from './floor1';
import { buildFloor2 } from './floor2';
import { validateFloor } from '../src/geometry/validateBoundary';
import { floorPlanSchema } from '../src/schemas/planSchema';
import { boundaryPolyline, signedArea } from '../src/geometry/buildRoomPath';
import type { FloorPlan } from '../src/types/plan';

const outDir = resolve(process.cwd(), 'src/data');
mkdirSync(outDir, { recursive: true });

let failed = false;
for (const { plan, report } of [buildFloor1(), buildFloor2()]) {
  const parsed = floorPlanSchema.safeParse(plan);
  if (!parsed.success) {
    failed = true;
    console.error(`✖ ${plan.id}: схема не прошла`);
    for (const issue of parsed.error.issues.slice(0, 20)) console.error('   ', issue.path.join('.'), issue.message);
    continue;
  }
  const issues = validateFloor(plan as FloorPlan);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const totalArea = plan.rooms.reduce((s, r) => s + Math.abs(signedArea(boundaryPolyline(plan as FloorPlan, r.boundary))), 0);
  const exteriorArea = Math.abs(signedArea(boundaryPolyline(plan as FloorPlan, plan.exterior)));
  console.log(
    `${errors.length ? '✖' : '✔'} ${plan.id}: точек ${Object.keys(plan.points).length}, стен ${Object.keys(plan.walls).length}, ` +
      `помещений ${plan.rooms.length}, дверей ${plan.doors.length}; разбито стен: ${report.splitLines} прямых, ${report.splitArcs} дуг`,
  );
  console.log(`   покрытие: Σ площадей помещений ${totalArea.toFixed(0)} / площадь контура ${exteriorArea.toFixed(0)} (${((totalArea / exteriorArea) * 100).toFixed(2)}%)`);
  for (const e of errors) console.error('   ERROR', e.message);
  for (const w of warnings) console.warn('   warn ', w.message);
  if (errors.length) failed = true;
  const file = resolve(outDir, `${plan.id}.json`);
  writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  console.log(`   → ${file}`);
}
if (failed) process.exit(1);
