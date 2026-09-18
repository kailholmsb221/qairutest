'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { FLOORS, VIEW_BOX } from '@/lib/vector-map';
import { useUiStore } from '@/lib/store/uiStore';
import { useBoardStore, useBusyByFloor } from '@/lib/store/boardStore';
import { explodedScale, fitScale, panViewBox, zoomCenter, zoomViewBox, type ViewBox } from '@/lib/map-geometry/fit';
import { FloorLayer } from './FloorLayer';
import { Legend } from './Legend';
import { StatsChip } from './StatsChip';
import { MapTooltip } from './MapTooltip';
import { TimeTravelBar } from '@/components/panels/TimeTravelBar';

const EXPLODED = { rx: 58, rz: -38 };
/** the spec's 72 px gap, grown with the layer so the lower floor stays readable beside the upper one */
const FLOOR_GAP_MIN = 72;
const FLOOR_GAP_RATIO = 0.46;
const SPRING = { stiffness: 120, damping: 18 };
const PARALLAX = { stiffness: 60, damping: 20 };
const BASE_VB: ViewBox = { x: VIEW_BOX.x, y: VIEW_BOX.y, w: VIEW_BOX.width, h: VIEW_BOX.height };
/**
 * Focus magnification lives in the viewBox (vector), not in a CSS scale: a scaled composited
 * layer is rasterised once and stretched, which is what made the plan go soft on zoom.
 * The focus viewBox is the tightest box (in the viewBox aspect) around every floor's rooms plus
 * a margin, so the plan is as large as it can be without cropping the building's edges.
 */
const FOCUS_PAD = 24;
const FOCUS_VB: ViewBox = (() => {
  const boxes = FLOORS.flatMap((f) => f.rooms.map((r) => r.bbox));
  if (!boxes.length) return BASE_VB;
  const x0 = Math.min(...boxes.map((b) => b.x)) - FOCUS_PAD;
  const y0 = Math.min(...boxes.map((b) => b.y)) - FOCUS_PAD;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + FOCUS_PAD;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + FOCUS_PAD;
  const aspect = BASE_VB.w / BASE_VB.h;
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  if (w >= BASE_VB.w) return BASE_VB;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
})();

/**
 * The 2.5D scene. Default exploded view: floors stacked with translateZ(i × 72px) under
 * rotateX(58°) rotateZ(−38°). Focus view (floor tab / room click): rotateX(0) rotateZ(0), the
 * focused floor flat and untransformed on top (magnified through its viewBox), others fade to
 * opacity .06 and move away on Z. In focus view the plan keeps the editor's wheel-zoom + drag-pan.
 * Pointer parallax tilts the scene ±2.5°.
 */
