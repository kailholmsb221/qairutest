/**
 * 2 этаж — чертёж packages/map-data/plans/floor-2.svg (svg2plan.py, как нарисован: дуга внизу,
 * как и у 1 этажа, чтобы этажи в 2.5D-стопке смотрели в одну сторону). Подписи — из чертежа. Здесь только
 * идентичность помещений: точка внутри грани → id/номер/название/тип. Названия (ru/kk/en) и коды
 * для API задаются в packages/map-data/room-codes.json; здесь — русское название по программе здания.
 */
import { buildFromTraced, loadTraced, type Identity } from './tracedPlan';

const office = (at: [number, number], n: string, name = 'Кабинет'): Identity => ({ at, id: `f2-${n}`, number: n, name, type: 'office' });
const cls = (at: [number, number], n: string, name = 'Аудитория'): Identity => ({ at, id: `f2-${n}`, number: n, name, type: 'class' });
const hall = (at: [number, number], n: string, name: string): Identity => ({ at, id: `f2-${n}`, number: n, name, type: 'hall' });

// точки `at` — позиции подписей на чертеже (в координатах viewBox 1600×1000), они гарантированно внутри своих граней
const identity: Identity[] = [
  hall([607, 781], '200', 'Лекционная аудитория'),
  hall([412, 793], '201', 'Конференц-зал'),
  office([242, 676], '202', 'Деканат'),
  office([233, 580], '203', 'Департамент академической деятельности'),
  cls([542, 530], '204', 'Учебная лаборатория'),
  office([190, 484], '206', 'Приёмная ректора'),
  office([170, 386], '209', 'Приёмная проректоров'),
  office([170, 222], '213', 'Советник ректора'),
  office([353, 136], '214', 'Департамент бухгалтерского учёта'),
  office([523, 107], '215'),
  office([936, 95], '217', 'Департамент маркетинга и связей с общественностью'),
  office([1152, 112], '218', 'Школа образовательных программ'),
  hall([1462, 182], '219', 'Лекционная аудитория'),
  office([1447, 301], '220', 'Служебное помещение'),
  office([1414, 429], '221', 'Офис регистратора'),
  cls([1405, 593], '222', 'Компьютерный класс'),
  cls([1015, 522], '223', 'Учебная лаборатория'),
  hall([1148, 837], '224', 'Лекционная аудитория'),
  office([961, 797], '225', 'Служебное помещение'),
  cls([790, 787], '226', 'Учебная лаборатория'),
  cls([1015, 307], '227'),
  { at: [795, 88], id: 'f2-ailab', number: 'AI lab', name: 'Лаборатория искусственного интеллекта', type: 'class' },
  { at: [490, 330], id: 'f2-wc', number: 'WC', name: 'Санузел', type: 'wc' },
  { at: [787, 439], id: 'f2-void', name: 'Атриумный проём', type: 'tech', hideLabel: true },
  { at: [851, 240], id: 'f2-corr', name: 'Коридор', type: 'corridor', hideLabel: true },
];

export function buildFloor2() {
  return buildFromTraced(loadTraced('floor-2'), { name: '2 этаж', level: 2, prefix: 'f2', identity });
}
