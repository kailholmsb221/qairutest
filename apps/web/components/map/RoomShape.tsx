'use client';

import { memo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { VmRoom } from '@campuslive/map-data/types';
import type { RoomLiveState } from '@campuslive/contracts';
import { useBoardStore, selectRoom } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useRoomName } from '@/lib/room-name';
import { formatTime } from '@/features/time/derive';
import { useTimeStore } from '@/features/time/useNow';

export interface RoomShapeProps {
  room: VmRoom;
  interactive: boolean;
  /** exploded view: only tint + live dot, no chips */
  exploded: boolean;
  onHover?: (code: string | null, ev?: React.PointerEvent) => void;
  onSelect?: (code: string) => void;
}

/**
 * One room fill. Schedulable rooms colour by phase through `data-phase` (CSS variables), the rest
 * keep their static base fill from the plan. Every labelled room (numbered or WC/CR/Cinema/Cafe)
 * is a button that opens the detail panel; corridors and unnamed spaces stay static.
 * Subscribes only to its own RoomLiveState.
 */
export const RoomShape = memo(function RoomShape({ room, interactive, exploded, onHover, onSelect }: RoomShapeProps) {
  const state = useBoardStore(room.schedulable ? selectRoom(room.code) : () => undefined);
  const hovered = useUiStore((s) => s.hoveredRoomCode === room.code);
  const selected = useUiStore((s) => s.selectedRoomCode === room.code);
  const dimState = useUiStore((s) => {
    if (s.highlight) return s.highlight.roomCodes.includes(room.code) ? 'hit' : 'muted';
    if (s.selectedRoomCode && s.selectedRoomCode !== room.code) return 'faded';
    return 'none';
  });
  const t = useTranslations('map');
  const tz = useTimeStore((s) => s.timezone);
  const name = useRoomName();

  const phase = room.schedulable ? (state?.phase ?? 'free') : undefined;
  const conflict = !!state?.conflict;
  const clickable = interactive && (room.schedulable || (!room.hideLabel && !!room.label));
  const cls = [
    'room',
    clickable ? '' : 'is-static',
    hovered ? 'is-hovered' : '',
    selected ? 'is-selected' : '',
    dimState === 'muted' ? 'is-muted' : '',
    dimState === 'faded' && room.schedulable ? 'is-faded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const onEnter = useCallback((e: React.PointerEvent) => onHover?.(room.code, e), [onHover, room.code]);
  const onLeave = useCallback(() => onHover?.(null), [onHover]);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(room.code);
    },
    [onSelect, room.code],
  );
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(room.code);
      }
    },
    [onSelect, room.code],
  );

  const aria = room.schedulable ? t('roomAria', { code: room.code, name: name(room.code), status: statusText(state, t, tz) }) : `${name(room.code)}: ${t('notSchedulable')}`;
  const focusable = clickable && !exploded;

  return (
    <>
      <path
        d={room.path}
        className={cls}
        fillRule="evenodd"
        data-room-code={room.code}
        data-room-id={room.id}
        data-phase={phase}
        data-type={room.mapType}
        data-conflict={conflict ? 'true' : undefined}
        fill={room.schedulable ? undefined : room.baseFill}
        role={focusable ? 'button' : undefined}
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? aria : undefined}
        onPointerEnter={clickable ? onEnter : undefined}
        onPointerLeave={clickable ? onLeave : undefined}
        onClick={clickable ? onClick : undefined}
        onKeyDown={focusable ? onKey : undefined}
      />
      {room.schedulable && (phase === 'live' || phase === 'ending') && exploded && (
        <g className="live-marker" pointerEvents="none">
          <circle className="live-dot-halo" cx={room.centroid.x} cy={room.centroid.y} r={6} />
          <circle className="live-dot" cx={room.centroid.x} cy={room.centroid.y} r={6} />
        </g>
      )}
    </>
  );
});

function statusText(state: RoomLiveState | undefined, t: ReturnType<typeof useTranslations<'map'>>, tz: string): string {
  if (!state || state.phase === 'free') {
    if (state?.freeUntil) return t('freeUntil', { time: formatTime(state.freeUntil, tz) });
    return t('phase.free');
  }
  if (state.phase === 'soon' && state.next) return `${t('phase.soon')}: ${state.next.courseTitle} ${t('startsAt', { time: formatTime(state.next.startAt, tz) })}`;
  if (state.current) return `${t(`phase.${state.phase}`)}: ${state.current.courseTitle} ${t('until', { time: formatTime(state.current.endAt, tz) })}`;
  return t(`phase.${state.phase}`);
}
