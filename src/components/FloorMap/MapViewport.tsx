import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloorPlan, Point, ViewBox } from '@/types/plan';
import { useMapStore } from '@/store/mapStore';
import { FloorMap } from './FloorMap';
import { MapControls } from './MapControls';
import { UI } from '@/styles/theme';

interface Props {
  plan: FloorPlan;
}

const MIN_SCALE = 0.25; // относительно исходного viewBox
const MAX_SCALE = 12;

/** SVG-область карты: единый viewBox, zoom колесом, pan перетаскиванием. */
export function MapViewport({ plan }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewBox = useMapStore((s) => s.viewBox);
  const setViewBox = useMapStore((s) => s.setViewBox);
  const mode = useMapStore((s) => s.mode);
  const editor = useMapStore((s) => s.editor);
  const setCursor = useMapStore((s) => s.setCursor);
  const selectRoom = useMapStore((s) => s.selectRoom);
  const selectPoint = useMapStore((s) => s.selectPoint);
  const undo = useMapStore((s) => s.undo);
  const redo = useMapStore((s) => s.redo);
  const setMode = useMapStore((s) => s.setMode);
  const [size, setSize] = useState({ w: 1, h: 1 });

  // размер контейнера → units per pixel
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);

  const unitsPerPixel = Math.max(viewBox.width / size.w, viewBox.height / size.h);

  const clientToSvg = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  // ---- zoom колесом вокруг курсора
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = useMapStore.getState().viewBox;
      const base = plan.viewBox;
      const factor = Math.exp(e.deltaY * 0.0015);
      const scale = base.width / vb.width;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale / factor));
      const f = scale / nextScale;
      const p = clientToSvg(e.clientX, e.clientY);
      const next: ViewBox = {
        x: p.x - (p.x - vb.x) * f,
        y: p.y - (p.y - vb.y) * f,
        width: vb.width * f,
        height: vb.height * f,
      };
      setViewBox(next);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [plan.viewBox, clientToSvg, setViewBox]);

  // ---- pan перетаскиванием фона
  const pan = useRef<{ startX: number; startY: number; vb: ViewBox; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element;
    if (target.closest('.handle') || target.closest('.room-label.is-editable')) return;
    pan.current = { startX: e.clientX, startY: e.clientY, vb: useMapStore.getState().viewBox, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === 'edit' && editor.showCoords) {
      const p = clientToSvg(e.clientX, e.clientY);
      setCursor({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
    }
    if (!pan.current) return;
    const dx = e.clientX - pan.current.startX;
    const dy = e.clientY - pan.current.startY;
    if (!pan.current.moved && Math.hypot(dx, dy) < 3) return;
    pan.current.moved = true;
    const { vb } = pan.current;
    setViewBox({ x: vb.x - dx * unitsPerPixel, y: vb.y - dy * unitsPerPixel, width: vb.width, height: vb.height });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pan.current) return;
    const wasDrag = pan.current.moved;
    pan.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (!wasDrag) {
      const target = e.target as Element;
      // клик по пустому месту — сброс выбора
      if (!target.closest('[data-room-id]') && !target.closest('[data-wall-id]') && !target.closest('[data-door-id]') && !target.closest('.handle')) {
        selectRoom(null);
        selectPoint(null);
      }
    }
  };

  // ---- горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        selectRoom(null);
        selectPoint(null);
      } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
        setMode(useMapStore.getState().mode === 'edit' ? 'view' : 'edit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectRoom, selectPoint, setMode]);

  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const showGrid = mode === 'edit' && editor.showGrid;
  const g = editor.grid;

  return (
    <div className="viewport">
      <svg
        ref={svgRef}
        className={mode === 'edit' ? 'map-svg is-edit' : 'map-svg'}
        viewBox={vbStr}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#6b8cae" strokeWidth="1" opacity="0.5" />
          </pattern>
          <pattern id="grid-minor" width={g} height={g} patternUnits="userSpaceOnUse">
            <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke={UI.grid} strokeWidth="0.3" />
          </pattern>
          <pattern id="grid-major" width={g * 10} height={g * 10} patternUnits="userSpaceOnUse">
            <rect width={g * 10} height={g * 10} fill="url(#grid-minor)" />
            <path d={`M ${g * 10} 0 L 0 0 0 ${g * 10}`} fill="none" stroke={UI.gridMajor} strokeWidth="0.6" />
          </pattern>
          <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {showGrid && (
          <rect x={plan.viewBox.x - 2000} y={plan.viewBox.y - 2000} width={plan.viewBox.width + 4000} height={plan.viewBox.height + 4000} fill="url(#grid-major)" pointerEvents="none" />
        )}
        <FloorMap plan={plan} unitsPerPixel={unitsPerPixel} clientToSvg={clientToSvg} />
      </svg>
      <MapControls />
      {mode === 'edit' && editor.showCoords && <CursorReadout />}
    </div>
  );
}

function CursorReadout() {
  const cursor = useMapStore((s) => s.cursor);
  const editSel = useMapStore((s) => s.editSel);
  const plan = useMapStore((s) => s.floors.find((f) => f.id === s.activeFloorId));
  const p = editSel.pointId && plan ? plan.points[editSel.pointId] : null;
  return (
    <div className="cursor-readout">
      <span>x: {cursor ? cursor.x.toFixed(1) : '—'}</span>
      <span>y: {cursor ? cursor.y.toFixed(1) : '—'}</span>
      {p && (
        <span className="muted">
          {editSel.pointId}: ({p.x}, {p.y})
        </span>
      )}
      <span className="muted">Alt — без привязки</span>
    </div>
  );
}
