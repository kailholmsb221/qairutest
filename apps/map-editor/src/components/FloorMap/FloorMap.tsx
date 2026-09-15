import { useCallback, useMemo, useRef, useState } from 'react';
import type { FloorPlan, Point, Room } from '@/types/plan';
import { buildRoomPath } from '@/geometry/buildRoomPath';
import { snapPoint } from '@/geometry/snapping';
import { doorGeometry } from '@/geometry/doorGeometry';
import { useMapStore } from '@/store/mapStore';
import { RoomShape } from '@/components/svg/RoomShape';
import { WallLayer } from '@/components/svg/WallLayer';
import { DoorShape } from '@/components/svg/DoorShape';
import { ZoneIcons } from '@/components/svg/ZoneIcons';
import { RoomLabel } from '@/components/svg/RoomLabel';
import { EditorHandles } from '@/components/svg/EditorHandles';

interface Props {
  plan: FloorPlan;
  unitsPerPixel: number;
  clientToSvg: (clientX: number, clientY: number) => Point;
}

const SERVICE_TYPES = new Set(['corridor', 'wc', 'stairs', 'lift', 'tech']);

/** Собирает все графические слои этажа в правильном порядке. */
export function FloorMap({ plan, unitsPerPixel, clientToSvg }: Props) {
  const mode = useMapStore((s) => s.mode);
  const tool = useMapStore((s) => s.tool);
  const selectedRoomId = useMapStore((s) => s.selectedRoomId);
  const hoveredRoomId = useMapStore((s) => s.hoveredRoomId);
  const search = useMapStore((s) => s.search);
  const statusFilter = useMapStore((s) => s.statusFilter);
  const editor = useMapStore((s) => s.editor);
  const editSel = useMapStore((s) => s.editSel);
  const issues = useMapStore((s) => s.issues);
  const selectRoom = useMapStore((s) => s.selectRoom);
  const hoverRoom = useMapStore((s) => s.hoverRoom);
  const selectPoint = useMapStore((s) => s.selectPoint);
  const selectWall = useMapStore((s) => s.selectWall);
  const selectDoor = useMapStore((s) => s.selectDoor);
  const beginPointDrag = useMapStore((s) => s.beginPointDrag);
  const movePoint = useMapStore((s) => s.movePoint);
  const endPointDrag = useMapStore((s) => s.endPointDrag);
  const clickPointForWall = useMapStore((s) => s.clickPointForWall);
  const deleteWall = useMapStore((s) => s.deleteWall);
  const splitWall = useMapStore((s) => s.splitWall);
  const addDoor = useMapStore((s) => s.addDoor);
  const setRoomLabel = useMapStore((s) => s.setRoomLabel);

  const editable = mode === 'edit';
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; value: number }[]>([]);
  const drag = useRef<{ pointId: string; neighbours: string[] } | null>(null);
  const labelDrag = useRef<{ roomId: string } | null>(null);

  const q = search.trim().toLowerCase();
  const matches = useCallback(
    (r: Room) => {
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (!q) return true;
      return [r.number, r.name, r.planName ?? ''].some((t) => t.toLowerCase().includes(q));
    },
    [q, statusFilter],
  );
  const filtering = q.length > 0 || statusFilter.length > 0;

  const invalidRooms = useMemo(() => new Set(issues.filter((i) => i.level === 'error' && i.roomId).map((i) => i.roomId!)), [issues]);
  const exteriorPath = useMemo(() => buildRoomPath(plan, plan.exterior), [plan]);
  const mainRooms = plan.rooms.filter((r) => !SERVICE_TYPES.has(r.type));
  const serviceRooms = plan.rooms.filter((r) => SERVICE_TYPES.has(r.type));
  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId);
  const selectedPath = selectedRoom ? buildRoomPath(plan, selectedRoom.boundary) : '';

  // ---- перетаскивание точек
  const onHandleDown = (id: string, e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (tool === 'addWall') {
      clickPointForWall(id);
      return;
    }
    selectPoint(id);
    const neighbours = Object.values(plan.walls)
      .filter((w) => w.start === id || w.end === id)
      .map((w) => (w.start === id ? w.end : w.start));
    drag.current = { pointId: id, neighbours };
    beginPointDrag();
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!drag.current) return;
    const raw = clientToSvg(e.clientX, e.clientY);
    const snapping = !e.altKey;
    const res = snapPoint(raw, plan.points, drag.current.pointId, drag.current.neighbours, {
      grid: editor.grid,
      snapToGrid: snapping && editor.snapGrid,
      snapToPoints: snapping && editor.snapPoints,
      snapToAxis: snapping && editor.snapAxis,
      threshold: 6 * unitsPerPixel,
    });
    setGuides(res.guides);
    movePoint(drag.current.pointId, res.point);
  };
  const onHandleUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setGuides([]);
    endPointDrag();
  };

  // ---- перетаскивание подписи
  const onLabelDown = (roomId: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    labelDrag.current = { roomId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    selectRoom(roomId);
  };
  const onLabelMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!labelDrag.current) return;
    const p = clientToSvg(e.clientX, e.clientY);
    setRoomLabel(labelDrag.current.roomId, p);
  };
  const onLabelUp = () => {
    labelDrag.current = null;
  };

  // ---- клики по стенам в редакторе
  const onWallClick = (id: string, e: React.MouseEvent<SVGPathElement>) => {
    e.stopPropagation();
    switch (tool) {
      case 'deleteWall':
        deleteWall(id);
        break;
      case 'splitWall':
        splitWall(id);
        break;
      case 'addDoor': {
        const w = plan.walls[id];
        const a = plan.points[w.start];
        const b = plan.points[w.end];
        const p = clientToSvg(e.clientX, e.clientY);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0.05, Math.min(0.95, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        addDoor(id, Math.round(t * 100) / 100);
        break;
      }
      default:
        selectWall(id);
    }
  };

  const selectedDoor = plan.doors.find((d) => d.id === editSel.doorId);
  const selDoorGeom = selectedDoor ? doorGeometry(plan, selectedDoor) : null;
  const selWall = editSel.wallId ? plan.walls[editSel.wallId] : null;

  return (
    <g className={editable ? 'floor floor-edit' : 'floor'}>
      {/* 1. внешний контур и фон этажа */}
      <g className="floor-bg">
        <path d={exteriorPath} className="floor-outline-glow" vectorEffect="non-scaling-stroke" />
        <path d={exteriorPath} className="floor-outline-fill" />
      </g>

      {/* 2. заливки комнат */}
      <g className="rooms rooms-main">
        {mainRooms.map((r) => (
          <RoomShape key={r.id} plan={plan} room={r} hovered={hoveredRoomId === r.id} selected={selectedRoomId === r.id}
            dimmed={filtering && !matches(r)} invalid={invalidRooms.has(r.id)} interactive={!editable || tool === 'select'}
            onHover={hoverRoom} onSelect={selectRoom} />
        ))}
      </g>

      {/* 3. заливки коридоров и специальных зон */}
      <g className="rooms rooms-service">
        {serviceRooms.map((r) => (
          <RoomShape key={r.id} plan={plan} room={r} hovered={hoveredRoomId === r.id} selected={selectedRoomId === r.id}
            dimmed={filtering && !matches(r)} invalid={invalidRooms.has(r.id)} interactive={!editable || tool === 'select'}
            onHover={hoverRoom} onSelect={selectRoom} />
        ))}
      </g>

      {/* 4. стены */}
      <WallLayer plan={plan} editable={editable} selectedWallId={editSel.wallId} onWallClick={onWallClick} />

      {/* 5. двери */}
      <g className="doors">
        {plan.doors.map((d) => (
          <DoorShape key={d.id} plan={plan} door={d} selected={editSel.doorId === d.id} editable={editable} onClick={editable ? selectDoor : undefined} />
        ))}
      </g>

      {/* 6. лестницы, лифты, санузлы, техзоны */}
      <ZoneIcons plan={plan} zones={plan.specialZones} />

      {/* 7. подписи */}
      <g className={filtering ? 'labels is-filtering' : 'labels'} onPointerMove={onLabelMove} onPointerUp={onLabelUp}>
        {plan.rooms.map((r) => (
          <g key={r.id} className={filtering && !matches(r) ? 'label-dimmed' : undefined}>
            <RoomLabel plan={plan} room={r} forceShow={selectedRoomId === r.id || hoveredRoomId === r.id} editable={editable && tool === 'select'} onDragStart={onLabelDown} />
          </g>
        ))}
      </g>

      {/* 9. подсветка выбранного объекта */}
      <g className="selection" pointerEvents="none">
        {selectedPath && <path d={selectedPath} className="selection-outline" vectorEffect="non-scaling-stroke" />}
        {selWall && (
          <line className="selection-wall" x1={plan.points[selWall.start]?.x} y1={plan.points[selWall.start]?.y}
            x2={plan.points[selWall.end]?.x} y2={plan.points[selWall.end]?.y} vectorEffect="non-scaling-stroke" />
        )}
        {selDoorGeom && <circle className="selection-door" cx={selDoorGeom.center.x} cy={selDoorGeom.center.y} r={6 * unitsPerPixel} vectorEffect="non-scaling-stroke" />}
      </g>

      {/* 8. интерактивные маркеры редактора */}
      {editable && (
        <g onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
          <EditorHandles plan={plan} unitsPerPixel={unitsPerPixel} selectedPointId={editSel.pointId}
            pendingPointId={editSel.pendingPointId} guides={guides} onPointerDown={onHandleDown} />
        </g>
      )}
    </g>
  );
}
