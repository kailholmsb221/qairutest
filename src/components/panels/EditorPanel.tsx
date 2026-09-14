import { useRef } from 'react';
import type { DoorSwing, FloorPlan } from '@/types/plan';
import { useMapStore, type EditorTool } from '@/store/mapStore';
import { useHistoryStore } from '@/store/historyStore';
import { parseFloorJson } from '@/data/loadFloors';

interface Props {
  plan: FloorPlan;
}

const TOOLS: { id: EditorTool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор / перенос', hint: 'Тяните точки; клик по стене или двери — выбор' },
  { id: 'addWall', label: 'Добавить стену', hint: 'Кликните две точки' },
  { id: 'splitWall', label: 'Разделить стену', hint: 'Клик по стене — точка посередине' },
  { id: 'deleteWall', label: 'Удалить стену', hint: 'Только стены, не входящие в контуры' },
  { id: 'addDoor', label: 'Добавить дверь', hint: 'Клик по стене в нужном месте' },
];

const SWINGS: DoorSwing[] = ['left-in', 'right-in', 'left-out', 'right-out', 'double', 'none'];

/** Панель редактора: инструменты, привязки, выбранная стена/дверь, проверка, undo/redo, JSON. */
export function EditorPanel({ plan }: Props) {
  const tool = useMapStore((s) => s.tool);
  const setTool = useMapStore((s) => s.setTool);
  const editor = useMapStore((s) => s.editor);
  const setEditor = useMapStore((s) => s.setEditor);
  const editSel = useMapStore((s) => s.editSel);
  const issues = useMapStore((s) => s.issues);
  const undo = useMapStore((s) => s.undo);
  const redo = useMapStore((s) => s.redo);
  const setWallType = useMapStore((s) => s.setWallType);
  const setWallBulge = useMapStore((s) => s.setWallBulge);
  const splitWall = useMapStore((s) => s.splitWall);
  const deleteWall = useMapStore((s) => s.deleteWall);
  const addDoor = useMapStore((s) => s.addDoor);
  const updateDoor = useMapStore((s) => s.updateDoor);
  const deleteDoor = useMapStore((s) => s.deleteDoor);
  const importFloor = useMapStore((s) => s.importFloor);
  const setMessage = useMapStore((s) => s.setMessage);
  const message = useMapStore((s) => s.message);
  const selectWall = useMapStore((s) => s.selectWall);
  const hist = useHistoryStore((s) => s.byFloor[plan.id]);
  const fileRef = useRef<HTMLInputElement>(null);

  const wall = editSel.wallId ? plan.walls[editSel.wallId] : null;
  const door = plan.doors.find((d) => d.id === editSel.doorId) ?? null;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = parseFloorJson(text);
    if (res.plan) importFloor(res.plan);
    else setMessage(`Импорт отклонён: ${res.errors?.slice(0, 5).join('; ')}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="panel editor-panel">
      <div className="panel-title">Редактор</div>

      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={tool === t.id ? 'is-active' : ''} title={t.hint} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted small">{TOOLS.find((t) => t.id === tool)?.hint}</p>

      <div className="row-buttons">
        <button type="button" onClick={undo} disabled={!hist?.past.length}>↶ Отменить</button>
        <button type="button" onClick={redo} disabled={!hist?.future.length}>↷ Повторить</button>
      </div>

      <fieldset className="snap">
        <legend>Привязки</legend>
        <label><input type="checkbox" checked={editor.snapGrid} onChange={(e) => setEditor({ snapGrid: e.target.checked })} /> К сетке</label>
        <label>
          шаг
          <input type="number" min={1} max={100} value={editor.grid} onChange={(e) => setEditor({ grid: Math.max(1, Number(e.target.value) || 5) })} />
        </label>
        <label><input type="checkbox" checked={editor.snapPoints} onChange={(e) => setEditor({ snapPoints: e.target.checked })} /> К ближайшей точке</label>
        <label><input type="checkbox" checked={editor.snapAxis} onChange={(e) => setEditor({ snapAxis: e.target.checked })} /> К горизонтали/вертикали</label>
        <label><input type="checkbox" checked={editor.showGrid} onChange={(e) => setEditor({ showGrid: e.target.checked })} /> Показывать сетку</label>
        <label><input type="checkbox" checked={editor.showCoords} onChange={(e) => setEditor({ showCoords: e.target.checked })} /> Координаты курсора</label>
        <p className="muted small">Alt при перетаскивании временно отключает привязки.</p>
      </fieldset>

      {wall && editSel.wallId && (
        <fieldset>
          <legend>Стена <span className="mono">{editSel.wallId}</span></legend>
          <div className="muted small">
            {wall.start} → {wall.end}{wall.exterior ? ' · внешняя' : ''}{wall.virtual ? ' · условная' : ''}
          </div>
          <div className="row-buttons">
            <button type="button" className={wall.type === 'line' ? 'is-active' : ''} onClick={() => setWallType(editSel.wallId!, 'line')}>Прямая</button>
            <button type="button" className={wall.type === 'arc' ? 'is-active' : ''} onClick={() => setWallType(editSel.wallId!, 'arc')}>Дуга</button>
          </div>
          {wall.type === 'arc' && (
            <label>
              bulge {wall.bulge?.toFixed(3)}
              <input type="range" min={-0.99} max={0.99} step={0.005} value={wall.bulge ?? 0.2} onChange={(e) => setWallBulge(editSel.wallId!, Number(e.target.value))} />
            </label>
          )}
          <div className="row-buttons">
            <button type="button" onClick={() => splitWall(editSel.wallId!)}>Разделить</button>
            <button type="button" onClick={() => addDoor(editSel.wallId!)}>+ Дверь</button>
            <button type="button" className="danger" onClick={() => deleteWall(editSel.wallId!)}>Удалить</button>
            <button type="button" onClick={() => selectWall(null)}>Снять выбор</button>
          </div>
        </fieldset>
      )}

      {door && (
        <fieldset>
          <legend>Дверь <span className="mono">{door.id}</span></legend>
          <label>
            Положение {door.position.toFixed(2)}
            <input type="range" min={0.02} max={0.98} step={0.01} value={door.position} onChange={(e) => updateDoor(door.id, { position: Number(e.target.value) })} />
          </label>
          <label>
            Ширина {door.width}
            <input type="range" min={10} max={80} step={1} value={door.width} onChange={(e) => updateDoor(door.id, { width: Number(e.target.value) })} />
          </label>
          <label>
            Открывание
            <select value={door.swing} onChange={(e) => updateDoor(door.id, { swing: e.target.value as DoorSwing })}>
              {SWINGS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" className="danger" onClick={() => deleteDoor(door.id)}>Удалить дверь</button>
        </fieldset>
      )}

      <fieldset>
        <legend>
          Проверка геометрии{' '}
          <span className={errors.length ? 'badge danger' : 'badge ok'}>{errors.length ? `${errors.length} ошибок` : 'OK'}</span>
          {warnings.length > 0 && <span className="badge warn">{warnings.length} предупр.</span>}
        </legend>
        {issues.length === 0 ? (
          <p className="muted small">Все контуры замкнуты, самопересечений и щелей нет, стены выровнены.</p>
        ) : (
          <ul className="issue-list">
            {issues.slice(0, 40).map((i, k) => (
              <li key={k} className={i.level}>{i.message}</li>
            ))}
            {issues.length > 40 && <li className="muted">… и ещё {issues.length - 40}</li>}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>JSON</legend>
        <div className="row-buttons">
          <button type="button" onClick={exportJson}>Экспорт этажа</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Импорт…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        <p className="muted small">Импорт проверяется Zod-схемой и ссылочной целостностью.</p>
      </fieldset>

      {message && (
        <div className="message" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
    </div>
  );
}
