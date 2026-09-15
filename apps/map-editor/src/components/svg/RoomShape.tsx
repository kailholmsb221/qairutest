import { memo } from 'react';
import type { FloorPlan, Room } from '@/types/plan';
import { buildRoomPath } from '@/geometry/buildRoomPath';
import { roomFill } from '@/styles/theme';

interface Props {
  plan: FloorPlan;
  room: Room;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  invalid: boolean;
  interactive: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Заливка помещения — настоящий SVG path, собранный из boundary. */
export const RoomShape = memo(function RoomShape({ plan, room, hovered, selected, dimmed, invalid, interactive, onHover, onSelect }: Props) {
  const d = buildRoomPath(plan, room.boundary);
  if (!d) return null;
  const cls = ['room', hovered ? 'is-hovered' : '', selected ? 'is-selected' : '', dimmed ? 'is-dimmed' : '', invalid ? 'is-invalid' : ''].filter(Boolean).join(' ');
  return (
    <path
      d={d}
      className={cls}
      fill={roomFill(room)}
      data-room-id={room.id}
      data-room-type={room.type}
      data-room-status={room.status}
      onPointerEnter={interactive ? () => onHover(room.id) : undefined}
      onPointerLeave={interactive ? () => onHover(null) : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); onSelect(room.id); } : undefined}
    />
  );
});
