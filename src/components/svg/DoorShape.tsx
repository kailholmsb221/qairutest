import type { Door, FloorPlan } from '@/types/plan';
import { doorGeometry } from '@/geometry/doorGeometry';
import { fmt } from '@/geometry/bulgeToArc';

interface Props {
  plan: FloorPlan;
  door: Door;
  selected?: boolean;
  editable?: boolean;
  onClick?: (id: string) => void;
}

/** Дверной проём: разрыв в стене, полотно и дуга открывания. */
export function DoorShape({ plan, door, selected, editable, onClick }: Props) {
  const g = doorGeometry(plan, door);
  if (!g) return null;
  const { a, b, along, normal } = g;
  const w = door.width;
  const dir = door.swing.endsWith('out') ? -1 : 1;
  const leaves: string[] = [];
  const leaf = (hinge: { x: number; y: number }, sign: number, len: number) => {
    // полотно от петли перпендикулярно стене, дуга — четверть окружности к другому краю проёма
    const tip = { x: hinge.x + normal.x * dir * len, y: hinge.y + normal.y * dir * len };
    const end = { x: hinge.x + along.x * sign * len, y: hinge.y + along.y * sign * len };
    const sweep = (sign === 1) === (dir === 1) ? 0 : 1;
    leaves.push(`M ${fmt(hinge.x)} ${fmt(hinge.y)} L ${fmt(tip.x)} ${fmt(tip.y)} A ${fmt(len)} ${fmt(len)} 0 0 ${sweep} ${fmt(end.x)} ${fmt(end.y)}`);
  };
  switch (door.swing) {
    case 'left-in':
    case 'left-out':
      leaf(a, 1, w);
      break;
    case 'right-in':
    case 'right-out':
      leaf(b, -1, w);
      break;
    case 'double':
      leaf(a, 1, w / 2);
      leaf(b, -1, w / 2);
      break;
    default:
      break;
  }
  return (
    <g className={['door', selected ? 'is-selected' : '', editable ? 'is-editable' : ''].filter(Boolean).join(' ')} data-door-id={door.id}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(door.id); } : undefined}>
      <line className="door-opening" x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
      {leaves.map((d, i) => (
        <path key={i} className="door-leaf" d={d} vectorEffect="non-scaling-stroke" />
      ))}
      {editable && <line className="door-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />}
    </g>
  );
}
