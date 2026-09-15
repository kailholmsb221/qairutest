import type { VectorMap, VmFloor, VmRoom } from '@campuslive/map-data/types';
import vectorMapJson from '@campuslive/map-data/vector-map.json';
import buildingJson from '@campuslive/map-data/building-a.json';
import type { BuildingData, BuildingRoom } from '@campuslive/map-data/types';

/**
 * What the screen draws comes ONLY from vector-map.json (presentation geometry);
 * room identity (codes, names, types) comes ONLY from building-a.json / the /map API.
 * Both are built by `pnpm map:build` from the hand-digitised plans.
 */
export const vectorMap = vectorMapJson as unknown as VectorMap;
export const buildingData = buildingJson as unknown as BuildingData;

export const VIEW_BOX = vectorMap.viewBox;
export const FLOORS: VmFloor[] = [...vectorMap.floors].sort((a, b) => a.number - b.number);
export const FLOOR_NUMBERS = FLOORS.map((f) => f.number);

const roomByCode = new Map<string, VmRoom & { floor: number }>();
const roomById = new Map<string, VmRoom & { floor: number }>();
for (const f of FLOORS) {
  for (const r of f.rooms) {
    roomByCode.set(r.code, { ...r, floor: f.number });
    roomById.set(r.id, { ...r, floor: f.number });
  }
}

const identityByCode = new Map<string, BuildingRoom & { floor: number }>();
for (const f of buildingData.floors) {
  for (const r of f.rooms) identityByCode.set(r.code, { ...r, floor: f.number });
}

export function floorOf(number: number): VmFloor | undefined {
  return FLOORS.find((f) => f.number === number);
}
export function vmRoomByCode(code: string) {
  return roomByCode.get(code);
}
export function vmRoomById(id: string) {
  return roomById.get(id);
}
export function roomIdentity(code: string) {
  return identityByCode.get(code);
}
export const SCHEDULABLE_CODES = [...identityByCode.values()].filter((r) => r.schedulable).map((r) => r.code);
