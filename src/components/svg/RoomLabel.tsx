import { memo, useMemo } from 'react';
import type { FloorPlan, Room } from '@/types/plan';
import { boundaryPolyline, bbox } from '@/geometry/buildRoomPath';

interface Props {
  plan: FloorPlan;
  room: Room;
  forceShow?: boolean;
  editable?: boolean;
  onDragStart?: (roomId: string, e: React.PointerEvent<SVGGElement>) => void;
}

const CHAR_W = 0.58; // средняя ширина символа в em

function shorten(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  const words = name.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).trim().length > maxChars - 1) break;
    out = (out + ' ' + w).trim();
  }
  return (out || name.slice(0, maxChars - 1)) + '…';
}

/** Подпись помещения: номер крупно, название мельче; подстраивается под размер комнаты. */
export const RoomLabel = memo(function RoomLabel({ plan, room, forceShow, editable, onDragStart }: Props) {
  const layout = useMemo(() => {
    const poly = boundaryPolyline(plan, room.boundary);
    if (poly.length < 3) return null;
    const b = bbox(poly);
    const angle = room.label.angle ?? 0;
    const rotated = Math.abs(angle) === 90;
    const availW = (rotated ? b.maxY - b.minY : b.maxX - b.minX) - 8;
    const availH = (rotated ? b.maxX - b.minX : b.maxY - b.minY) - 6;
    const primary = room.number || room.name;
    const secondary = room.number && room.name.toLowerCase() !== room.number.toLowerCase() ? room.name : '';
    let fs = room.label.fontSize ?? Math.min(14, Math.max(6, availH / 3.2));
    // уменьшить шрифт, чтобы номер/название влезли по ширине
    const fitFont = (text: string, base: number, min: number) => {
      const need = text.length * CHAR_W * base;
      return need <= availW ? base : Math.max(min, (availW / (text.length * CHAR_W)));
    };
    fs = fitFont(primary, fs, 5);
    const showPrimary = fs >= 5 && availH >= fs;
    let secFs = Math.max(4.5, fs * 0.62);
    let secText = secondary;
    if (secText) {
      const maxChars = Math.floor(availW / (CHAR_W * secFs));
      if (maxChars < 6 || availH < fs + secFs + 2) secText = '';
      else secText = shorten(secText, maxChars);
    }
    if (!secText) secFs = 0;
    return { fs, secFs, primary, secText, showPrimary, angle };
  }, [plan, room]);

  if (!layout || !layout.showPrimary) return null;
  if (room.hideLabel && !forceShow) return null;
  const { fs, secFs, primary, secText, angle } = layout;
  const transform = `translate(${room.label.x} ${room.label.y})${angle ? ` rotate(${angle})` : ''}`;
  const dy = secText ? -secFs * 0.55 : 0;
  return (
    <g
      className={editable ? 'room-label is-editable' : 'room-label'}
      transform={transform}
      pointerEvents={editable ? 'all' : 'none'}
      onPointerDown={editable && onDragStart ? (e) => onDragStart(room.id, e) : undefined}
    >
      <text className="room-label-primary" fontSize={fs} textAnchor="middle" dominantBaseline="middle" y={dy}>
        {primary}
      </text>
      {secText && (
        <text className="room-label-secondary" fontSize={secFs} textAnchor="middle" dominantBaseline="middle" y={dy + fs * 0.62 + secFs * 0.6}>
          {secText}
        </text>
      )}
    </g>
  );
});
