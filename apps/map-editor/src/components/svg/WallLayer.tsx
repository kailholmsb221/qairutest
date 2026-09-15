import { memo } from 'react';
import type { FloorPlan } from '@/types/plan';
import { ArcWall } from './ArcWall';

interface Props {
  plan: FloorPlan;
  editable: boolean;
  selectedWallId: string | null;
  onWallClick?: (id: string, e: React.MouseEvent<SVGPathElement>) => void;
}

/** Все стены этажа, каждая ровно один раз, поверх заливок помещений. */
export const WallLayer = memo(function WallLayer({ plan, editable, selectedWallId, onWallClick }: Props) {
  const entries = Object.entries(plan.walls);
  const interior = entries.filter(([, w]) => !w.exterior);
  const exterior = entries.filter(([, w]) => w.exterior);
  return (
    <g className={editable ? 'walls walls-editable' : 'walls'}>
      <g className="walls-interior">
        {interior.map(([id, w]) => (
          <ArcWall key={id} plan={plan} id={id} wall={w} selected={selectedWallId === id} onClick={editable ? onWallClick : undefined} />
        ))}
      </g>
      <g className="walls-exterior">
        {exterior.map(([id, w]) => (
          <ArcWall key={id} plan={plan} id={id} wall={w} selected={selectedWallId === id} onClick={editable ? onWallClick : undefined} />
        ))}
      </g>
    </g>
  );
});
