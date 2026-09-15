'use client';

import { memo } from 'react';
import type { VmFloor, VmRoom } from '@campuslive/map-data/types';

/**
 * The static drawing of one floor — background, walls, doors, stairs/lifts/wc glyphs, labels.
 * Ported 1:1 from apps/map-editor (FloorMap.tsx and the svg/ components); memoised so realtime
 * ticks never touch it. Room fills live in <RoomShape>, rendered by the parent between layers.
 */

export const FloorBackground = memo(function FloorBackground({ floor }: { floor: VmFloor }) {
  return (
    <g className="floor-bg">
      <path d={floor.exteriorPath} className="floor-outline-glow" vectorEffect="non-scaling-stroke" />
      <path d={floor.exteriorPath} className="floor-outline-fill" />
    </g>
  );
});

export const WallLayer = memo(function WallLayer({ floor }: { floor: VmFloor }) {
  const interior = floor.walls.filter((w) => !w.exterior);
  const exterior = floor.walls.filter((w) => w.exterior);
  return (
    <g className="walls">
      <g className="walls-interior">
        {interior.map((w) => (
          <path key={w.id} d={w.path} className={w.virtual ? 'wall wall-interior wall-virtual' : 'wall wall-interior'} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g className="walls-exterior">
        {exterior.map((w) => (
          <path key={w.id} d={w.path} className={w.virtual ? 'wall wall-exterior wall-virtual' : 'wall wall-exterior'} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </g>
  );
});

export const DoorLayer = memo(function DoorLayer({ floor }: { floor: VmFloor }) {
  return (
    <g className="doors">
      {floor.doors.map((d) => (
        <g key={d.id} className="door">
          <line className="door-opening" x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} vectorEffect="non-scaling-stroke" />
          {d.leaves.map((leaf, i) => (
            <path key={i} className="door-leaf" d={leaf} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
    </g>
  );
});

export const ZoneLayer = memo(function ZoneLayer({ floor }: { floor: VmFloor }) {
  return (
    <g className="zones" pointerEvents="none">
      {floor.zones.map((z) => {
        switch (z.kind) {
          case 'stairs':
            return (
              <g key={z.id} className="stairs">
                <path d={z.steps} className="stairs-steps" vectorEffect="non-scaling-stroke" />
                <path d={z.arrow} className="stairs-arrow" vectorEffect="non-scaling-stroke" />
              </g>
            );
          case 'lift':
            return (
              <g key={z.id} className="lift">
                <rect x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} vectorEffect="non-scaling-stroke" />
                <line x1={z.x0} y1={z.y0} x2={z.x1} y2={z.y1} vectorEffect="non-scaling-stroke" />
                <line x1={z.x1} y1={z.y0} x2={z.x0} y2={z.y1} vectorEffect="non-scaling-stroke" />
              </g>
            );
          case 'wc':
            return (
              <text key={z.id} x={z.x} y={z.y} className="zone-glyph" fontSize={z.fontSize} textAnchor="middle" dominantBaseline="middle">
                WC
              </text>
            );
          default:
            return <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx={z.rx} className={z.kind === 'shaft' ? 'zone-shaft' : 'zone-tech'} fill="url(#cl-hatch)" vectorEffect="non-scaling-stroke" />;
        }
      })}
    </g>
  );
});

function labelVisible(r: VmRoom, force: boolean): boolean {
  if (!r.label) return false;
  if (r.hideLabel && !force) return false;
  return true;
}

export const RoomLabelText = memo(function RoomLabelText({ room, force = false, dimmed = false }: { room: VmRoom; force?: boolean; dimmed?: boolean }) {
  if (!labelVisible(room, force)) return null;
  const l = room.label!;
  const transform = `translate(${l.x} ${l.y})${l.angle ? ` rotate(${l.angle})` : ''}`;
  const dy = l.secondary ? -l.secFs * 0.55 : 0;
  return (
    <g className={dimmed ? 'room-label label-dimmed' : 'room-label'} transform={transform} pointerEvents="none">
      <text className="room-label-primary" fontSize={l.fs} textAnchor="middle" dominantBaseline="middle" y={dy}>
        {l.primary}
      </text>
      {l.secondary && (
        <text className="room-label-secondary" fontSize={l.secFs} textAnchor="middle" dominantBaseline="middle" y={dy + l.fs * 0.62 + l.secFs * 0.6}>
          {l.secondary}
        </text>
      )}
    </g>
  );
});

/** Shared <defs>: hatch pattern, outline glow, conflict hatch. One per <svg>. */
export function FloorDefs() {
  return (
    <defs>
      <pattern id="cl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#6b8cae" strokeWidth="1" opacity="0.5" />
      </pattern>
      <pattern id="cl-conflict" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#c9651c" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#ff5f6d" strokeWidth="3" />
      </pattern>
      <filter id="cl-glow" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
