import { PlanBuilder, type RoomSpec } from './planBuilder';
import { buildOutline, outlineHelpers, CANVAS, type OutlineInfo } from './shared';

/** Обёртка над PlanBuilder: точки по координатам, прямоугольники, хорда/фасад/дуга. */
export function createFloor(id: string, name: string, level: number) {
  const b = new PlanBuilder(id, name, level, CANVAS);
  const info: OutlineInfo = buildOutline();
  b.useOutline(info.outline);
  const oh = outlineHelpers(b, info);

  const key = (n: number) => String(Math.round(n * 100) / 100).replace('-', 'm').replace('.', 'd');
  /** Точка по координатам; одинаковые координаты → одна и та же точка. */
  const P = (x: number, y: number) => b.findByCoords(x, y) ?? b.pt(`p${key(x)}_${key(y)}`, x, y);
  const C = (x: number) => oh.chordAt(`oc${key(x)}`, x);
  const L = (y: number) => oh.leftAt(`ol_${key(y)}`, y);
  const R = (y: number) => oh.rightAt(`or_${key(y)}`, y);
  const B = (x: number) => oh.bottomAt(`ob${key(x)}`, x);

  /** Прямоугольное помещение по двум углам. */
  const rect = (spec: RoomSpec, x0: number, y0: number, x1: number, y1: number) =>
    b.room(spec, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]);

  /** Прямоугольник, верхняя сторона которого — хорда фасада. */
  const chordRect = (spec: RoomSpec, x0: number, x1: number, y1: number) =>
    b.room(spec, [...b.span(C(x0), C(x1)), P(x1, y1), P(x0, y1)]);

  /** Помещение по списку точек (координаты либо id). */
  const poly = (spec: RoomSpec, pts: (string | [number, number] | string[])[]) =>
    b.room(
      spec,
      pts.map((p) => (Array.isArray(p) && typeof p[0] === 'number' ? P(p[0] as number, p[1] as number) : (p as string | string[]))),
    );

  const exterior = () => {
    const e0 = b.op('e0', 0);
    b.exterior(b.span(e0, e0));
  };

  return { b, info, P, C, L, R, B, rect, chordRect, poly, exterior, span: b.span.bind(b) };
}

export type FloorCtx = ReturnType<typeof createFloor>;
