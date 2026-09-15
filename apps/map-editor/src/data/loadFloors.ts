import floor1 from '../../../../packages/map-data/vector/floor-1.json';
import floor2 from '../../../../packages/map-data/vector/floor-2.json';
import { floorPlanSchema } from '@/schemas/planSchema';
import type { FloorPlan } from '@/types/plan';

/** Загружает встроенные этажи, проверяя их Zod-схемой (ошибки — в консоль). */
export function loadBundledFloors(): FloorPlan[] {
  const out: FloorPlan[] = [];
  for (const raw of [floor1, floor2]) {
    const res = floorPlanSchema.safeParse(raw);
    if (res.success) out.push(res.data as FloorPlan);
    else console.error('Некорректный JSON этажа', (raw as { id?: string }).id, res.error.issues.slice(0, 10));
  }
  return out.sort((a, b) => a.level - b.level);
}

/** Разбор JSON из файла с валидацией. */
export function parseFloorJson(text: string): { plan?: FloorPlan; errors?: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [`JSON не разбирается: ${(e as Error).message}`] };
  }
  const res = floorPlanSchema.safeParse(data);
  if (!res.success) return { errors: res.error.issues.map((i) => `${i.path.join('.') || '(корень)'}: ${i.message}`) };
  return { plan: res.data as FloorPlan };
}
