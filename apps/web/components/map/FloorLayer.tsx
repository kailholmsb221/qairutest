'use client';

import { forwardRef, memo, useMemo } from 'react';
import type { VmFloor } from '@campuslive/map-data/types';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '@/lib/store/uiStore';
import { useBoardStore } from '@/lib/store/boardStore';
import { DoorLayer, FloorBackground, FloorDefs, RoomLabelText, WallLayer, ZoneLayer } from './FloorPlan';
import { RoomShape } from './RoomShape';
import { RoomChip } from './RoomChip';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  floor: VmFloor;
  viewBox: ViewBox;
  /** exploded: stacked 2.5D; focus: this floor flat and interactive; background: another floor in focus view */
  mode: 'exploded' | 'focus' | 'background';
  interactive: boolean;
  onHover?: (code: string | null, ev?: React.PointerEvent) => void;
  onSelect?: (code: string) => void;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}

/**
 * One <svg viewBox> per floor. Layer order is the editor's: background → room fills (main, then
 * service) → walls → doors → zones → labels → chips → selection. Everything static is memoised;
 * only RoomShape/RoomChip subscribe to live state. The exploded plates carry no text (only the
 * live dots) — the floor tags beside the stack and the caption name them; labels appear in focus.
 */
export const FloorLayer = memo(
  forwardRef<SVGSVGElement, Props>(function FloorLayer({ floor, viewBox, mode, interactive, onHover, onSelect, onPointerDown, onPointerMove, onPointerUp }, ref) {
    const mainRooms = useMemo(() => floor.rooms.filter((r) => !r.service), [floor]);
    const serviceRooms = useMemo(() => floor.rooms.filter((r) => r.service), [floor]);
    const schedulable = useMemo(() => floor.rooms.filter((r) => r.schedulable), [floor]);
    const exploded = mode === 'exploded';
    const focus = mode === 'focus';
    const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

    return (
      <svg
        ref={ref}
        className="map-svg"
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        data-floor={floor.number}
        data-testid={`floor-svg-${floor.number}`}
        aria-label={floor.name}
        role={focus ? 'group' : 'img'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <FloorDefs />
        {exploded && (
          <g className="floor-slab-svg" pointerEvents="none">
            <path d={floor.exteriorPath} className="slab-side" transform="translate(0 8)" style={{ fill: 'var(--slab-edge)' }} />
          </g>
        )}
        <FloorBackground floor={floor} />
        <g className="rooms rooms-main">
          {mainRooms.map((r) => (
            <RoomShape key={r.id} room={r} interactive={interactive} exploded={exploded} onHover={onHover} onSelect={onSelect} />
          ))}
        </g>
        <g className="rooms rooms-service">
          {serviceRooms.map((r) => (
            <RoomShape key={r.id} room={r} interactive={interactive} exploded={exploded} onHover={onHover} onSelect={onSelect} />
          ))}
        </g>
        <WallLayer floor={floor} />
        <DoorLayer floor={floor} />
        <ZoneLayer floor={floor} />
        {!exploded && <Labels floor={floor} />}
        {focus && (
          <g className="chips">
            {schedulable.map((r) => (
              <RoomChip key={r.id} room={r} />
            ))}
          </g>
        )}
        <Outlines floor={floor} focus={focus} />
      </svg>
    );
  }),
);

/** Labels dim with the search highlight, and hidden labels appear on hover/selection (as in the editor). */
const Labels = memo(function Labels({ floor }: { floor: VmFloor }) {
  const highlight = useUiStore(useShallow((s) => s.highlight?.roomCodes ?? null));
  const hovered = useUiStore((s) => s.hoveredRoomCode);
  const selected = useUiStore((s) => s.selectedRoomCode);
  return (
    <g className="labels">
      {floor.rooms.map((r) => (
        <RoomLabelText key={r.id} room={r} force={r.code === hovered || r.code === selected} dimmed={!!highlight && !highlight.includes(r.code)} />
      ))}
    </g>
  );
});

/** Search highlight (accent) and the live glow (focus view only, a stroked path — no blur filter). Selection has no outline: the fill brightens instead. */
const Outlines = memo(function Outlines({ floor, focus }: { floor: VmFloor; focus: boolean }) {
  const highlight = useUiStore(useShallow((s) => s.highlight?.roomCodes ?? null));
  const glowing = useBoardStore(
    useShallow((s) =>
      focus
        ? s.snapshot.rooms
            .filter((r) => r.floor === floor.number && (r.phase === 'live' || r.phase === 'ending'))
            .map((r) => `${r.roomCode}:${r.phase}`)
        : [],
    ),
  );
  const byCode = useMemo(() => new Map(floor.rooms.map((r) => [r.code, r])), [floor]);
  return (
    <g className="selection" pointerEvents="none">
      {glowing.map((key) => {
        const [code, phase] = key.split(':');
        const r = byCode.get(code);
        return r ? <path key={key} d={r.path} className={phase === 'ending' ? 'glow-outline is-ending' : 'glow-outline'} /> : null;
      })}
      {highlight?.map((code) => {
        const r = byCode.get(code);
        return r ? <path key={code} d={r.path} className="highlight-outline" /> : null;
      })}
    </g>
  );
});
