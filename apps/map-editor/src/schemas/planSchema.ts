import { z } from 'zod';

const finite = z.number().finite();

export const pointSchema = z.object({ x: finite, y: finite });

export const wallSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  type: z.enum(['line', 'arc']),
  bulge: finite.optional(),
  exterior: z.boolean().optional(),
  virtual: z.boolean().optional(),
});

export const boundaryRefSchema = z.object({
  wallId: z.string().min(1),
  direction: z.union([z.literal(1), z.literal(-1)]),
});

export const roomTypeSchema = z.enum([
  'office', 'class', 'hall', 'corridor', 'wc', 'stairs', 'lift',
  'service', 'tech', 'lobby', 'cafe', 'storage',
]);

export const roomStatusSchema = z.enum(['free', 'busy', 'ending', 'soon', 'service']);

export const roomSchema = z.object({
  id: z.string().min(1),
  number: z.string(),
  name: z.string(),
  type: roomTypeSchema,
  status: roomStatusSchema,
  boundary: z.array(boundaryRefSchema).min(3),
  label: z.object({ x: finite, y: finite, angle: finite.optional(), fontSize: finite.optional() }),
  area: finite.optional(),
  planName: z.string().optional(),
  hideLabel: z.boolean().optional(),
});

export const doorSchema = z.object({
  id: z.string().min(1),
  wallId: z.string().min(1),
  position: z.number().min(0).max(1),
  width: z.number().positive(),
  swing: z.enum(['left-in', 'left-out', 'right-in', 'right-out', 'double', 'none']),
});

export const specialZoneSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['stairs', 'lift', 'wc', 'tech', 'shaft']),
  roomId: z.string().min(1),
  angle: finite.optional(),
});

export const floorPlanSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    level: z.number().int(),
    viewBox: z.object({ x: finite, y: finite, width: z.number().positive(), height: z.number().positive() }),
    points: z.record(pointSchema),
    walls: z.record(wallSchema),
    rooms: z.array(roomSchema),
    exterior: z.array(boundaryRefSchema).min(3),
    doors: z.array(doorSchema),
    specialZones: z.array(specialZoneSchema),
  })
  .superRefine((plan, ctx) => {
    // Ссылочная целостность: стены → точки, комнаты/двери/контур → стены.
    for (const [id, w] of Object.entries(plan.walls)) {
      if (!plan.points[w.start]) ctx.addIssue({ code: 'custom', message: `Стена ${id}: нет точки ${w.start}`, path: ['walls', id] });
      if (!plan.points[w.end]) ctx.addIssue({ code: 'custom', message: `Стена ${id}: нет точки ${w.end}`, path: ['walls', id] });
      if (w.type === 'arc' && (w.bulge === undefined || w.bulge === 0))
        ctx.addIssue({ code: 'custom', message: `Дуга ${id} должна иметь ненулевой bulge`, path: ['walls', id] });
    }
    const roomIds = new Set<string>();
    plan.rooms.forEach((r, i) => {
      if (roomIds.has(r.id)) ctx.addIssue({ code: 'custom', message: `Дубликат id помещения ${r.id}`, path: ['rooms', i] });
      roomIds.add(r.id);
      r.boundary.forEach((b, j) => {
        if (!plan.walls[b.wallId]) ctx.addIssue({ code: 'custom', message: `Помещение ${r.id}: нет стены ${b.wallId}`, path: ['rooms', i, 'boundary', j] });
      });
    });
    plan.exterior.forEach((b, j) => {
      if (!plan.walls[b.wallId]) ctx.addIssue({ code: 'custom', message: `Внешний контур: нет стены ${b.wallId}`, path: ['exterior', j] });
    });
    plan.doors.forEach((d, i) => {
      if (!plan.walls[d.wallId]) ctx.addIssue({ code: 'custom', message: `Дверь ${d.id}: нет стены ${d.wallId}`, path: ['doors', i] });
    });
    plan.specialZones.forEach((s, i) => {
      if (!roomIds.has(s.roomId)) ctx.addIssue({ code: 'custom', message: `Зона ${s.id}: нет помещения ${s.roomId}`, path: ['specialZones', i] });
    });
  });

export const buildingSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  floors: z.array(floorPlanSchema).min(1),
});

export type FloorPlanInput = z.input<typeof floorPlanSchema>;
