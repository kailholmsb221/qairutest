'use client';

import { memo } from 'react';
import type { VmRoom } from '@campuslive/map-data/types';
import { useBoardStore, selectRoom } from '@/lib/store/boardStore';
import { useNow } from '@/features/time/useNow';
import { deriveProgress, formatCountdown } from '@/features/time/derive';

/**
 * Focus-view chip over a schedulable room: room code · course code · countdown.
 * Ending rooms get a progress arc, conflicts a warning glyph. Pure SVG so it zooms with the plan.
 */
export const RoomChip = memo(function RoomChip({ room }: { room: VmRoom }) {
  const state = useBoardStore(selectRoom(room.code));
  const now = useNow();
  if (!state) return null;

  const session = state.current ?? state.next ?? null;
  const phase = state.phase;
  let countdown = '';
  if (phase === 'live' || phase === 'ending') countdown = state.current ? `-${formatCountdown(state.current.endAt, now)}` : '';
  else if (phase === 'soon' && state.next) countdown = `+${formatCountdown(state.next.startAt, now)}`;
  else if (state.freeUntil) countdown = `→${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Almaty' }).format(new Date(state.freeUntil))}`;

  const course = session?.courseCode ?? '';
  const text = [room.code, course, countdown].filter(Boolean).join(' · ');
  const fs = 9;
  const pad = 5;
  const w = Math.max(28, text.length * fs * 0.6 + pad * 2 + (state.conflict ? 10 : 0) + (phase === 'ending' ? 14 : 0));
  const h = 16;
  // anchor under the label (or the centroid for label-less rooms), clamped inside the bbox
  const ax = room.label?.x ?? room.centroid.x;
  const ay = (room.label?.y ?? room.centroid.y) + (room.label ? room.label.fs + room.label.secFs + 6 : 0);
  const x = Math.min(Math.max(ax - w / 2, room.bbox.x + 2), room.bbox.x + room.bbox.w - w - 2);
  const y = Math.min(ay, room.bbox.y + room.bbox.h - h - 2);
  if (w > room.bbox.w + 40) return null; // room too small for a chip

  const progress = state.current ? deriveProgress(state.current.startAt, state.current.endAt, now) : 0;
  const r = 5;
  const c = 2 * Math.PI * r;

  return (
    <g className="room-chip" data-phase={phase} data-testid={`room-chip-${room.code}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <rect width={w} height={h} rx={4} />
      <text x={pad} y={h / 2} dominantBaseline="middle" fontSize={fs}>
        <tspan>{room.code}</tspan>
        {course && (
          <tspan className="chip-course" dx={4}>
            · {course}
          </tspan>
        )}
        {countdown && (
          <tspan className="chip-countdown" dx={4}>
            · {countdown}
          </tspan>
        )}
      </text>
      {phase === 'ending' && (
        <g transform={`translate(${w - 10} ${h / 2})`}>
          <circle className="chip-arc-track" r={r} />
          <circle className="chip-arc" r={r} strokeDasharray={`${(c * progress).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90)" />
        </g>
      )}
      {state.conflict && (
        <text className="chip-warn" x={w - (phase === 'ending' ? 22 : 9)} y={h / 2} dominantBaseline="middle" textAnchor="middle" fontSize={fs}>
          ⚠
        </text>
      )}
    </g>
  );
});
