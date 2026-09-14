/**
 * 1 этаж — оцифровка по фото 1 (ориентация как на примере 4: хорда с
 * лестнично-лифтовыми узлами сверху, дугообразный фасад снизу).
 * Номера — по примеру 4 (100–103, Cafe, WC, CR, Cinema); названия — с чертежа.
 */
import { createFloor } from './dsl';
import { finalizePlan } from './finalizePlan';
import type { DoorSwing } from '../src/types/plan';

export function buildFloor1() {
  const f = createFloor('floor-1', '1 этаж', 1);
  const { b, P, C, L, R, B, rect, chordRect, poly, span } = f;

  // ---------------- Левая колонна (наклонный фасад, внутренняя стена x=300) --------
  poly({ id: 'f1-pavilion', name: 'Съёмочный павильон', planName: 'Съемочный павильон 102.92', type: 'hall', area: 102.92, status: 'busy' },
    [C(300), [300, 300], L(300), ...span(L(300), C(300))]);
  poly({ id: 'f1-welcome', name: 'Welcome-зона', planName: 'Welcome Zona 63.72', type: 'lobby', area: 63.72 },
    [[300, 300], [300, 480], [160, 480], [160, 430], L(430), ...span(L(430), L(300))]);
  poly({ id: 'f1-tambour-w', name: 'Тамбур', planName: 'Тамбур 15.65', type: 'lobby', area: 15.65, hideLabel: true },
    [[160, 430], [160, 480], L(480), ...span(L(480), L(430))]);
  poly({ id: 'f1-hall15a', name: 'Зал на 15 человек', planName: 'Зал на 15 человек 77.84', type: 'class', area: 77.84, status: 'busy' },
    [[300, 480], [300, 640], L(640), ...span(L(640), L(480))]);
  poly({ id: 'f1-hall15b', name: 'Зал на 15 человек', planName: 'Зал на 15 человек 63.43', type: 'class', area: 63.43 },
    [[300, 640], B(300), ...span(B(300), L(640))]);

  // ---------------- Низ слева: коворкинг и большой зал -----------------------------
  poly({ id: 'f1-cowork', name: 'Коворкинг', planName: 'Коворкинг, Кафе Lounge, Библиотека 63.88', type: 'office', area: 63.88, status: 'soon', label: { x: 400, y: 800 } },
    [[300, 730], [460, 730], B(460), ...span(B(460), B(300))]);
  poly({ id: 'f1-hall150', name: 'Зал на 150 человек', planName: 'Зал на 150 человек 126.27', type: 'hall', area: 126.27 },
    [[460, 730], [700, 730], B(700), ...span(B(700), B(460))]);

  // ---------------- Левый лестнично-лифтовой узел (x 300–700, y 50–420) ------------
  chordRect({ id: 'f1-room-11', name: 'Помещение', planName: 'Помещение 11.19', type: 'service', area: 11.19 }, 300, 395, 150);
  rect({ id: 'f1-room-10', name: 'Помещение', planName: 'Помещение 10.18', type: 'service', area: 10.18 }, 300, 150, 395, 245);
  chordRect({ id: 'f1-workshop', name: 'Мастерская', planName: 'Мастерская 15.56', type: 'office', area: 15.56 }, 395, 515, 165);
  rect({ id: 'f1-sf1', name: 'Зона безопасности SF-1', planName: 'SF-1', type: 'tech', hideLabel: true }, 395, 165, 515, 245);
  chordRect({ id: 'f1-tambour-n1', name: 'Тамбур', planName: 'Тамбур 14.66', type: 'lobby', area: 14.66, hideLabel: true }, 515, 610, 125);
  rect({ id: 'f1-tambour-n2', name: 'Тамбур', planName: 'Тамбур 14.87', type: 'lobby', area: 14.87, hideLabel: true }, 515, 125, 610, 200);
  chordRect({ id: 'f1-dispatch', name: 'Диспетчерская', planName: 'Диспетчерская 19.58', type: 'service', area: 19.58 }, 610, 700, 190);
  rect({ id: 'f1-stairs-1', name: 'Лестничная клетка', planName: 'Лестничная клетка 11.89', type: 'stairs', area: 11.89 }, 515, 200, 610, 330);
  poly({ id: 'f1-corr-core-l', name: 'Коридор', planName: 'Коридор 14.54', type: 'corridor', area: 14.54, hideLabel: true },
    [[610, 190], [700, 190], [700, 420], [630, 420], [630, 330], [610, 330]]);
  rect({ id: 'f1-pui-l', name: 'ПУИ', planName: 'ПУИ 4.96', type: 'tech', area: 4.96, hideLabel: true }, 300, 245, 395, 290);
  rect({ id: 'f1-chute-l', name: 'Мусоропровод', planName: 'Мусоропровод 5.16', type: 'tech', area: 5.16, hideLabel: true }, 300, 290, 395, 330);
  rect({ id: 'f1-lifthall-l', name: 'Лифтовой холл', planName: 'Лифтовой холл 17.60', type: 'lobby', area: 17.6 }, 395, 245, 515, 330);
  rect({ id: 'f1-lift-1', name: 'Лифт', type: 'lift', hideLabel: true }, 300, 330, 380, 420);
  rect({ id: 'f1-lift-2', name: 'Лифт', type: 'lift', hideLabel: true }, 380, 330, 460, 420);
  rect({ id: 'f1-elec-l', name: 'Эл. щитовая', planName: 'Эл.щит 8.13', type: 'tech', area: 8.13, hideLabel: true }, 460, 330, 540, 420);
  rect({ id: 'f1-wc-staff-l', name: 'С/У служебный', planName: 'С/У служебн 10.03', type: 'wc', area: 10.03, hideLabel: true }, 540, 330, 630, 420);

  // ---------------- Ряд под узлом и внутренний коридор ------------------------------
  poly({ id: 'f1-corr-l', name: 'Коридор', planName: 'Коридор 71.88', type: 'corridor', area: 71.88, label: { x: 335, y: 575, angle: -90 } },
    [[300, 420], [370, 420], [370, 580], [700, 580], [700, 615], [370, 615], [370, 730], [300, 730]]);
  rect({ id: 'f1-storage', name: 'Кладовая', planName: 'Кладовая 12.30', type: 'storage', area: 12.3 }, 370, 420, 450, 500);
  rect({ id: 'f1-wardrobe-l', name: 'Гардероб', planName: 'Гардероб 12.54', type: 'storage', area: 12.54 }, 370, 500, 450, 580);
  rect({ id: 'f1-office5a', name: 'Кабинет на 5 человек', planName: 'Кабинет на 5 человек 30.79', type: 'office', area: 30.79, status: 'busy' }, 450, 420, 575, 580);
  rect({ id: 'f1-office5b', name: 'Кабинет на 5 человек', planName: 'Кабинет на 5 человек 30.19', type: 'office', area: 30.19, status: 'ending' }, 575, 420, 700, 580);

  // ---------------- Санузлы слева (x 370–700, y 615–730) ---------------------------
  rect({ id: 'f1-wc-staff2', name: 'С/У персонала', planName: 'С/У Перс 3.78', type: 'wc', area: 3.78, hideLabel: true }, 370, 615, 430, 670);
  rect({ id: 'f1-wc-mgn-l', name: 'С/У МГН', planName: 'С/У МГН 4.75', type: 'wc', area: 4.75, hideLabel: true }, 370, 670, 430, 730);
  rect({ id: 'f1-wc-w-l', name: 'С/У женский', planName: 'С/У Жен 21.70', type: 'wc', area: 21.7 }, 430, 615, 560, 730);
  rect({ id: 'f1-locker-l', name: 'Раздевалка', planName: 'Раздев 3.48', type: 'wc', area: 3.48, hideLabel: true }, 560, 615, 610, 670);
  rect({ id: 'f1-shower-m', name: 'Душевая мужская', planName: 'Душевая Муж 5.56', type: 'wc', area: 5.56, hideLabel: true }, 560, 670, 610, 730);
  rect({ id: 'f1-wc-m-l', name: 'С/У мужской', planName: 'С/У Муж 18.33', type: 'wc', area: 18.33 }, 610, 615, 700, 730);

  // ---------------- Центральный холл (x 700–900) ----------------------------------
  poly({ id: 'f1-tambour-n', name: 'Тамбур', planName: 'Тамбур 24.18', type: 'lobby', area: 24.18, hideLabel: true },
    [...span(C(740), C(860)), [860, 110], [740, 110]]);
  poly({ id: 'f1-hall-n', name: 'Коридор', planName: 'Коридор 303.36', type: 'corridor', label: { x: 800, y: 280 } },
    [...span(C(700), C(740)), [740, 110], [860, 110], ...span(C(860), C(900)), [900, 440], [700, 440]]);
  poly({ id: 'f1-cafe-zone', name: 'Зона буфета', planName: 'Зона буфета 45.76', type: 'corridor', area: 45.76, hideLabel: true },
    [[700, 440], [900, 440], [900, 545], [825, 545], [825, 455], [740, 455], [740, 545], [700, 545]]);
  rect({ id: 'f1-cafe', number: 'Cafe', name: 'Буфет', planName: 'Буфет 14.30', type: 'cafe', area: 14.3, status: 'busy' }, 740, 455, 825, 510);
  rect({ id: 'f1-cafe-util', name: 'Подсобное помещение', planName: 'Подсобное помещение 3.39', type: 'storage', area: 3.39, hideLabel: true }, 740, 510, 825, 545);
  poly({ id: 'f1-hall-s', name: 'Коридор', planName: 'Коридор 303.36', type: 'corridor', label: { x: 800, y: 680 } },
    [[700, 545], [900, 545], [900, 790], [855, 790], [855, 900], [745, 900], [745, 790], [700, 790]]);
  poly({ id: 'f1-reception', name: 'Зона ресепшн', planName: 'Зона ресепшн 14.94', type: 'service', area: 14.94, label: { x: 722, y: 860, angle: -90 } },
    [[700, 790], [745, 790], B(745), ...span(B(745), B(700))]);
  poly({ id: 'f1-tambour-s', name: 'Тамбур (главный вход)', planName: 'Тамбур 26.68', type: 'lobby', area: 26.68, hideLabel: true },
    [[745, 900], [855, 900], B(855), ...span(B(855), B(745))]);
  poly({ id: 'f1-metal', name: 'Зона металлодетектора', planName: 'Зона металлодетектора', type: 'service', label: { x: 878, y: 860, angle: -90 } },
    [[855, 790], [900, 790], B(900), ...span(B(900), B(855))]);

  // ---------------- Правый лестнично-лифтовой узел (x 900–1240, y 50–420) ----------
  chordRect({ id: 'f1-security', name: 'Пост охраны и пожарный пост', planName: 'Помещение охраны и пожарного поста 19.67', type: 'service', area: 19.67, label: { x: 945, y: 120, fontSize: 9 } }, 900, 990, 190);
  rect({ id: 'f1-lifthall-r', name: 'Лифтовой холл', planName: 'Лифтовой холл 17.98', type: 'lobby', area: 17.98, label: { x: 945, y: 305, angle: -90 } }, 900, 190, 990, 420);
  chordRect({ id: 'f1-tambour-e1', name: 'Тамбур', planName: 'Тамбур 14.07', type: 'lobby', area: 14.07, hideLabel: true }, 990, 1080, 125);
  rect({ id: 'f1-stairs-2', name: 'Лестничная клетка', planName: 'Лестничная клетка (SF-2)', type: 'stairs' }, 990, 125, 1080, 260);
  rect({ id: 'f1-lift-3', name: 'Лифт', type: 'lift', hideLabel: true }, 990, 260, 1080, 340);
  rect({ id: 'f1-lift-4', name: 'Лифт', type: 'lift', hideLabel: true }, 990, 340, 1080, 420);
  chordRect({ id: 'f1-tambour-e2', name: 'Тамбур', planName: 'Тамбур 15.46', type: 'lobby', area: 15.46, hideLabel: true }, 1080, 1170, 125);
  rect({ id: 'f1-isolator', name: 'Изолятор', planName: 'Изолятор 5.78', type: 'service', area: 5.78, hideLabel: true }, 1080, 125, 1170, 190);
  rect({ id: 'f1-sf2', name: 'Зона безопасности SF-2', planName: 'SF-2', type: 'tech', hideLabel: true }, 1080, 190, 1170, 260);
  rect({ id: 'f1-lifthall-r2', name: 'Лифтовой холл', planName: 'Лифтовой холл 11.04', type: 'lobby', area: 11.04, hideLabel: true }, 1080, 260, 1170, 340);
  rect({ id: 'f1-telecom', name: 'Телекоммуникационная', planName: 'Телекоммуникационная 7.51', type: 'tech', area: 7.51, hideLabel: true }, 1080, 340, 1170, 420);
  chordRect({ id: 'f1-exam', name: 'Кабинет осмотра', planName: 'Кабинет осмотра 19.60', type: 'office', area: 19.6 }, 1170, 1360, 140);
  rect({ id: 'f1-wc-med', name: 'С/У', planName: 'С/У 4.76', type: 'wc', area: 4.76, hideLabel: true }, 1170, 140, 1205, 200);
  rect({ id: 'f1-pui-r2', name: 'ПУИ', planName: 'ПУИ 5.25', type: 'tech', area: 5.25, hideLabel: true }, 1205, 140, 1240, 200);
  rect({ id: 'f1-lift-p1', name: 'Лифт Р-1', planName: 'Р-1', type: 'lift', hideLabel: true }, 1170, 200, 1205, 260);
  rect({ id: 'f1-chute-r', name: 'Мусоропровод', planName: 'Мусоропровод 4.87', type: 'tech', area: 4.87, hideLabel: true }, 1205, 200, 1240, 260);
  rect({ id: 'f1-elec-r', name: 'Эл. щитовая', planName: 'Эл.щит 9.18', type: 'tech', area: 9.18, hideLabel: true }, 1170, 260, 1240, 340);
  rect({ id: 'f1-pui-r1', name: 'ПУИ', planName: 'ПУИ 6.43', type: 'tech', area: 6.43, hideLabel: true }, 1170, 340, 1240, 420);
  rect({ id: 'f1-med', name: 'Медпункт', planName: 'Мед. пункт 36.79', type: 'office', area: 36.79, label: { x: 1320, y: 300, angle: -90 } }, 1280, 180, 1360, 420);

  // ---------------- Санузлы справа (x 900–1240, y 420–540) -------------------------
  rect({ id: 'f1-wc-w-r', number: 'WC', name: 'С/У женский', planName: 'С/У Жен 16.13', type: 'wc', area: 16.13 }, 900, 420, 1010, 500);
  rect({ id: 'f1-wc-corr', name: 'Коридор', planName: 'Коридор 5.27', type: 'corridor', area: 5.27, hideLabel: true }, 900, 500, 1010, 540);
  rect({ id: 'f1-shower-w', name: 'Душевая женская', planName: 'Душевая Жен 5.23', type: 'wc', area: 5.23, hideLabel: true }, 1010, 420, 1060, 480);
  rect({ id: 'f1-locker-r', name: 'Раздевалка', planName: 'Раздев 4.20', type: 'wc', area: 4.2, hideLabel: true }, 1010, 480, 1060, 540);
  rect({ id: 'f1-wc-m-r', number: 'WC', name: 'С/У мужской', planName: 'С/У Муж 25.05', type: 'wc', area: 25.05 }, 1060, 420, 1180, 540);
  rect({ id: 'f1-wc-mgn-r', name: 'С/У МГН', planName: 'С/У МГН 5.83', type: 'wc', area: 5.83, hideLabel: true }, 1180, 420, 1240, 480);
  rect({ id: 'f1-wc-staff-r', name: 'С/У персонала', planName: 'С/У Перс 6.52', type: 'wc', area: 6.52, hideLabel: true }, 1180, 480, 1240, 540);

  // ---------------- Правая половина: коридор, гардероб, классы ---------------------
  poly({ id: 'f1-corr-r', name: 'Коридор', planName: 'Коридор 121.78', type: 'corridor', area: 121.78, label: { x: 1030, y: 570 } },
    [[900, 540], [1240, 540], [1240, 140], [1360, 140], [1360, 180], [1280, 180], [1280, 540], [1360, 540], [1360, 600], [1240, 600], [1240, 720], [1160, 720], [1160, 600], [900, 600]]);
  rect({ id: 'f1-wardrobe-r', number: 'CR', name: 'Гардероб', planName: 'Гардероб 31.36', type: 'storage', area: 31.36, status: 'free' }, 900, 600, 1010, 720);
  rect({ id: 'f1-lockers', number: 'Cinema', name: 'Помещение для шкафчиков', planName: 'Помещение для шкафчиков 42.47', type: 'hall', area: 42.47, status: 'free' }, 1010, 600, 1160, 720);
  poly({ id: 'f1-office-clerk', name: 'Канцелярия', planName: 'Канцелярия 31.91', type: 'office', area: 31.91, status: 'busy', label: { x: 930, y: 830, angle: -90 } },
    [[900, 720], [960, 720], B(960), ...span(B(960), B(900))]);
  poly({ id: 'f1-class25', number: '100', name: 'Учебный класс на 25 уч.', planName: 'Учебный класс на 25 уч 128.72', type: 'class', area: 128.72, status: 'busy' },
    [[960, 720], [1240, 720], B(1240), ...span(B(1240), B(960))]);
  rect({ id: 'f1-labassist', number: '102', name: 'Лаборантская', planName: 'Лаборантская 17.65', type: 'office', area: 17.65 }, 1280, 420, 1360, 540);
  poly({ id: 'f1-class20b', number: '102', name: 'Учебный класс на 20 уч.', planName: 'Учебный класс на 20 уч 66.18', type: 'class', area: 66.18 },
    [[1360, 420], R(420), ...span(R(420), R(600)), [1360, 600]]);
  poly({ id: 'f1-class20a', number: '101', name: 'Учебный класс на 20 уч.', planName: 'Учебный класс на 20 уч 61.30', type: 'class', area: 61.3, status: 'ending' },
    [[1240, 600], [1360, 600], R(600), ...span(R(600), B(1240))]);
  poly({ id: 'f1-informatics', number: '103', name: 'Кабинет информатики', planName: 'Кабинет информатики 130.98', type: 'class', area: 130.98 },
    [C(1360), ...span(C(1360), R(420)), [1360, 420]]);

  f.exterior();
  const report = finalizePlan(b);

  // ---------------- Двери (после разбиения стен; стены адресуются по точкам) -------
  const D = (a: string, c: string, pos = 0.5, width = 26, swing: DoorSwing = 'left-in') => b.door(a, c, pos, width, swing);
  const Q = (x0: number, y0: number, x1: number, y1: number, pos = 0.5, width = 26, swing: DoorSwing = 'left-in') =>
    D(P(x0, y0), P(x1, y1), pos, width, swing);
  // Левая колонна
  Q(300, 50, 300, 150, 0.5, 22);
  Q(300, 150, 300, 245, 0.5, 22);
  Q(300, 420, 300, 480, 0.5, 30, 'double');
  D(L(300), P(300, 300), 0.5, 40, 'double');
  Q(300, 480, 300, 640, 0.5, 30, 'double');
  Q(300, 640, 300, 730, 0.5, 30, 'double');
  Q(160, 430, 160, 480, 0.5, 30, 'double');
  Q(300, 730, 370, 730, 0.5, 30, 'double');
  D(L(430), L(480), 0.5, 34, 'double');
  D(P(460, 730), B(460), 0.35, 30, 'double');
  // Ряд помещений и санузлы → внутренний коридор
  Q(370, 420, 370, 500, 0.5, 22);
  Q(370, 500, 370, 580, 0.5, 22);
  Q(450, 580, 575, 580, 0.3, 26, 'right-out');
  Q(575, 580, 700, 580, 0.3, 26, 'right-out');
  Q(370, 615, 370, 670, 0.5, 20);
  Q(370, 670, 370, 730, 0.5, 20);
  Q(430, 615, 560, 615, 0.5, 24);
  Q(560, 615, 610, 615, 0.5, 20);
  Q(610, 615, 700, 615, 0.5, 24);
  Q(560, 670, 610, 670, 0.5, 18);
  Q(700, 580, 700, 615, 0.5, 32, 'double');
  Q(700, 730, 700, 790, 0.5, 34, 'double');
  // Левый узел
  Q(395, 50, 395, 150, 0.5, 22);
  Q(395, 165, 395, 245, 0.5, 22);
  Q(395, 245, 395, 290, 0.5, 18);
  Q(395, 290, 395, 330, 0.5, 18);
  Q(515, 50, 515, 125, 0.5, 30, 'double');
  Q(515, 125, 515, 165, 0.5, 26);
  Q(515, 165, 515, 200, 0.5, 26);
  Q(515, 200, 515, 245, 0.5, 26);
  Q(395, 245, 515, 245, 0.5, 26);
  Q(610, 125, 610, 190, 0.5, 26);
  Q(610, 200, 610, 330, 0.5, 30, 'double');
  Q(700, 190, 700, 420, 0.5, 34, 'double');
  Q(630, 330, 630, 420, 0.5, 24);
  Q(460, 330, 515, 330, 0.5, 22);
  Q(395, 330, 460, 330, 0.5, 30, 'double');
  Q(300, 420, 370, 420, 0.5, 30, 'double');
  Q(700, 50, 700, 190, 0.5, 24, 'right-in');
  D(C(515), C(610), 0.5, 40, 'double');
  D(C(740), C(860), 0.5, 48, 'double');
  D(B(745), B(855), 0.5, 48, 'double');
  // Холл
  Q(740, 110, 860, 110, 0.5, 44, 'double');
  Q(745, 900, 855, 900, 0.5, 44, 'double');
  Q(740, 455, 825, 455, 0.5, 24);
  Q(825, 455, 825, 510, 0.5, 24);
  Q(740, 510, 740, 545, 0.5, 20);
  // Правый узел
  Q(900, 50, 900, 190, 0.5, 24, 'left-in');
  Q(900, 190, 900, 420, 0.5, 34, 'double');
  Q(990, 125, 1080, 125, 0.5, 30, 'double');
  Q(990, 190, 990, 260, 0.5, 30, 'double');
  Q(990, 260, 990, 340, 0.5, 30, 'double');
  Q(990, 340, 990, 420, 0.5, 30, 'double');
  Q(1080, 50, 1080, 125, 0.5, 30, 'double');
  Q(1080, 125, 1170, 125, 0.5, 24);
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
  Q(1280, 180, 1280, 420, 0.3, 26, 'right-in');
  Q(1280, 420, 1280, 540, 0.5, 24, 'right-in');
  Q(1360, 140, 1360, 180, 0.5, 30, 'right-in');
  D(C(990), C(1080), 0.5, 40, 'double');
  D(C(1080), C(1170), 0.5, 40, 'double');
  // Санузлы справа и правая половина
  Q(900, 500, 900, 540, 0.5, 22, 'right-in');
  Q(900, 500, 1010, 500, 0.5, 24);
  Q(1010, 500, 1010, 540, 0.5, 20);
  Q(1010, 480, 1060, 480, 0.5, 18);
  Q(1060, 540, 1180, 540, 0.5, 24);
  Q(1240, 420, 1240, 480, 0.5, 20);
  Q(1240, 480, 1240, 540, 0.5, 20);
  Q(900, 600, 1010, 600, 0.5, 26);
  Q(1010, 600, 1160, 600, 0.5, 26);
  Q(1160, 600, 1160, 720, 0.5, 26);
  Q(1160, 720, 1240, 720, 0.5, 30, 'double');
  Q(900, 720, 900, 790, 0.5, 26, 'right-in');
  Q(1240, 600, 1240, 720, 0.5, 30, 'double');
  Q(1360, 540, 1360, 600, 0.5, 30, 'right-in');
  Q(900, 545, 900, 600, 0.5, 44, 'double');

  // ---------------- Спецзоны --------------------------------------------------------
  b.zone('stairs', 'f1-stairs-1', 90);
  b.zone('stairs', 'f1-stairs-2', 90);
  for (const id of ['f1-lift-1', 'f1-lift-2', 'f1-lift-3', 'f1-lift-4', 'f1-lift-p1']) b.zone('lift', id);
  for (const r of b.rooms) if (r.type === 'wc') b.zone('wc', r.id);
  for (const r of b.rooms) if (r.type === 'tech') b.zone('tech', r.id);

  return { plan: b.build(), report };
}
