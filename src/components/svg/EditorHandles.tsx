import type { FloorPlan, Point } from '@/types/plan';

interface Props {
  plan: FloorPlan;
  unitsPerPixel: number;
  selectedPointId: string | null;
  pendingPointId: string | null;
  guides: { axis: 'x' | 'y'; value: number }[];
  onPointerDown: (id: string, e: React.PointerEvent<SVGCircleElement>) => void;
}

/** Узловые точки для перетаскивания — только в режиме редактирования. */
export function EditorHandles({ plan, unitsPerPixel, selectedPointId, pendingPointId, guides, onPointerDown }: Props) {
  const r = 4 * unitsPerPixel;
  const vb = plan.viewBox;
  return (
    <g className="editor-handles">
      {guides.map((g, i) =>
        g.axis === 'x' ? (
          <line key={i} className="snap-guide" x1={g.value} y1={vb.y} x2={g.value} y2={vb.y + vb.height} vectorEffect="non-scaling-stroke" />
        ) : (
          <line key={i} className="snap-guide" x1={vb.x} y1={g.value} x2={vb.x + vb.width} y2={g.value} vectorEffect="non-scaling-stroke" />
        ),
      )}
      {Object.entries(plan.points).map(([id, p]: [string, Point]) => (
        <circle
          key={id}
          className={['handle', selectedPointId === id ? 'is-selected' : '', pendingPointId === id ? 'is-pending' : ''].filter(Boolean).join(' ')}
          cx={p.x}
          cy={p.y}
          r={selectedPointId === id ? r * 1.4 : r}
          data-point-id={id}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(e) => onPointerDown(id, e)}
        />
      ))}
    </g>
  );
}
