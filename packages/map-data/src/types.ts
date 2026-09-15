/**
 * Типы пакета map-data.
 *  - VectorFloorPlan — ручная оцифровка (apps/map-editor, vector/floor-*.json), топология points → walls → rooms.
 *  - BuildingData   — building-a.json: идентичность помещений (коды, имена, типы), читают web и seed.
 *  - VectorMap      — vector-map.json: готовая геометрия для отрисовки (пути, стены, двери, подписи), читает только web.
 */

export interface Point { x: number; y: number }

export type WallKind = 'line' | 'arc';
export interface Wall { start: string; end: string; type: WallKind; bulge?: number; exterior?: boolean; virtual?: boolean }
export interface BoundaryRef { wallId: string; direction: 1 | -1 }

export type MapRoomType =
  | 'office' | 'class' | 'hall' | 'corridor' | 'wc' | 'stairs' | 'lift'
  | 'service' | 'tech' | 'lobby' | 'cafe' | 'storage';
export type MapRoomStatus = 'free' | 'busy' | 'ending' | 'soon' | 'service';

export interface RoomLabelPos { x: number; y: number; angle?: number; fontSize?: number }
export interface VectorRoom {
  id: string; number: string; name: string; type: MapRoomType; status: MapRoomStatus;
  boundary: BoundaryRef[]; label: RoomLabelPos; area?: number; planName?: string; hideLabel?: boolean;
}
export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'double' | 'none';
export interface Door { id: string; wallId: string; position: number; width: number; swing: DoorSwing }
export type SpecialZoneKind = 'stairs' | 'lift' | 'wc' | 'tech' | 'shaft';
export interface SpecialZone { id: string; kind: SpecialZoneKind; roomId: string; angle?: number }
export interface ViewBox { x: number; y: number; width: number; height: number }
export interface VectorFloorPlan {
  id: string; name: string; level: number; viewBox: ViewBox;
  points: Record<string, Point>; walls: Record<string, Wall>; rooms: VectorRoom[];
  exterior: BoundaryRef[]; doors: Door[]; specialZones: SpecialZone[];
}

// ---------------------------------------------------------------- building-a.json
export type RoomType = 'lecture' | 'seminar' | 'lab' | 'coworking' | 'admin' | 'service' | 'void';
export type Wing = 'west' | 'east' | 'core';
export interface BBox { x: number; y: number; w: number; h: number }
export interface BuildingRoom {
  /** id из vector/*.json — стабильный ключ между building-a.json и vector-map.json */
  id: string;
  code: string;
  name: string;
  /** подпись на чертеже (как на карте) */
  mapLabel: string;
  type: RoomType;
  mapType: MapRoomType;
  wing: Wing;
  schedulable: boolean;
  capacity: number | null;
  area: number | null;
  bbox: BBox;
  label: Point;
  path: string;
}
export interface BuildingFloor { number: number; planKey: string; name: string; rooms: BuildingRoom[] }
export interface BuildingData {
  building: string; name: string; timezone: string;
  viewBox: [number, number, number, number];
  floors: BuildingFloor[];
}

// ---------------------------------------------------------------- vector-map.json
export interface VmLabel { x: number; y: number; angle: number; fs: number; secFs: number; primary: string; secondary: string }
export interface VmRoom {
  id: string; code: string; path: string; mapType: MapRoomType;
  /** коридоры/санузлы/лестницы/лифты/техзоны — рисуются отдельным слоем и красятся по типу */
  service: boolean;
  typeFill: string | null;
  /** статичная заливка для помещений без расписания (цвет типа или «свободна»/«служебная» как в редакторе) */
  baseFill: string;
  schedulable: boolean;
  label: VmLabel | null;
  hideLabel: boolean;
  bbox: BBox;
  centroid: Point;
}
export interface VmWall { id: string; path: string; exterior: boolean; virtual: boolean }
export interface VmDoor { id: string; x1: number; y1: number; x2: number; y2: number; leaves: string[] }
export type VmZone =
  | { id: string; kind: 'stairs'; steps: string; arrow: string }
  | { id: string; kind: 'lift'; x0: number; y0: number; x1: number; y1: number }
  | { id: string; kind: 'wc'; x: number; y: number; fontSize: number }
  | { id: string; kind: 'tech' | 'shaft'; x: number; y: number; w: number; h: number; rx: number };
export interface VmFloor {
  id: string; number: number; name: string;
  exteriorPath: string;
  rooms: VmRoom[]; walls: VmWall[]; doors: VmDoor[]; zones: VmZone[];
}
export interface VectorMap { building: string; viewBox: ViewBox; floors: VmFloor[] }
