/**
 * Генерация packages/map-data/vector/floor-*.json из чертежей (packages/map-data/plans/*.svg →
 * svg2plan.py → tools/traced/*.json + идентичность в tools/floor*.ts) с последующей
 * геометрической проверкой тем же валидатором, что и в приложении.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFloor1 } from './floor1';
import { buildFloor2 } from './floor2';
import { validateFloor } from '../src/geometry/validateBoundary';
import { floorPlanSchema } from '../src/schemas/planSchema';
import { boundaryPolyline, roomArea, signedArea } from '../src/geometry/buildRoomPath';
import type { FloorPlan } from '../src/types/plan';

const outDir = resolve(process.cwd(), '../../packages/map-data/vector');
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
  const totalArea = plan.rooms.reduce((s, r) => s + roomArea(plan as FloorPlan, r.boundary, r.holes), 0);
  const exteriorArea = Math.abs(signedArea(boundaryPolyline(plan as FloorPlan, plan.exterior)));
  console.log(
    `${errors.length ? '✖' : '✔'} ${plan.id}: точек ${Object.keys(plan.points).length}, стен ${Object.keys(plan.walls).length}, ` +
      `помещений ${plan.rooms.length} (с идентичностью ${report.identified}, безымянных ${report.unnamed}), дверей ${plan.doors.length}`,
  );
  console.log(`   покрытие: Σ площадей помещений ${totalArea.toFixed(0)} / площадь контура ${exteriorArea.toFixed(0)} (${((totalArea / exteriorArea) * 100).toFixed(2)}%)`);
  for (const e of errors) console.error('   ERROR', e.message);
  const byCode = new Map<string, number>();
  for (const w of warnings) byCode.set(w.code, (byCode.get(w.code) ?? 0) + 1);
  for (const [code, n] of byCode) console.warn(`   warn  ${code}: ${n}`);
  if (errors.length) failed = true;
  const file = resolve(outDir, `${plan.id}.json`);
  writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  console.log(`   → ${file}`);
}
if (failed) process.exit(1);
