/**
 * 1 этаж — чертёж packages/map-data/plans/floor-1.svg (svg2plan.py, повёрнут на 90°:
 * главный вход сверху, дуга снизу). На чертеже нет подписей — они расставлены по фото
 * стенда в конфигурации svg2plan.py (anchors). Здесь только идентичность помещений:
 * точка внутри грани → id/номер/название/тип.
 */
import { buildFromTraced, loadTraced, type Identity } from './tracedPlan';

const identity: Identity[] = [
  { at: [1053, 815], id: 'f1-100', number: '100', name: 'Учебный класс на 25 уч.', type: 'class' },
  { at: [1282, 690], id: 'f1-101', number: '101', name: 'Учебный класс на 20 уч.', type: 'class' },
  { at: [1475, 356], id: 'f1-102', number: '102', name: 'Учебный класс на 20 уч.', type: 'class' },
  { at: [1371, 550], id: 'f1-102a', number: '102', name: 'Лаборантская', type: 'office' },
  { at: [1341, 210], id: 'f1-103', number: '103', name: 'Кабинет информатики', type: 'class' },
  { at: [981, 459], id: 'f1-wc-1', number: 'WC', name: 'С/У женский', type: 'wc' },
  { at: [1122, 482], id: 'f1-wc-2', number: 'WC', name: 'С/У мужской', type: 'wc' },
  { at: [971, 607], id: 'f1-cr', number: 'CR', name: 'Гардероб', type: 'hall' },
  { at: [1081, 624], id: 'f1-cinema', number: 'Cinema', name: 'Кинозал', type: 'hall' },
  { at: [813, 472], id: 'f1-cafe', number: 'Cafe', name: 'Буфет', type: 'cafe' },
  { at: [178, 313], id: 'f1-zone', name: 'Закрытая зона', type: 'hall', hideLabel: true },
  { at: [828, 114], id: 'f1-entrance', name: 'Тамбур (главный вход)', type: 'lobby', hideLabel: true },
  { at: [786, 862], id: 'f1-entrance-s', name: 'Тамбур (южный вход)', type: 'corridor', hideLabel: true },
  { at: [816, 286], id: 'f1-hall', name: 'Холл', type: 'corridor', hideLabel: true },
  { at: [380, 571], id: 'f1-corr-w', name: 'Коридор', type: 'corridor', hideLabel: true },
];

export function buildFloor1() {
  return buildFromTraced(loadTraced('floor-1'), { name: '1 этаж', level: 1, prefix: 'f1', identity });
}