export function MapStage({ className = '' }: { className?: string }) {
  const t = useTranslations('map');
  const ts = useTranslations('state');
  const stageRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 1200, h: 700 });
  const focused = useUiStore((s) => s.focusedFloor);
  const setFocused = useUiStore((s) => s.setFocusedFloor);
  const setFilters = useUiStore((s) => s.setFilters);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const hoverRoom = useUiStore((s) => s.hoverRoom);
  const kiosk = useUiStore((s) => s.kiosk);
  const reduced = useUiStore((s) => s.reducedMotion);
  const error = useBoardStore((s) => s.error);
  const hasData = useBoardStore((s) => s.snapshot.rooms.length > 0);
  const connection = useBoardStore((s) => s.connection);
  const busyByFloor = useBusyByFloor();
  const exploded = focused === null;

  // ---- stage size
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- layer size (flat fit) and exploded scene scale
  const flat = fitScale(stage.w, stage.h - 14, VIEW_BOX.width, VIEW_BOX.height, 20);
  const layer = { w: VIEW_BOX.width * flat, h: VIEW_BOX.height * flat };
  const floorGap = Math.max(FLOOR_GAP_MIN, Math.round(layer.h * FLOOR_GAP_RATIO));
  const stack = floorGap * Math.max(0, FLOORS.length - 1);
  // rounded so the SSR transform string and the client's first render serialise identically
  const explScale = Math.round(explodedScale(stage, layer, EXPLODED.rx, EXPLODED.rz, stack) * 10000) / 10000;
  const explShift = Math.round(((stack * Math.sin((EXPLODED.rx * Math.PI) / 180)) / 2) * 100) / 100;
  /** screen y of plate i's centre in the exploded stack (translateZ(i·gap) after rotateX, then scale + shift) */
  const plateY = (i: number) => stage.h / 2 + explShift - explScale * i * floorGap * Math.sin((EXPLODED.rx * Math.PI) / 180);

  // ---- springs: base rotation + parallax
  const rotX = useSpring(exploded ? EXPLODED.rx : 0, SPRING);
  const rotZ = useSpring(exploded ? EXPLODED.rz : 0, SPRING);
  const scene = useSpring(exploded ? explScale : 1, SPRING);
  const shiftY = useSpring(exploded ? explShift : 0, SPRING);
  const pX = useSpring(0, PARALLAX);
  const pZ = useSpring(0, PARALLAX);
  const rotateX = useTransform([rotX, pX], ([a, b]) => (a as number) + (b as number));
  const rotateZ = useTransform([rotZ, pZ], ([a, b]) => (a as number) + (b as number));
  const hoverCode = useMotionValue<string | null>(null);

  useEffect(() => {
    rotX.set(exploded ? EXPLODED.rx : 0);
    rotZ.set(exploded ? EXPLODED.rz : 0);
    scene.set(exploded ? explScale : 1);
    shiftY.set(exploded ? explShift : 0);
    if (!exploded) {
      pX.set(0);
      pZ.set(0);
    }
  }, [exploded, explScale, explShift, rotX, rotZ, scene, shiftY, pX, pZ]);

  const onParallax = useCallback(
    (e: React.PointerEvent) => {
      if (!exploded || kiosk || reduced) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      pX.set(-ny * 2.5);
      pZ.set(nx * 2.5);
    },
    [exploded, kiosk, reduced, pX, pZ],
  );
  const resetParallax = useCallback(() => {
    pX.set(0);
    pZ.set(0);
  }, [pX, pZ]);

  // ---- zoom / pan (focus view only)
  const [view, setView] = useState<ViewBox>(BASE_VB);
  const svgRefs = useRef<Record<number, SVGSVGElement | null>>({});
  useEffect(() => setView(focused === null ? BASE_VB : FOCUS_VB), [focused]);

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = focused !== null ? svgRefs.current[focused] : null;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, [focused]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (focused === null) return;
      e.preventDefault();
      const p = clientToSvg(e.clientX, e.clientY);
      if (!p) return;
      const factor = Math.exp(e.deltaY * 0.0015);
      setView((vb) => zoomViewBox(vb, BASE_VB, p.x, p.y, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [focused, clientToSvg]);

  const onSelect = useCallback(
    (code: string) => {
      const room = FLOORS.flatMap((f) => f.rooms.map((r) => ({ r, floor: f.number }))).find((x) => x.r.code === code);
      if (!room) return;
      selectRoom(code);
      // any room click on the stack opens its floor — there is no separate slab button
      if (exploded) {
        setFocused(room.floor);
        setFilters({ floors: [room.floor] });
      }
    },
    [exploded, selectRoom, setFocused, setFilters],
  );
  const pan = useRef<{ x: number; y: number; vb: ViewBox; moved: boolean; upp: number } | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (focused === null || (e.button !== 0 && e.button !== 1)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      pan.current = { x: e.clientX, y: e.clientY, vb: view, moved: false, upp: view.w / Math.max(1, rect.width) };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [focused, view],
  );
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!pan.current) return;
    const dx = e.clientX - pan.current.x;
    const dy = e.clientY - pan.current.y;
    if (!pan.current.moved && Math.hypot(dx, dy) < 3) return;
    pan.current.moved = true;
    setView(panViewBox(pan.current.vb, dx * pan.current.upp, dy * pan.current.upp));
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pan.current) return;
      const moved = pan.current.moved;
      pan.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (moved) return;
      // pointer capture retargets pointerup/click to the <svg>, so resolve the room under the pointer ourselves
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-room-code]');
      const code = hit?.getAttribute('data-room-code');
      if (code) onSelect(code);
      else selectRoom(null);
    },
    [selectRoom, onSelect],
  );

  // ---- hover tooltip + selection
  const [tip, setTip] = useState<{ code: string; x: number; y: number } | null>(null);
  const tipPos = useRef({ x: 0, y: 0 });
  const onHover = useCallback(
    (code: string | null, ev?: React.PointerEvent) => {
      hoverRoom(code);
      hoverCode.set(code);
      // a plate can slide under a resting pointer (focus/exploded transition): take the position from the event itself
      const r = ev && stageRef.current?.getBoundingClientRect();
      if (ev && r) tipPos.current = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      if (!code) setTip(null);
      else setTip({ code, ...tipPos.current });
    },
    [hoverRoom, hoverCode],
  );
  const onStageMove = useCallback(
    (e: React.PointerEvent) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      tipPos.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const code = hoverCode.get();
      if (code) setTip({ code, ...tipPos.current });
      onParallax(e);
    },
    [onParallax, hoverCode],
  );

  const layers = useMemo(() => FLOORS.map((f, i) => ({ f, i })), []);
  const stageCls = ['stage', 'panel', className].filter(Boolean).join(' ');

  return (
    <section ref={stageRef} className={stageCls} data-testid="stage" data-view={exploded ? 'exploded' : 'focus'} aria-label={exploded ? t('allFloors') : t('floor', { n: focused! })}>
      <div className="scene-viewport" onPointerMove={onStageMove} onPointerLeave={resetParallax}>
        <motion.div className="scene" style={{ rotateX, rotateZ, scale: scene, y: shiftY }} data-testid="scene">
          {layers.map(({ f, i }) => {
            const isFocus = focused === f.number;
            const mode = exploded ? 'exploded' : isFocus ? 'focus' : 'background';
            return (
              <motion.div
                key={f.id}
                className="floor-layer"
                data-testid={`floor-layer-${f.number}`}
                data-mode={mode}
                style={{ width: Math.round(layer.w), height: Math.round(layer.h), marginLeft: -Math.round(layer.w) / 2, marginTop: -Math.round(layer.h) / 2, zIndex: isFocus ? 2 : 1 }}
                initial={false}
                animate={{
                  z: exploded ? i * floorGap : isFocus ? 0 : -420,
                  scale: exploded || isFocus ? 1 : 0.9,
                  opacity: exploded || isFocus ? 1 : 0.06,
                }}
                transition={{ type: 'spring', ...SPRING }}
              >
                <div className="floor-inner">
                  <FloorLayer
                    ref={(el) => {
                      svgRefs.current[f.number] = el;
                    }}
                    floor={f}
                    viewBox={isFocus ? view : BASE_VB}
                    mode={mode}
                    interactive={mode !== 'background'}
                    onHover={onHover}
                    onSelect={onSelect}
                    onPointerDown={isFocus ? onPointerDown : undefined}
                    onPointerMove={isFocus ? onPointerMove : undefined}
                    onPointerUp={isFocus ? onPointerUp : undefined}
                  />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* caption — the reference's text chip: what you are looking at and what a click does; in focus it is the way back */}
      {exploded ? (
        <div className="stage-caption" data-testid="stage-caption">
          <b>{t('allFloors')}</b>
          <span>{t('explodedHint')}</span>
        </div>
      ) : (
        <button type="button" className="stage-caption" onClick={() => { setFocused(null); setFilters({ floors: [] }); }} data-testid="stage-caption" title={t('exploded')}>
          <b>{t('floor', { n: focused! })}</b>
          <span>{t('focusHint')}</span>
          <span className="kbd">{t('backToAll')}</span>
        </button>
      )}
      {/* floor tags beside the stack: «— F2 · занято 7», each a button that opens its floor */}
      {exploded &&
        layers.map(({ f, i }) => (
          <button
            key={f.id}
            type="button"
            className="floor-tag"
            style={{ top: Math.round(plateY(i)) }}
            onClick={() => { setFocused(f.number); setFilters({ floors: [f.number] }); }}
            aria-label={`${t('floor', { n: f.number })} · ${t('busyShort', { n: busyByFloor[f.number] ?? 0 })}`}
            data-testid={`floor-tag-${f.number}`}
          >
            <b>{t('floorTag', { n: f.number })}</b>
            <span>· {t('busyShort', { n: busyByFloor[f.number] ?? 0 })}</span>
          </button>
        ))}
      <Legend />
      <StatsChip />
      <div className="map-controls" role="toolbar" aria-label="Map controls">
        <button type="button" className={exploded ? 'is-active' : ''} title={t('exploded')} aria-label={t('exploded')} onClick={() => { setFocused(null); setFilters({ floors: [] }); }} data-testid="map-exploded">
          ⧉
        </button>
        <button type="button" title={t('zoomIn')} aria-label={t('zoomIn')} disabled={exploded} onClick={() => setView((vb) => zoomCenter(vb, BASE_VB, 0.8))}>
          +
        </button>
        <button type="button" title={t('zoomOut')} aria-label={t('zoomOut')} disabled={exploded} onClick={() => setView((vb) => zoomCenter(vb, BASE_VB, 1.25))}>
          −
        </button>
        <button type="button" title={t('fit')} aria-label={t('fit')} disabled={exploded} onClick={() => setView(FOCUS_VB)}>
          ⤢
        </button>
      </div>
      {tip && <MapTooltip code={tip.code} x={tip.x} y={tip.y} stage={stage} />}
      <TimeTravelBar />

      {!hasData && (
        <div className="state-screen" role="status" data-testid="state-screen">
          <div className="glass" style={{ padding: 24 }}>
            {error || connection === 'offline' ? (
              <>
                <h2>{ts('errorTitle')}</h2>
                <p>{ts('errorText')}</p>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  {ts('retry')}
                </button>
              </>
            ) : (
              <>
                <h2>{ts('loadingTitle')}</h2>
                <p>{ts('loadingText')}</p>
                <span className="skeleton" style={{ width: 220, height: 10 }} />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
