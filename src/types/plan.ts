/** Топологическая модель этажа: общие точки → стены → помещения. */

export interface Point {
  x: number;
  y: number;
}

export type WallKind = 'line' | 'arc';

export interface Wall {
  start: string;
  end: string;
  type: WallKind;
  /** Для дуги: tan(θ/4), знак — направление выпуклости (по часовой при движении start→end, если >0). */
  bulge?: number;
  /** Внешняя стена — рисуется толще и со свечением. */
  exterior?: boolean;
  /** Условная / отсутствующая перегородка (граница зоны без физической стены). */
  virtual?: boolean;
}

export interface BoundaryRef {
  wallId: string;
  /** 1 — идём от start к end, -1 — от end к start. */
  direction: 1 | -1;
}

export type RoomType =
  | 'office'
  | 'class'
  | 'hall'
  | 'corridor'
  | 'wc'
  | 'stairs'
  | 'lift'
  | 'service'
  | 'tech'
  | 'lobby'
  | 'cafe'
  | 'storage';

export type RoomStatus = 'free' | 'busy' | 'ending' | 'soon' | 'service';

export interface RoomLabelPos {
  x: number;
  y: number;
  /** Угол поворота подписи (градусы), по умолчанию 0. */
  angle?: number;
  /** Принудительный размер шрифта. */
  fontSize?: number;
}

export interface Room {
  id: string;
  number: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  boundary: BoundaryRef[];
  label: RoomLabelPos;
  /** Площадь с чертежа, м² (справочно). */
  area?: number;
  /** Дополнительная подпись из чертежа (когда номер взят по примеру). */
  planName?: string;
  /** Скрыть подпись на карте (для совсем маленьких помещений). */
  hideLabel?: boolean;
}

export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'double' | 'none';

export interface Door {
  id: string;
  wallId: string;
  /** Положение центра двери вдоль стены 0..1. */
  position: number;
  width: number;
  swing: DoorSwing;
}

export type SpecialZoneKind = 'stairs' | 'lift' | 'wc' | 'tech' | 'shaft';

export interface SpecialZone {
  id: string;
  kind: SpecialZoneKind;
  /** Помещение, в котором расположена зона (для иконки/штриховки). */
  roomId: string;
  /** Направление лестничного марша, градусы (0 — вправо). */
  angle?: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  level: number;
  viewBox: ViewBox;
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  rooms: Room[];
  /** Упорядоченный внешний контур этажа. */
  exterior: BoundaryRef[];
  doors: Door[];
  specialZones: SpecialZone[];
}

export interface Building {
  id: string;
  name: string;
  floors: FloorPlan[];
}
