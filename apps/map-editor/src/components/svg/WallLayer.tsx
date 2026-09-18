import { memo } from 'react';
import type { FloorPlan } from '@/types/plan';
import { ArcWall } from './ArcWall';

interface Props {
  plan: FloorPlan;
  editable: boolean;
  selectedWallId: string | null;
  onWallClick?: (id: string, e: React.MouseEvent<SVGPathElement>) => void;
}

/**
 * Все стены этажа, каждая ровно один раз, поверх заливок помещений. Если у этажа есть штрихи
 * чертежа, в режиме просмотра рисуются они (дословно); топологические стены — в редакторе.
 */
export const WallLayer = memo(function WallLayer({ plan, editable, selectedWallId, onWallClick }: Props) {
  if (!editable && plan.strokes?.length) {
    return (
      <g className="walls">
        <g className="walls-interior">
          {plan.strokes.filter((s) => !s.exterior).map((s) => (
            <path key={s.id} d={s.d} className="wall wall-interior" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <g className="walls-exterior">
          {plan.strokes.filter((s) => s.exterior).map((s) => (
            <path key={s.id} d={s.d} className="wall wall-exterior" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </g>
    );
  }
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
