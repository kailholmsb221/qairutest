/**
 * 2 этаж — чертёж packages/map-data/plans/floor-2.svg (svg2plan.py, как нарисован: дуга внизу,
 * как и у 1 этажа, чтобы этажи в 2.5D-стопке смотрели в одну сторону). Подписи — из чертежа. Здесь только
 * идентичность помещений: точка внутри грани → id/номер/название/тип.
 */
import { buildFromTraced, loadTraced, type Identity } from './tracedPlan';

const office = (at: [number, number], n: string, name = 'Кабинет'): Identity => ({ at, id: `f2-${n}`, number: n, name, type: 'office' });
const cls = (at: [number, number], n: string, name = 'Аудитория', id = `f2-${n}`): Identity => ({ at, id, number: n, name, type: 'class' });

// точки `at` — позиции подписей на чертеже (в координатах viewBox 1600×1000), они гарантированно внутри своих граней
const identity: Identity[] = [
  office([568, 786], '200', 'Преподавательская'),
  cls([321, 791], '201'),
  cls([188, 671], '202'),
  office([176, 589], '203'),
  cls([524, 531], '204'),
  cls([502, 336], '204', 'Аудитория', 'f2-204a'),
  office([175, 491], '206', 'Кабинет режиссёра'),
  office([170, 387], '209'),
  office([170, 223], '213', 'Кабинет проректора'),
  office([354, 136], '214', 'Кабинет ректора'),
  office([524, 108], '215', 'Управление экономики и финансов'),
  office([936, 96], '217'),
  office([1152, 113], '218', 'Кафедра спорта высших достижений'),
  office([1448, 187], '219'),
  office([1447, 302], '220', 'Кабинет мастера спорта'),
  cls([1415, 429], '221', 'Учебный класс на 15 уч.'),
  cls([1405, 593], '222', 'Учебный класс на 15 уч.'),
  { at: [1001, 527], id: 'f2-223', number: '223', name: 'Коворкинг', type: 'hall' },
  cls([1149, 837], '224', 'Лаборатория'),
  office([962, 798], '225', 'Преподавательская'),
  { at: [790, 788], id: 'f2-226', number: '226', name: 'Библиотека', type: 'hall' },
  cls([1019, 327], '227'),
  { at: [795, 89], id: 'f2-ailab', number: 'AI lab', name: 'AI LAB', type: 'class' },
  { at: [787, 439], id: 'f2-void', name: 'Атриумный проём', type: 'tech', hideLabel: true },
  { at: [851, 240], id: 'f2-corr', name: 'Коридор', type: 'corridor', hideLabel: true },
];

export function buildFloor2() {
  return buildFromTraced(loadTraced('floor-2'), { name: '2 этаж', level: 2, prefix: 'f2', identity });
}
