import type { FloorPlan, SpecialZone } from '@/types/plan';
import { boundaryPolyline, bbox, centroid } from '@/geometry/buildRoomPath';
import { StairShape } from './StairShape';
import { LiftShape } from './LiftShape';

interface Props {
  plan: FloorPlan;
  zones: SpecialZone[];
}

/** Слой спецзон: лестницы, лифты, санузлы, техпомещения, проёмы. */
export function ZoneIcons({ plan, zones }: Props) {
  return (
    <g className="zones" pointerEvents="none">
      {zones.map((z) => {
        const room = plan.rooms.find((r) => r.id === z.roomId);
        if (!room) return null;
        const poly = boundaryPolyline(plan, room.boundary);
        if (poly.length < 3) return null;
        switch (z.kind) {
          case 'stairs':
            return <StairShape key={z.id} poly={poly} angle={z.angle ?? 0} />;
          case 'lift':
            return <LiftShape key={z.id} poly={poly} />;
          case 'wc': {
            const c = centroid(poly);
            const b = bbox(poly);
            const size = Math.min(b.maxX - b.minX, b.maxY - b.minY);
            if (!room.hideLabel || size < 30) return null;
            return (
              <text key={z.id} x={c.x} y={c.y} className="zone-glyph" fontSize={Math.min(9, size / 4)} textAnchor="middle" dominantBaseline="middle">
                WC
              </text>
            );
          }
          case 'tech':
          case 'shaft': {
            const b = bbox(poly);
            const inset = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.15;
            return (
              <rect
                key={z.id}
                x={b.minX + inset}
                y={b.minY + inset}
                width={b.maxX - b.minX - inset * 2}
                height={b.maxY - b.minY - inset * 2}
                rx={z.kind === 'shaft' ? 12 : 0}
                className={z.kind === 'shaft' ? 'zone-shaft' : 'zone-tech'}
                fill="url(#hatch)"
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          default:
            return null;
        }
      })}
    </g>
  );
}
