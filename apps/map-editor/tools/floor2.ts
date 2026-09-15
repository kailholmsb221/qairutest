/**
 * 2 этаж — оцифровка по фото 2 (перевёрнутый лист; ориентация приведена к
 * примеру 3). Внешний контур, лестнично-лифтовые узлы и санузлы совпадают с
 * 1 этажом; планировка кабинетов — по фото 2, номера — по примеру 3 (200–226,
 * AI LAB, WC). Названия с чертежа — в planName там, где их удалось прочитать.
 */
import { createFloor } from './dsl';
import { finalizePlan } from './finalizePlan';
import type { DoorSwing } from '../src/types/plan';

export function buildFloor2() {
  const f = createFloor('floor-2', '2 этаж', 2);
  const { b, P, C, L, R, B, rect, chordRect, poly, span } = f;

  // ---------------- Левая колонна (внутренняя стена x=260, угловая — x=300) --------
  poly({ id: 'f2-214', number: '214', name: 'Кабинет ректора', planName: 'Кабинет ректора 21.58', type: 'office', area: 21.58 },
    [C(300), [300, 190], L(190), ...span(L(190), C(300))]);
  poly({ id: 'f2-213', number: '213', name: 'Кабинет проректора', planName: 'Кабинет проректора 25.66', type: 'office', area: 25.66 },
    [[260, 190], [260, 260], L(260), ...span(L(260), L(190))]);
  poly({ id: 'f2-212', number: '212', name: 'Кабинет', type: 'office' },
    [[260, 260], [260, 330], L(330), ...span(L(330), L(260))]);
  poly({ id: 'f2-211', number: '211', name: 'Кабинет', type: 'office' },
    [[170, 330], [170, 430], L(430), ...span(L(430), L(330))]);
  rect({ id: 'f2-209', number: '209', name: 'Кабинет', type: 'office' }, 170, 330, 260, 375);
  rect({ id: 'f2-210', number: '210', name: 'Кабинет', type: 'office' }, 170, 375, 260, 430);
  poly({ id: 'f2-208', number: '208', name: 'Кабинет', type: 'office' },
    [[170, 430], [170, 520], L(520), ...span(L(520), L(430))]);
  rect({ id: 'f2-206', number: '206', name: 'Кабинет режиссёра', planName: 'Кабинет режиссера 24.57', type: 'office', area: 24.57 }, 170, 430, 260, 520);
  poly({ id: 'f2-207', number: '207', name: 'Кабинет продюсера', planName: 'Кабинет продюсера 36.99', type: 'office', area: 36.99, status: 'busy' },
    [[260, 520], [260, 600], L(600), ...span(L(600), L(520))]);
  poly({ id: 'f2-203', number: '203', name: 'Кабинет', type: 'office' },
    [[260, 600], [260, 690], L(690), ...span(L(690), L(600))]);
  poly({ id: 'f2-202', number: '202', name: 'Аудитория', type: 'class' },
    [[260, 690], [260, 730], B(260), ...span(B(260), L(690))]);
  poly({ id: 'f2-201', number: '201', name: 'Аудитория', type: 'class' },
    [[260, 730], [460, 730], B(460), ...span(B(460), B(260))]);
  poly({ id: 'f2-200', number: '200', name: 'Преподавательская', planName: 'Преподавательская 73.45', type: 'class', area: 73.45, status: 'busy' },
    [[460, 730], [660, 730], B(660), ...span(B(660), B(460))]);

  // ---------------- Левый узел (x 300–700, y 50–420) --------------------------------
  chordRect({ id: 'room-unknown-f2-01', name: 'Кабинет', type: 'office' }, 300, 395, 245);
  poly({ id: 'f2-215', number: '215', name: 'Управление экономики и финансов', planName: 'Управление экономики и финансов 38.71', type: 'office', area: 38.71 },
    [...span(C(395), C(610)), [610, 190], [515, 190], [515, 165], [395, 165]]);
  chordRect({ id: 'f2-archive', name: 'Архив', planName: 'Архив 38.82', type: 'storage', area: 38.82 }, 610, 700, 190);
  rect({ id: 'f2-sf1', name: 'Зона безопасности SF-1', planName: 'SF-1', type: 'tech', hideLabel: true }, 395, 165, 515, 245);
  rect({ id: 'f2-stairs-1', name: 'Лестничная клетка', planName: 'Лестничная клетка 20.05', type: 'stairs', area: 20.05 }, 515, 190, 610, 330);
  poly({ id: 'f2-corr-core-l', name: 'Коридор', planName: 'Коридор 14.44', type: 'corridor', area: 14.44, hideLabel: true },
    [[610, 190], [700, 190], [700, 420], [630, 420], [630, 330], [610, 330]]);
  rect({ id: 'f2-pui-l', name: 'ПУИ', planName: 'ПУИ 5.83', type: 'tech', area: 5.83, hideLabel: true }, 300, 245, 395, 290);
  rect({ id: 'f2-chute-l', name: 'Мусоропровод', planName: 'Мусоропровод 4.47', type: 'tech', area: 4.47, hideLabel: true }, 300, 290, 395, 330);
  rect({ id: 'f2-lifthall-l', name: 'Лифтовой холл', planName: 'Лифтовой холл 12.14', type: 'lobby', area: 12.14 }, 395, 245, 515, 330);
  rect({ id: 'f2-lift-1', name: 'Лифт', type: 'lift', hideLabel: true }, 300, 330, 380, 420);
  rect({ id: 'f2-lift-2', name: 'Лифт', type: 'lift', hideLabel: true }, 380, 330, 460, 420);
  rect({ id: 'f2-elec-l', name: 'Эл. щитовая', planName: 'Эл.щит 8.13', type: 'tech', area: 8.13, hideLabel: true }, 460, 330, 540, 420);
  rect({ id: 'f2-wc-staff-l', name: 'С/У служебный', planName: 'С/У 5.47', type: 'wc', area: 5.47, hideLabel: true }, 540, 330, 630, 420);

  // ---------------- Западный коридор + ряд + санузлы слева --------------------------
  poly({ id: 'f2-corr-l', name: 'Коридор', planName: 'Коридор 26.05', type: 'corridor', label: { x: 280, y: 460, angle: -90 } },
    [[260, 190], [300, 190], [300, 420], [370, 420], [370, 580], [700, 580], [700, 615], [370, 615], [370, 730], [260, 730]]);
  rect({ id: 'f2-204', number: '204', name: 'Кабинет', type: 'office' }, 370, 420, 450, 500);
  rect({ id: 'f2-205', number: '205', name: 'Кабинет', type: 'office', status: 'ending' }, 370, 500, 450, 580);
  rect({ id: 'f2-226u', number: '226', name: 'Преподавательская', planName: 'Преподавательская 55.47', type: 'class', area: 55.47, status: 'busy' }, 450, 420, 700, 580);
  rect({ id: 'f2-wc-staff2', name: 'С/У персонала', planName: 'С/У Перс 3.28', type: 'wc', hideLabel: true }, 370, 615, 430, 670);
  rect({ id: 'f2-wc-mgn-l', name: 'С/У МГН', planName: 'С/У МГН 3.26', type: 'wc', area: 3.26, hideLabel: true }, 370, 670, 430, 730);
  rect({ id: 'f2-wc-w-l', name: 'С/У женский', planName: 'С/У Жен 18.66', type: 'wc', area: 18.66 }, 430, 615, 560, 730);
  rect({ id: 'f2-locker-l', name: 'Раздевалка', type: 'wc', hideLabel: true }, 560, 615, 610, 670);
  rect({ id: 'f2-shower-l', name: 'Душевая', type: 'wc', hideLabel: true }, 560, 670, 610, 730);
  rect({ id: 'f2-wc-m-l', name: 'С/У мужской', planName: 'С/У Муж 19.17', type: 'wc', area: 19.17 }, 610, 615, 700, 730);

  // ---------------- Центральный холл с атриумным проёмом ---------------------------
  chordRect({ id: 'f2-ailab', number: 'AI LAB', name: 'AI LAB', planName: 'Проектируемое помещение (штриховка)', type: 'class', status: 'ending' }, 700, 900, 190);
  rect({ id: 'f2-hall-n', name: 'Коридор', planName: 'Коридор 298.62', type: 'corridor', label: { x: 800, y: 290 } }, 700, 190, 900, 380);
  poly({ id: 'f2-hall-mid', name: 'Коридор', planName: 'Коридор 298.62', type: 'corridor', hideLabel: true },
    [[700, 380], [900, 380], [900, 620], [855, 620], [855, 395], [745, 395], [745, 620], [700, 620]]);
  rect({ id: 'f2-void', name: 'Атриумный проём', planName: 'Проём в перекрытии', type: 'tech', hideLabel: true }, 745, 395, 855, 620);
  rect({ id: 'f2-hall-s', name: 'Коридор', planName: 'Коридор 298.62', type: 'corridor', label: { x: 800, y: 675 } }, 700, 620, 900, 730);
  poly({ id: 'f2-226', number: '226', name: 'Библиотека', planName: 'Библиотека 103.44', type: 'hall', area: 103.44, status: 'busy' },
    [[660, 730], [960, 730], B(960), ...span(B(960), B(660))]);
  poly({ id: 'f2-225', number: '225', name: 'Преподавательская', planName: 'Преподавательская 23.37', type: 'office', area: 23.37, label: { x: 985, y: 800, angle: -90 } },
    [[960, 730], [1010, 730], B(1010), ...span(B(1010), B(960))]);
  poly({ id: 'f2-224', number: '224', name: 'Лаборатория', planName: 'Лаборатория 70.23', type: 'class', area: 70.23, status: 'ending' },
    [[1010, 730], [1240, 730], B(1240), ...span(B(1240), B(1010))]);

  // ---------------- Правый узел (x 900–1240, y 50–420) ------------------------------
  chordRect({ id: 'f2-hr', name: 'Управление кадровой службы', planName: 'Управление кадровой службы 34.17', type: 'office', area: 34.17, label: { x: 945, y: 120, fontSize: 9 } }, 900, 990, 190);
  rect({ id: 'f2-lifthall-r', name: 'Лифтовой холл', planName: 'Лифтовой холл 10.71', type: 'lobby', area: 10.71, label: { x: 945, y: 305, angle: -90 } }, 900, 190, 990, 420);
  poly({ id: 'f2-217', number: '217', name: 'Кабинет', type: 'office' },
    [...span(C(990), C(1170)), [1170, 190], [1080, 190], [1080, 125], [990, 125]]);
  rect({ id: 'f2-stairs-2', name: 'Лестничная клетка', planName: 'Лестничная клетка 20.06', type: 'stairs', area: 20.06 }, 990, 125, 1080, 260);
  rect({ id: 'f2-lift-3', name: 'Лифт', type: 'lift', hideLabel: true }, 990, 260, 1080, 340);
  rect({ id: 'f2-lift-4', name: 'Лифт', type: 'lift', hideLabel: true }, 990, 340, 1080, 420);
  rect({ id: 'f2-sf2', name: 'Зона безопасности SF-2', planName: 'SF-2', type: 'tech', hideLabel: true }, 1080, 190, 1170, 260);
  rect({ id: 'f2-lifthall-r2', name: 'Лифтовой холл', planName: 'Лифтовой холл 8.03', type: 'lobby', area: 8.03, hideLabel: true }, 1080, 260, 1170, 340);
  rect({ id: 'f2-telecom', name: 'Телекоммуникационная', type: 'tech', hideLabel: true }, 1080, 340, 1170, 420);
  chordRect({ id: 'f2-218', number: '218', name: 'Кафедра спорта высших достижений', planName: 'Кафедра спорта высших достижений 38.97', type: 'office', area: 38.97 }, 1170, 1360, 140);
  rect({ id: 'f2-wc-r-small', name: 'С/У', type: 'wc', hideLabel: true }, 1170, 140, 1205, 200);
  rect({ id: 'f2-pui-r2', name: 'ПУИ', planName: 'ПУИ 5.25', type: 'tech', area: 5.25, hideLabel: true }, 1205, 140, 1240, 200);
  rect({ id: 'f2-lift-p1', name: 'Лифт Р-1', planName: 'Р-1', type: 'lift', hideLabel: true }, 1170, 200, 1205, 260);
  rect({ id: 'f2-chute-r', name: 'Мусоропровод', planName: 'Мусоропровод 4.87', type: 'tech', area: 4.87, hideLabel: true }, 1205, 200, 1240, 260);
  rect({ id: 'f2-elec-r', name: 'Эл. щитовая', planName: 'Эл.щит 9.18', type: 'tech', area: 9.18, hideLabel: true }, 1170, 260, 1240, 340);
  rect({ id: 'f2-pui-r1', name: 'ПУИ', planName: 'ПУИ 5.69', type: 'tech', area: 5.69, hideLabel: true }, 1170, 340, 1240, 420);

  // ---------------- Санузлы справа (WC / WC) ---------------------------------------
  rect({ id: 'f2-wc-w-r', number: 'WC', name: 'С/У женский', planName: 'С/У Жен 19.84', type: 'wc', area: 19.84 }, 900, 420, 1010, 500);
  rect({ id: 'f2-wc-corr', name: 'Коридор', type: 'corridor', hideLabel: true }, 900, 500, 1010, 540);
  rect({ id: 'f2-shower-r', name: 'Душевая', type: 'wc', hideLabel: true }, 1010, 420, 1060, 480);
  rect({ id: 'f2-locker-r', name: 'Раздевалка', type: 'wc', hideLabel: true }, 1010, 480, 1060, 540);
  rect({ id: 'f2-wc-m-r', number: 'WC', name: 'С/У мужской', planName: 'С/У Муж 19.51', type: 'wc', area: 19.51 }, 1060, 420, 1180, 540);
  rect({ id: 'f2-wc-mgn-r', name: 'С/У МГН', planName: 'С/У МГН 3.27', type: 'wc', area: 3.27, hideLabel: true }, 1180, 420, 1240, 480);
  rect({ id: 'f2-wc-staff-r', name: 'С/У персонала', planName: 'С/У Перс 5.93', type: 'wc', area: 5.93, hideLabel: true }, 1180, 480, 1240, 540);

  // ---------------- Правая половина -------------------------------------------------
  poly({ id: 'f2-corr-r', name: 'Коридор', planName: 'Коридор 149.03', type: 'corridor', area: 149.03, label: { x: 1030, y: 570 } },
    [[900, 540], [1240, 540], [1240, 140], [1360, 140], [1360, 180], [1280, 180], [1280, 600], [1240, 600], [1240, 730], [1160, 730], [1160, 600], [900, 600]]);
  rect({ id: 'f2-223', number: '223', name: 'Коворкинг', planName: 'Коворкинг 66.67', type: 'office', area: 66.67 }, 900, 600, 1160, 730);
  poly({ id: 'f2-219', number: '219', name: 'Кабинет', type: 'office', status: 'ending' },
    [C(1360), ...span(C(1360), R(250)), [1280, 250], [1280, 180], [1360, 180]]);
  poly({ id: 'f2-220', number: '220', name: 'Кабинет мастера спорта', planName: 'Кабинет мастера спорта 20.18', type: 'office', area: 20.18 },
    [[1280, 250], R(250), ...span(R(250), R(420)), [1280, 420]]);
  poly({ id: 'f2-221', number: '221', name: 'Учебный класс на 15 уч.', planName: 'Учебный класс на 15 уч 51.17', type: 'class', area: 51.17 },
    [[1280, 420], R(420), ...span(R(420), R(600)), [1280, 600]]);
  poly({ id: 'f2-222', number: '222', name: 'Учебный класс на 15 уч.', planName: 'Учебный класс на 15 уч 58.99', type: 'class', area: 58.99, status: 'ending' },
    [[1240, 600], [1280, 600], R(600), ...span(R(600), B(1240))]);

  f.exterior();
  const report = finalizePlan(b);

  // ---------------- Двери ----------------------------------------------------------
  const D = (a: string, c: string, pos = 0.5, width = 26, swing: DoorSwing = 'left-in') => b.door(a, c, pos, width, swing);
  const Q = (x0: number, y0: number, x1: number, y1: number, pos = 0.5, width = 26, swing: DoorSwing = 'left-in') =>
    D(P(x0, y0), P(x1, y1), pos, width, swing);
  // Левая колонна → западный коридор
  Q(260, 190, 300, 190, 0.5, 26, 'right-out');
  Q(260, 190, 260, 260, 0.5, 24, 'right-in');
  Q(260, 260, 260, 330, 0.5, 24, 'right-in');
  Q(260, 330, 260, 375, 0.5, 22, 'right-in');
  Q(260, 375, 260, 430, 0.5, 22, 'right-in');
  Q(170, 330, 170, 375, 0.5, 22);
  Q(170, 430, 170, 520, 0.5, 22);
  Q(260, 430, 260, 520, 0.5, 24, 'right-in');
  Q(260, 520, 260, 600, 0.5, 24, 'right-in');
  Q(260, 600, 260, 690, 0.5, 24, 'right-in');
  Q(260, 690, 260, 730, 0.5, 24, 'right-in');
  Q(260, 730, 370, 730, 0.5, 30, 'double');
  D(P(460, 730), B(460), 0.35, 30, 'double');
  D(P(660, 730), B(660), 0.35, 30, 'double');
  // Узел слева
  Q(300, 190, 300, 245, 0.5, 24);
  Q(300, 245, 300, 290, 0.5, 18);
  Q(300, 290, 300, 330, 0.5, 18);
  Q(300, 420, 370, 420, 0.5, 30, 'double');
  Q(395, 165, 515, 165, 0.5, 26);
  Q(395, 245, 515, 245, 0.5, 26);
  Q(515, 165, 515, 190, 0.5, 20);
  Q(515, 190, 515, 245, 0.5, 26);
  Q(610, 190, 700, 190, 0.5, 26, 'right-out');
  Q(610, 190, 610, 330, 0.5, 30, 'double');
  Q(700, 190, 700, 380, 0.5, 34, 'double');
  Q(630, 330, 630, 420, 0.5, 24);
  Q(460, 330, 515, 330, 0.5, 22);
  Q(395, 330, 460, 330, 0.5, 30, 'double');
  // Ряд, санузлы, внутренний коридор
  Q(370, 420, 370, 500, 0.5, 22);
  Q(370, 500, 370, 580, 0.5, 22);
  Q(450, 580, 700, 580, 0.3, 30, 'right-out');
  Q(370, 615, 370, 670, 0.5, 20);
  Q(370, 670, 370, 730, 0.5, 20);
  Q(430, 615, 560, 615, 0.5, 24);
  Q(560, 615, 610, 615, 0.5, 20);
  Q(610, 615, 700, 615, 0.5, 24);
  Q(560, 670, 610, 670, 0.5, 18);
  Q(700, 580, 700, 615, 0.5, 32, 'double');
  Q(700, 190, 900, 190, 0.5, 40, 'double');
  Q(700, 620, 700, 730, 0.5, 34, 'double');
  Q(700, 730, 900, 730, 0.5, 44, 'double');
  Q(900, 620, 900, 730, 0.5, 34, 'double');
  Q(960, 730, 1010, 730, 0.5, 22, 'right-out');
  Q(1160, 730, 1240, 730, 0.5, 30, 'double');
  // Узел справа
  Q(900, 50, 900, 190, 0.5, 24, 'left-in');
  Q(900, 190, 900, 380, 0.5, 34, 'double');
  Q(990, 125, 1080, 125, 0.5, 30, 'double');
  Q(990, 190, 990, 260, 0.5, 30, 'double');
  Q(990, 260, 990, 340, 0.5, 30, 'double');
  Q(990, 340, 990, 420, 0.5, 30, 'double');
  Q(1080, 190, 1080, 260, 0.5, 26);
  Q(1080, 260, 1170, 260, 0.5, 26);
  Q(1080, 260, 1080, 340, 0.5, 30, 'double');
  Q(1080, 340, 1170, 340, 0.5, 22);
  Q(1170, 200, 1170, 260, 0.5, 24);
  Q(1170, 140, 1205, 140, 0.5, 18);
  Q(1240, 140, 1360, 140, 0.3, 26);
  Q(1240, 140, 1240, 200, 0.5, 18);
  Q(1240, 200, 1240, 260, 0.5, 18);
  Q(1240, 260, 1240, 340, 0.5, 22);
  Q(1240, 340, 1240, 420, 0.5, 22);
  Q(1170, 260, 1170, 340, 0.5, 22);
  Q(1280, 180, 1280, 250, 0.5, 26, 'right-in');
  Q(1280, 250, 1280, 420, 0.5, 26, 'right-in');
  Q(1280, 420, 1280, 600, 0.5, 26, 'right-in');
  Q(1240, 600, 1240, 730, 0.5, 30, 'double');
  // Санузлы справа, коворкинг
  Q(900, 500, 1010, 500, 0.5, 24);
  Q(900, 500, 900, 540, 0.5, 22, 'right-in');
  Q(1010, 500, 1010, 540, 0.5, 20);
  Q(1010, 480, 1060, 480, 0.5, 18);
  Q(1060, 540, 1180, 540, 0.5, 24);
  Q(1240, 420, 1240, 480, 0.5, 20);
  Q(1240, 480, 1240, 540, 0.5, 20);
  Q(900, 600, 1160, 600, 0.5, 30, 'double');
  Q(900, 540, 900, 600, 0.5, 44, 'double');

  // ---------------- Спецзоны --------------------------------------------------------
  b.zone('stairs', 'f2-stairs-1', 90);
  b.zone('stairs', 'f2-stairs-2', 90);
  for (const id of ['f2-lift-1', 'f2-lift-2', 'f2-lift-3', 'f2-lift-4', 'f2-lift-p1']) b.zone('lift', id);
  for (const r of b.rooms) if (r.type === 'wc') b.zone('wc', r.id);
  for (const r of b.rooms) if (r.type === 'tech' && r.id !== 'f2-void') b.zone('tech', r.id);
  b.zone('shaft', 'f2-void');

  return { plan: b.build(), report };
}
