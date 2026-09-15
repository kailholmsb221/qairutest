/** Pure helpers for sizing the 2.5D scene inside the stage. */

export interface Size {
  w: number;
  h: number;
}

/** Scale that fits a viewBox of `vw×vh` into `sw×sh` with `pad` px on each side. */
export function fitScale(sw: number, sh: number, vw: number, vh: number, pad = 24): number {
  const aw = Math.max(1, sw - pad * 2);
  const ah = Math.max(1, sh - pad * 2);
  return Math.max(0.01, Math.min(aw / vw, ah / vh));
}

/**
 * Approximate on-screen bounding box of a `w×h` plane after rotateZ(rz) then rotateX(rx),
 * with `stack` px of translateZ spread (floors × gap). Perspective is ignored (small error).
 */
export function projectedExtent(w: number, h: number, rxDeg: number, rzDeg: number, stack = 0): Size {
  const rz = (rzDeg * Math.PI) / 180;
  const rx = (rxDeg * Math.PI) / 180;
  const wz = Math.abs(w * Math.cos(rz)) + Math.abs(h * Math.sin(rz));
  const hz = Math.abs(w * Math.sin(rz)) + Math.abs(h * Math.cos(rz));
  return { w: wz, h: hz * Math.cos(rx) + stack * Math.sin(rx) };
}

/** Extra scene scale so the exploded stack fits the stage (≤ 1). */
export function explodedScale(stage: Size, layer: Size, rx: number, rz: number, stack: number, pad = 12): number {
  const ext = projectedExtent(layer.w, layer.h, rx, rz, stack);
  const s = Math.min((stage.w - pad * 2) / ext.w, (stage.h - pad * 2) / ext.h);
  return Math.max(0.2, Math.min(1, s));
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zoom a viewBox around a point (in viewBox units) by `factor` (>1 zooms out), clamped to [minScale, maxScale] of the base. */
export function zoomViewBox(vb: ViewBox, base: ViewBox, px: number, py: number, factor: number, minScale = 0.5, maxScale = 12): ViewBox {
  const scale = base.w / vb.w;
  const next = Math.min(maxScale, Math.max(minScale, scale / factor));
  const f = scale / next;
  return { x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: vb.w * f, h: vb.h * f };
}

export function panViewBox(vb: ViewBox, dxUnits: number, dyUnits: number): ViewBox {
  return { x: vb.x - dxUnits, y: vb.y - dyUnits, w: vb.w, h: vb.h };
}

/** Zoom by a factor around the centre (toolbar buttons). */
export function zoomCenter(vb: ViewBox, base: ViewBox, factor: number): ViewBox {
  return zoomViewBox(vb, base, vb.x + vb.w / 2, vb.y + vb.h / 2, factor);
}
