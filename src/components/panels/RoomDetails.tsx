import { useMemo } from 'react';
import type { FloorPlan, RoomStatus, RoomType } from '@/types/plan';
import { boundaryPolyline, signedArea } from '@/geometry/buildRoomPath';
import { useMapStore } from '@/store/mapStore';
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS, roomFill } from '@/styles/theme';

interface Props {
  plan: FloorPlan;
}

/** Карточка выбранного помещения; в режиме Edit — редактируемые поля. */
export function RoomDetails({ plan }: Props) {
  const selectedRoomId = useMapStore((s) => s.selectedRoomId);
  const hoveredRoomId = useMapStore((s) => s.hoveredRoomId);
  const mode = useMapStore((s) => s.mode);
  const updateRoom = useMapStore((s) => s.updateRoom);
  const issues = useMapStore((s) => s.issues);
  const id = selectedRoomId ?? hoveredRoomId;
  const room = plan.rooms.find((r) => r.id === id);

  const info = useMemo(() => {
    if (!room) return null;
    const poly = boundaryPolyline(plan, room.boundary);
    const px2 = Math.abs(signedArea(poly));
    // Масштаб: хорда фасада 1260 ед. ≈ 43 м (размерная цепочка 8200×4 + 6200 + ... на чертеже) → 1 ед. ≈ 0.034 м
    const m2 = px2 * 0.0341 * 0.0341;
    const wallIds = new Set(room.boundary.map((b) => b.wallId));
    const doors = plan.doors.filter((d) => wallIds.has(d.wallId)).length;
    const neighbours = plan.rooms.filter((r) => r.id !== room.id && r.boundary.some((b) => wallIds.has(b.wallId)));
    return { m2, doors, neighbours, segments: room.boundary.length, arcs: room.boundary.filter((b) => plan.walls[b.wallId]?.type === 'arc').length };
  }, [plan, room]);

  if (!room || !info) {
    return (
      <div className="panel room-details">
        <div className="panel-title">Помещение</div>
        <p className="muted">Наведите курсор или кликните по помещению на карте.</p>
      </div>
    );
  }

  const roomIssues = issues.filter((i) => i.roomId === room.id);
  const isPinned = selectedRoomId === room.id;

  return (
    <div className={isPinned ? 'panel room-details is-pinned' : 'panel room-details'}>
      <div className="room-head">
        <span className="room-swatch" style={{ background: roomFill(room) }} />
        <div>
          <div className="room-number">{room.number || '—'}</div>
          <div className="room-name">{room.name}</div>
        </div>
      </div>
      {room.planName && <div className="room-plan-name">На чертеже: {room.planName}</div>}
      <dl className="room-props">
        <dt>Статус</dt>
        <dd>
          <span className="dot" style={{ background: STATUS_COLORS[room.status] }} /> {STATUS_LABELS[room.status]}
        </dd>
        <dt>Тип</dt>
        <dd>{TYPE_LABELS[room.type]}</dd>
        <dt>Площадь</dt>
        <dd>
          {room.area ? `${room.area.toFixed(2)} м² (чертёж)` : '—'} · {info.m2.toFixed(1)} м² (модель)
        </dd>
        <dt>Контур</dt>
        <dd>
          {info.segments} стен{info.arcs ? `, дуг: ${info.arcs}` : ''}, дверей: {info.doors}
        </dd>
        <dt>Соседи</dt>
        <dd className="neighbours">{info.neighbours.map((n) => n.number || n.name).join(', ') || '—'}</dd>
        <dt>ID</dt>
        <dd className="mono">{room.id}</dd>
      </dl>
      {roomIssues.length > 0 && (
        <ul className="issue-list">
          {roomIssues.map((i, k) => (
            <li key={k} className={i.level}>{i.message}</li>
          ))}
        </ul>
      )}
      {mode === 'edit' && isPinned && (
        <div className="room-edit">
          <label>
            Номер
            <input value={room.number} onChange={(e) => updateRoom(room.id, { number: e.target.value })} />
          </label>
          <label>
            Название
            <input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
          </label>
          <label>
            Название на чертеже
            <input value={room.planName ?? ''} onChange={(e) => updateRoom(room.id, { planName: e.target.value || undefined })} />
          </label>
          <label>
            Тип
            <select value={room.type} onChange={(e) => updateRoom(room.id, { type: e.target.value as RoomType })}>
              {(Object.keys(TYPE_LABELS) as RoomType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select value={room.status} onChange={(e) => updateRoom(room.id, { status: e.target.value as RoomStatus })}>
              {(Object.keys(STATUS_LABELS) as RoomStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={!!room.hideLabel} onChange={(e) => updateRoom(room.id, { hideLabel: e.target.checked })} />
            Скрыть подпись
          </label>
          <p className="muted small">Подпись можно перетащить прямо на карте.</p>
        </div>
      )}
    </div>
  );
}
