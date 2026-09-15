import type { Room, RoomStatus, RoomType } from '@/types/plan';

export const STATUS_COLORS: Record<RoomStatus, string> = {
  free: '#2d6fd6',
  busy: '#1f8f7d',
  ending: '#c9651c',
  soon: '#c99a1c',
  service: '#3b4b60',
};

export const STATUS_LABELS: Record<RoomStatus, string> = {
  busy: 'Занятие идёт',
  ending: 'Заканчивается (5 мин)',
  soon: 'Начнётся в течение 10 мин',
  free: 'Свободна',
  service: 'Служебная зона',
};

export const TYPE_COLORS: Partial<Record<RoomType, string>> = {
  corridor: '#172432',
  wc: '#2b4766',
  stairs: '#293a51',
  lift: '#2f4059',
  tech: '#2a3443',
};

export const TYPE_LABELS: Record<RoomType, string> = {
  office: 'Кабинет',
  class: 'Аудитория',
  hall: 'Зал',
  corridor: 'Коридор',
  wc: 'Санузел',
  stairs: 'Лестница',
  lift: 'Лифт',
  service: 'Служебное',
  tech: 'Техническое',
  lobby: 'Холл / тамбур',
  cafe: 'Буфет',
  storage: 'Кладовая / гардероб',
};

/** Заливка помещения: служебные типы — по типу, остальные — по статусу. */
export function roomFill(room: Room): string {
  const byType = TYPE_COLORS[room.type];
  if (byType) return byType;
  return STATUS_COLORS[room.status];
}

export const UI = {
  appBg: '#0d1520',
  mapBg: '#111c29',
  floorBg: '#15233299',
  outline: '#4fd1ff',
  outlineSoft: '#3aa7d9',
  wall: '#9cd8f5',
  wallInner: '#7fc3e6',
  text: '#e6f1fb',
  textMuted: '#9fb3c8',
  selection: '#ffffff',
  danger: '#ff5f6d',
  warn: '#ffb648',
  grid: '#1d2d40',
  gridMajor: '#25384f',
};
