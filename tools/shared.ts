/**
 * Общая геометрия здания для всех этажей: внешний контур (хорда сверху,
 * наклонные боковые фасады, плавные угловые дуги и большая нижняя дуга),
 * плюс вспомогательные функции для точек на контуре.
 */
import { Outline, PlanBuilder } from './planBuilder';
import type { Point } from '../src/types/plan';

export const CANVAS = { x: 0, y: 0, width: 1600, height: 1000 };

const CX = 800;
const CHORD_Y = 50;
const CHORD_X0 = 170;
const CHORD_X1 = 1430;
const CORNER_R = 120;
const SLANT_DEG = 6;
const BOTTOM_Y = 960;
const BOTTOM_R = 1100;
const BL_R = 260;

const deg = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;

export interface OutlineInfo {
  outline: Outline;
  /** станции начала кусков */
  s: { chord: number; tr: number; right: number; br: number; bottom: number; bl: number; left: number; tl: number };
  /** x бокового фасада на высоте y (для прямых участков) */
  leftX: (y: number) => number;
  rightX: (y: number) => number;
  sideTop: number;
  sideBottom: number;
}

export function buildOutline(): OutlineInfo {
  const beta = deg(SLANT_DEG);
  // Верхние углы
  const trC: Point = { x: CHORD_X1, y: CHORD_Y + CORNER_R };
  const tlC: Point = { x: CHORD_X0, y: CHORD_Y + CORNER_R };
  // Конец правой угловой дуги — касательная совпадает с наклонным фасадом
  const rightTop: Point = { x: trC.x + CORNER_R * Math.cos(beta), y: trC.y + CORNER_R * Math.sin(beta) };
  const leftTop: Point = { x: tlC.x - CORNER_R * Math.cos(beta), y: tlC.y + CORNER_R * Math.sin(beta) };
  // Направление правого фасада вниз (внутрь здания)
  const dR: Point = { x: -Math.sin(beta), y: Math.cos(beta) };
  // Внутренняя нормаль правого фасада
  const nR: Point = { x: -Math.cos(beta), y: -Math.sin(beta) };
  // Нижняя окружность
  const bC: Point = { x: CX, y: BOTTOM_Y - BOTTOM_R };
  // Центр правой нижней угловой окружности: rightTop + t*dR + BL_R*nR, |C - bC| = BOTTOM_R - BL_R
  const target = BOTTOM_R - BL_R;
  const ox = rightTop.x + BL_R * nR.x - bC.x;
  const oy = rightTop.y + BL_R * nR.y - bC.y;
  // |o + t d|^2 = target^2  → t^2 + 2 t (o·d) + |o|^2 - target^2 = 0
  const bq = 2 * (ox * dR.x + oy * dR.y);
  const cq = ox * ox + oy * oy - target * target;
  const disc = bq * bq - 4 * cq;
  if (disc < 0) throw new Error('Нет касательного решения для угловой дуги');
  const t = (-bq + Math.sqrt(disc)) / 2;
  const brC: Point = { x: rightTop.x + t * dR.x + BL_R * nR.x, y: rightTop.y + t * dR.y + BL_R * nR.y };
  const rightBottom: Point = { x: rightTop.x + t * dR.x, y: rightTop.y + t * dR.y };
  // Углы дуг
  const brStart = rad2deg(Math.atan2(rightBottom.y - brC.y, rightBottom.x - brC.x)); // = -beta... (внешняя нормаль)
  const dirBC = { x: brC.x - bC.x, y: brC.y - bC.y };
  const psi = rad2deg(Math.atan2(dirBC.y, dirBC.x));
  // Симметрия для левой стороны
  const blC: Point = { x: 2 * CX - brC.x, y: brC.y };
  const leftBottom: Point = { x: 2 * CX - rightBottom.x, y: rightBottom.y };

  const o = new Outline();
  const s = { chord: 0, tr: 0, right: 0, br: 0, bottom: 0, bl: 0, left: 0, tl: 0 };
  o.line({ x: CHORD_X0, y: CHORD_Y }, { x: CHORD_X1, y: CHORD_Y });
  s.tr = o.total;
  o.arc(trC, CORNER_R, -90, SLANT_DEG);
  s.right = o.total;
  o.line(rightTop, rightBottom);
  s.br = o.total;
  o.arc(brC, BL_R, brStart, psi);
  s.bottom = o.total;
  o.arc(bC, BOTTOM_R, psi, 180 - psi);
  s.bl = o.total;
  o.arc(blC, BL_R, 180 - psi, 180 - brStart);
  s.left = o.total;
  o.line(leftBottom, leftTop);
  s.tl = o.total;
  o.arc(tlC, CORNER_R, 180 - SLANT_DEG, 270);

  const tanB = Math.tan(beta);
  return {
    outline: o,
    s,
    leftX: (y) => leftTop.x + (y - leftTop.y) * tanB,
    rightX: (y) => rightTop.x - (y - rightTop.y) * tanB,
    sideTop: leftTop.y,
    sideBottom: leftBottom.y,
  };
}

/** Найти станцию, где контур пересекает x=value (или y=value) в диапазоне станций. */
export function crossStation(o: Outline, axis: 'x' | 'y', value: number, s0: number, s1: number): number {
  const n = 2000;
  let prev = o.pointAt(s0)[axis] - value;
  let prevS = s0;
  for (let i = 1; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const cur = o.pointAt(s)[axis] - value;
    if (prev === 0) return prevS;
    if ((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
      let a = prevS;
      let b = s;
      let fa = prev;
      for (let k = 0; k < 60; k++) {
        const m = (a + b) / 2;
        const fm = o.pointAt(m)[axis] - value;
        if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) {
          a = m;
          fa = fm;
        } else b = m;
      }
      return (a + b) / 2;
    }
    prev = cur;
    prevS = s;
  }
  throw new Error(`Контур не пересекает ${axis}=${value} в диапазоне [${s0}, ${s1}]`);
}

/** Точки контура: на нижней дуге по x, на боковых фасадах по y. */
export function outlineHelpers(b: PlanBuilder, info: OutlineInfo) {
  const { outline: o, s } = info;
  return {
    /** Точка нижнего контура (дуги/угловых дуг) на вертикали x */
    bottomAt: (id: string, x: number) => b.op(id, crossStation(o, 'x', x, s.br, s.left)),
    /** Точка левого фасада (включая угловые дуги) на горизонтали y */
    leftAt: (id: string, y: number) => b.op(id, crossStation(o, 'y', y, s.bl, o.total)),
    /** Точка правого фасада на горизонтали y */
    rightAt: (id: string, y: number) => b.op(id, crossStation(o, 'y', y, s.tr, s.bottom)),
    /** Точка хорды на x */
    chordAt: (id: string, x: number) => b.op(id, x - 170),
  };
}
