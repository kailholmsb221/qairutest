import type { FloorPlan, Wall } from '@/types/plan';
import { wallPath } from '@/geometry/buildRoomPath';

interface Props {
  plan: FloorPlan;
  id: string;
  wall: Wall;
  selected?: boolean;
  onClick?: (id: string, e: React.MouseEvent<SVGPathElement>) => void;
}

/** Одна стена (прямая или дуга). Толщина в пикселях не зависит от масштаба. */
export function ArcWall({ plan, id, wall, selected, onClick }: Props) {
  const d = wallPath(plan, wall);
  if (!d) return null;
  const cls = ['wall', wall.exterior ? 'wall-exterior' : 'wall-interior', wall.virtual ? 'wall-virtual' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return (
    <path
      d={d}
      className={cls}
      data-wall-id={id}
      vectorEffect="non-scaling-stroke"
      onClick={onClick ? (e) => onClick(id, e) : undefined}
    />
  );
}
