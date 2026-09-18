"""Чертёж этажа (packages/map-data/plans/floor-N.svg) → топологическая модель (tools/traced/floor-N.json).

Чертёж — набор штрихов (path/polygon/rect/polyline, как нарисовано в Illustrator) и подписей (text).
Штрихи остаются в модели ДОСЛОВНО (`strokes`, кривые не аппроксимируются) — именно их рисует экран
как стены. Помещения между штрихами вычисляются: штрихи дискретизируются в ломаные, концы стен
«достраиваются» до соседних стен (T-стыки), дверные проёмы перекрываются невидимыми мостиками,
планарный граф полигонизируется, каждая грань = помещение. Подпись на чертеже называет грань, в
которой стоит. Грань с «дырами» (коридор вокруг островов) остаётся одним помещением: внешнее кольцо
в `boundary`, внутренние — в `holes`.

    python tools/svg2plan.py floor-2                                # один этаж
    python tools/svg2plan.py                                        # все этажи из FLOORS
    python tools/svg2plan.py floor-2 --qa DIR --crop x0 y0 x1 y1    # увеличенный фрагмент QA-рендера

Нужны: numpy, opencv-python, shapely, svgelements, Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.geometry.polygon import orient
from shapely import unary_union
from shapely.ops import nearest_points, polygonize, polylabel
from shapely.strtree import STRtree
from svgelements import SVG, Close, Line, Matrix, Move, Path as SvgPath, Shape, Text

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PLANS = ROOT / 'packages/map-data/plans'
OUT = HERE / 'traced'

# Общий viewBox всех этажей (как у vector2map): чертёж вписывается с полем.
VIEW = (1600.0, 1000.0)
MARGIN = 24.0
# шаг сетки, к которой привязываются координаты при объединении сети: концы штрихов Illustrator
# расходятся на сотые доли единицы, и без привязки они остаются несвязанными
GRID = 0.05
DEBUG = False
DEBUG_DIR = HERE / 'traced'

# ------------------------------------------------------------------ конфигурация этажей
#
# Параметры сети — в единицах ЧЕРТЕЖА (пересчитываются масштабом вписывания):
#   snap        — конец штриха ближе этого к другой стене считается T-стыком и достраивается;
#   gap         — максимальная ширина дверного проёма, который перекрывается мостиком;
#   door_radius — радиус диска для растрового поиска проёмов между округлыми торцами стен
#                 (шире половины любого проёма, уже половины любого коридора);
#   stroke      — толщина штриха на чертеже (для растрового прохода);
#   wall_width  — грань уже этого — внутренность двойной стены, не помещение;
#   min_area    — грань меньше этого — мусор.
# captions: текст подписи → код (иначе код = текст). anchors: помещения без подписи на чертеже,
# `at` — точка ВНУТРИ грани в целевых координатах (viewBox 1600×1000); `text` — подпись, `label` —
# её позиция (по умолчанию — полюс недоступности грани), `angle`, `hidden`. corridor: точки (целевые
# координаты) в гранях, которые считать коридором (дополнительно к самой большой безымянной грани).
FLOORS = {
    'floor-1': {
        'svg': 'floor-1.svg',
        'rotate': -90,  # фото стенда снято повёрнутым: вход должен быть сверху, дуга — снизу
        'snap': 12, 'gap': 130, 'door_radius': 24, 'stroke': 7, 'wall_width': 16, 'min_area': 300,
        'font': 18 * 2.15,  # подписи на чертеже нет — размер как у 2 этажа в тех же единицах
        'captions': {},
        # подписи расставлены по фото стенда (на чертеже текста нет)
        'anchors': {
            '100': {'at': (1053, 815), 'text': '100'},
            '101': {'at': (1282, 690), 'text': '101'},
            '102': {'at': (1437, 430), 'text': '102'},
            '102A': {'at': (1366, 564), 'text': '102'},
            '103': {'at': (1341, 210), 'text': '103'},
            'WC-1': {'at': (981, 459), 'text': 'WC'},
            'WC-2': {'at': (1122, 482), 'text': 'WC'},
            'CR': {'at': (971, 607), 'text': 'CR'},
            'CINEMA': {'at': (1081, 624), 'text': 'Cinema'},
            'CAFE': {'at': (813, 472), 'text': 'Cafe'},
        },
        # тёмные на фото проходы: холл, левый коридор, нижняя комната слева, южный тамбур
        'corridor': [(380, 571), (472, 634), (786, 862), (1305, 475)],
        # цвет на фото → тип безымянной грани (остальные безымянные — служебные)
        'types': {
            (178, 313): 'hall', (448, 480): 'hall', (937, 742): 'hall',
            (828, 114): 'lobby', (963, 140): 'lobby', (680, 131): 'lobby',
            (450, 562): 'stairs',
        },
    },
    'floor-2': {
        'svg': 'floor-2.svg',
        'rotate': 0,  # как нарисован: дуга (201, 200, 226, 224) внизу — так же, как дуга 1 этажа, этажи в стопке смотрят в одну сторону
        'snap': 5, 'gap': 60, 'door_radius': 10, 'stroke': 2, 'wall_width': 8, 'min_area': 60,
        'font': 18,
        'captions': {'AI lab': 'AI-LAB'},
        'anchors': {'VOID': {'at': (788, 478), 'text': '', 'hidden': True}},
        'corridor': [],
    },
}


# ------------------------------------------------------------------ чертёж


def fmt(v: float) -> str:
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def round_d(d: str) -> str:
    return re.sub(r'-?\d+\.\d+(?:e-?\d+)?', lambda m: fmt(float(m.group(0))), d)


def read_plan(file: Path):
    """Штрихи (svgelements Path с учётом трансформаций) и подписи (текст, матрица)."""
    svg = SVG.parse(str(file), reify=True)
    strokes, texts = [], []
    for el in svg.elements():
        if isinstance(el, Text):
            if el.text and el.text.strip():
                texts.append((el.text.strip(), el.transform))
        elif isinstance(el, Shape):
            if el.stroke is None or el.stroke.value is None:
                continue  # невидимые вспомогательные фигуры (fill:none без обводки)
            p = el if isinstance(el, SvgPath) else SvgPath(el)
            p.reify()
            if len(p) < 2:
                continue
            strokes.append(p)
    return svg.viewbox, strokes, texts


def sample(path: SvgPath, step: float) -> list[list[tuple[float, float]]]:
    """Ломаные пути (по подконтуру), шаг дискретизации кривых — step единиц."""
    out, cur = [], []
    for seg in path:
        if isinstance(seg, Move):
            if len(cur) > 1:
                out.append(cur)
            cur = [(seg.end.x, seg.end.y)]
        elif isinstance(seg, Close):
            if cur and math.dist(cur[0], cur[-1]) > 1e-9:
                cur.append(cur[0])
        elif isinstance(seg, Line):
            cur.append((seg.end.x, seg.end.y))
        else:
            n = max(4, int(seg.length() / step))
            cur.extend((p.x, p.y) for p in (seg.point(i / n) for i in range(1, n + 1)))
    if len(cur) > 1:
        out.append(cur)
    return out


def fit_matrix(strokes, rotate: float):
    """Поворот + вписывание в VIEW с полем. Возвращает (Matrix svgelements, масштаб)."""
    rot = Matrix(f'rotate({rotate})')
    xs, ys = [], []
    for p in strokes:
        q = p * rot
        q.reify()
        for pts in sample(q, 4.0):
            for x, y in pts:
                xs.append(x)
                ys.append(y)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    k = min((VIEW[0] - 2 * MARGIN) / w, (VIEW[1] - 2 * MARGIN) / h)
    tx = (VIEW[0] - w * k) / 2 - min(xs) * k
    ty = (VIEW[1] - h * k) / 2 - min(ys) * k
    return rot * Matrix(f'scale({k})') * Matrix(f'translate({tx} {ty})'), k


def apply(M: Matrix, x: float, y: float) -> tuple[float, float]:
    return M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f


# ------------------------------------------------------------------ сеть стен


def dangle_bridges(net, snap: float, gap: float):
    """Висячие концы нодированной сети (узлы степени 1) достраиваются до того, к чему их вели:
    ближайшая стена в пределах snap (T-стык), иначе — другой висячий конец или стена, в которую
    упирается луч по направлению конца, в пределах gap (дверной проём)."""
    pieces = list(getattr(net, 'geoms', [net]))
    key = lambda c: (round(c[0], 3), round(c[1], 3))
    deg: dict[tuple, int] = {}
    for g in pieces:
        cs = list(g.coords)
        for c in (cs[0], cs[-1]):
            deg[key(c)] = deg.get(key(c), 0) + 1
    dangles = []  # (точка, направление наружу, индекс куска)
    for gi, g in enumerate(pieces):
        cs = list(g.coords)
        for end_idx in (0, len(cs) - 1):
            if deg[key(cs[end_idx])] != 1:
                continue
            p = cs[end_idx]
            walk = cs[1:] if end_idx == 0 else cs[-2::-1]
            q, acc = p, 0.0
            for c in walk:
                acc += math.dist(q, c)
                q = c
                if acc >= 4.0:
                    break
            dx, dy = p[0] - q[0], p[1] - q[1]
            L = math.hypot(dx, dy) or 1
            dangles.append((p, (dx / L, dy / L), gi))
    if not dangles:
        return []
    tree = STRtree(pieces)
    bridges = []
    for p, (ux, uy), gi in dangles:
        P = Point(p)
        near = [j for j in tree.query(P.buffer(gap + 1)) if j != gi]
        if not near:
            continue
        oth = unary_union([pieces[j] for j in near])
        d = P.distance(oth)
        if DEBUG:
            print(f'  [dangle] ({p[0]:.2f},{p[1]:.2f}) dir=({ux:.2f},{uy:.2f}) d_other={d:.4f} own_len={pieces[gi].length:.2f}')
        if d <= snap:
            if d > 1e-9:
                _, q = nearest_points(P, oth)
                bridges.append(LineString([p, (q.x, q.y)]))
            continue
        cands = [(math.dist(p, o), o) for o, _, gj in dangles if gj != gi and math.dist(p, o) > 1e-9]
        ray = LineString([p, (p[0] + ux * gap, p[1] + uy * gap)])
        hit = ray.intersection(oth)
        if not hit.is_empty:
            for g in getattr(hit, 'geoms', [hit]):
                cands.extend((0.7 * math.dist(c, p), c) for c in getattr(g, 'coords', []))
        if not cands:
            continue
        d, c = min(cands, key=lambda t: t[0])
        if d <= gap:
            bridges.append(LineString([p, c]))
    return bridges


def door_bridges(polys, outline_poly: Polygon, door_radius: float, stroke_units: float):
    """Проёмы между округлыми торцами стен — растровым проходом по свободному пространству:
    свободное место размывается диском шире любого проёма (комнаты отрезаются от коридора),
    куски растут обратно и встречаются посередине проёма — линия встречи и есть мостик."""
    R = 3  # пикселей на единицу
    W, H = int(VIEW[0] * R) + 1, int(VIEW[1] * R) + 1
    px = lambda pts: np.array([(x * R, y * R) for x, y in pts], np.int32)
    inside = np.zeros((H, W), np.uint8)
    cv2.fillPoly(inside, [px(outline_poly.exterior.coords)], 1)
    walls = np.zeros((H, W), np.uint8)
    for pts in polys:
        cv2.polylines(walls, [px(pts)], False, 1, max(1, int(round(stroke_units * R))))
    free = inside & (1 - walls)
    r = int(door_radius * R)
    disc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    eroded = cv2.erode(free, disc)
    n_seeds, seeds = cv2.connectedComponents(eroded, connectivity=4)
    # водораздел по плоскому изображению = равномерный рост областей от семян до полного
    # заполнения свободного места; граница (-1) между двумя семенами — линия встречи
    markers = seeds.astype(np.int32)
    markers[free == 0] = n_seeds  # стены и снаружи — отдельный бассейн
    img = np.zeros((H, W, 3), np.uint8)
    img[free == 0] = 255  # перепад яркости у стен: их бассейн растёт последним, семена — первыми
    cv2.watershed(img, markers)
    lab = markers.copy()
    lab[(lab < 1) | (lab >= n_seeds)] = 0
    # линия водораздела бывает толщиной в 2 px: соседей ищем в окне 5×5
    k5 = np.ones((5, 5), np.uint8)
    big = float(n_seeds + 1)
    mx = cv2.dilate(lab.astype(np.float32), k5)
    inv = np.where(lab > 0, big - lab, 0).astype(np.float32)
    mn = big - cv2.dilate(inv, k5)
    meet = ((markers == -1) & (mx > 0) & (mn < mx - 0.5)).astype(np.uint8)
    labels = markers
    n, comp = cv2.connectedComponents(meet, connectivity=8)
    if DEBUG:
        print(f'  [doors] free {int(free.sum())} px, seeds {n_seeds - 1}, wshed px {int((markers == -1).sum())}, meet px {int(meet.sum())}, meet comps {n - 1}')
        ws = markers == -1
        pairs = {}
        for a_, b_ in zip(mn[ws].astype(int), mx[ws].astype(int)):
            pairs[(a_, b_)] = pairs.get((a_, b_), 0) + 1
        print('  [doors] пары (min,max):', sorted(pairs.items(), key=lambda t: -t[1])[:12])
        rng = np.random.RandomState(3)
        pal = rng.randint(40, 255, (n_seeds + 2, 3)).astype(np.uint8)
        pal[0] = (20, 20, 20)
        pal[n_seeds] = (0, 0, 0)
        vis = pal[np.clip(markers, 0, n_seeds + 1)]
        vis[markers == -1] = (255, 255, 255)
        vis[(eroded == 1)] = (vis[(eroded == 1)] * 0.6).astype(np.uint8)
        vis[meet == 1] = (0, 0, 255)
        cv2.imwrite(str(DEBUG_DIR / 'doors-debug.png'), cv2.resize(vis, (W // 2, H // 2), interpolation=cv2.INTER_AREA))
    bridges = []
    rejected = []
    for i in range(1, n):
        ys, xs = np.nonzero(comp == i)
        if len(xs) < 4:
            continue
        pts = np.column_stack((xs, ys)).astype(float) / R
        c = pts.mean(axis=0)
        d = pts - c
        _, _, vt = np.linalg.svd(d, full_matrices=False)
        t = d @ vt[0]
        a, b = pts[t.argmin()], pts[t.argmax()]
        if math.dist(a, b) > 2 * door_radius + 4:
            rejected.append((round(math.dist(a, b)), tuple(int(v) for v in c)))
            continue
        u = (b - a) / (np.linalg.norm(b - a) or 1)
        ext = stroke_units + 1.5
        bridges.append(LineString([tuple(a - u * ext), tuple(b + u * ext)]))
    if DEBUG:
        print(f'  [doors] мостиков {len(bridges)}, отклонено по длине: {rejected}')
    return bridges


def neck_bridges(faces, radius: float, stroke_units: float, max_width: float, want=None, with_rest=False):
    """Горлышки: грань размывается диском радиуса radius и распадается на куски. Проход между двумя
    кусками — отрезок их ближайших точек; поперёк него ищется самая короткая хорда грани (дверной
    проём) и по ней кладётся мостик. want(face) — какие грани обрабатывать. with_rest — искать
    проходы и в «остаток» грани, не переживший размытие (комната, прилипшая к телу двойной стены)."""
    geoms = lambda g: [q for q in getattr(g, 'geoms', [g]) if isinstance(q, Polygon) and not q.is_empty]
    bridges = []
    for f in faces:
        if want is not None and not want(f):
            continue
        pieces = [p for p in geoms(f.buffer(-radius)) if p.area > radius * radius]
        if not pieces or (len(pieces) < 2 and not with_rest):
            continue
        pairs = [(pieces[i], pieces[j]) for i in range(len(pieces)) for j in range(i + 1, len(pieces))
                 if pieces[i].distance(pieces[j]) <= 2 * radius + 4]
        if with_rest:
            grown = unary_union([p.buffer(radius + 1.0) for p in pieces]).intersection(f)
            for p in pieces:
                for g in geoms(f.difference(grown)):
                    if g.area > 1 and p.distance(g) <= radius + 3:
                        pairs.append((p, g))
        fat = f.buffer(0.05)
        reach = max_width + 2 * stroke_units
        for a, b in pairs:
            qa, qb = nearest_points(a, b)
            dx, dy = qb.x - qa.x, qb.y - qa.y
            L = math.hypot(dx, dy)
            if L < 1e-6 or not fat.contains(LineString([qa, qb])):
                continue  # куски соединены не здесь (между ними стена)
            ux, uy = -dy / L, dx / L
            best = None
            for t in np.linspace(-0.15, 1.15, 27):
                cx, cy = qa.x + dx * t, qa.y + dy * t
                if not f.contains(Point(cx, cy)):
                    continue
                ray = LineString([(cx - ux * reach, cy - uy * reach), (cx + ux * reach, cy + uy * reach)])
                seg = ray.intersection(f)
                part = [q for q in getattr(seg, 'geoms', [seg]) if isinstance(q, LineString) and q.distance(Point(cx, cy)) < 1e-6]
                if part and (best is None or part[0].length < best.length):
                    best = part[0]
            if best is None or best.length > max_width or best.length < 1e-6:
                if DEBUG:
                    print(f'  [neck] r={radius:.1f}: проход ({qa.x:.0f},{qa.y:.0f})→({qb.x:.0f},{qb.y:.0f}) без хорды ≤ {max_width:.0f}')
                continue
            (x0, y0), (x1, y1) = best.coords[0], best.coords[-1]
            ln = best.length
            ex, ey = (x1 - x0) / ln * (stroke_units + 1.5), (y1 - y0) / ln * (stroke_units + 1.5)
            if DEBUG:
                print(f'  [neck] r={radius:.1f}: мостик ({x0:.0f},{y0:.0f})–({x1:.0f},{y1:.0f}) ширина {ln:.1f}')
            bridges.append(LineString([(x0 - ex, y0 - ey), (x1 + ex, y1 + ey)]))
    return bridges


def mean_width(f: Polygon) -> float:
    return 2 * f.area / max(f.length, 1e-9)


# ------------------------------------------------------------------ сборка


def build(floor_id: str, qa_dir: Path, crop=None, dump=None, lines_only=False):
    cfg = FLOORS[floor_id]
    src = PLANS / cfg['svg']
    viewbox, paths, texts = read_plan(src)
    M, k = fit_matrix(paths, cfg['rotate'])
    step = 1.5
    polys: list[list[tuple[float, float]]] = []
    stroke_of: list[int] = []  # ломаная → индекс штриха
    strokes_out = []
    for i, p in enumerate(paths):
        q = p * M
        q.reify()
        strokes_out.append({'id': f's{i + 1}', 'd': round_d(q.d())})
        for pts in sample(q, step):
            if len(pts) > 3 and 0 < math.dist(pts[0], pts[-1]) <= 3.0 * k:
                pts.append(pts[0])  # кольцо, оставленное «на волос» открытым
            ls = LineString(pts).simplify(0.12, preserve_topology=False)
            polys.append([tuple(c) for c in ls.coords])
            stroke_of.append(i)

    snap, gap, door_r, stroke_u, wall_w = (cfg[key] * k for key in ('snap', 'gap', 'door_radius', 'stroke', 'wall_width'))
    min_area = cfg['min_area'] * k * k

    lines = [LineString(p) for p in polys]
    stroke_union = unary_union(lines, grid_size=GRID)
    net = unary_union(lines, grid_size=GRID)
    b_end = []
    for _ in range(4):
        nb = dangle_bridges(net, snap, gap)
        if not nb:
            break
        b_end += nb
        net = unary_union([net] + nb, grid_size=GRID)
    # контур здания — внешнее кольцо объединения всех граней (контур на чертеже может быть составным)
    footprint = unary_union(list(polygonize(net)))
    if isinstance(footprint, MultiPolygon):
        footprint = max(footprint.geoms, key=lambda g: g.area)
    footprint = Polygon(footprint.exterior)
    b_door = door_bridges(polys + [list(b.coords) for b in b_end], footprint, door_r, stroke_u)
    bridges = b_end + b_door
    net = unary_union([net] + b_door, grid_size=GRID)
    faces = [f for f in polygonize(net) if f.area > 0.5]

    # подписи → грани
    fs_units = cfg['font'] * k
    captions = []
    for text, tm in texts:
        w, h = len(text) * cfg['font'] * 0.52, cfg['font']
        cx, cy = w / 2, -h * 0.33
        sx, sy = tm.a * cx + tm.c * cy + tm.e, tm.b * cx + tm.d * cy + tm.f
        x, y = apply(M, sx, sy)
        angle = math.degrees(math.atan2(tm.b, tm.a)) + cfg['rotate']
        while angle <= -90:
            angle += 180
        while angle > 90:
            angle -= 180
        captions.append((cfg['captions'].get(text, text), text, (x, y), angle))
    named_pts = [Point(x, y) for _, _, (x, y), _ in captions] + [Point(*spec['at']) for spec in cfg['anchors'].values()]

    # горлышки: сначала все грани с дверным радиусом, затем — грани с несколькими подписями с большим
    b_neck = []
    multi = lambda f: sum(f.contains(P) for P in named_pts) >= 2
    band = lambda f: mean_width(f) < wall_w and f.area > 4 * door_r * door_r
    rounds = [(door_r, None, False), (door_r, band, True), (door_r, band, True),
              (door_r * 1.5, multi, False), (door_r * 2, multi, False), (door_r * 3, multi, False)]
    for radius, want, with_rest in rounds:
        nb = neck_bridges(faces, radius, stroke_u, gap, want, with_rest)
        if not nb:
            continue
        b_neck += nb
        bridges = b_end + b_door + b_neck
        net = unary_union([net] + nb, grid_size=GRID)
        faces = [f for f in polygonize(net) if f.area > 0.5]

    if dump:
        fx = next((f for f in faces if f.contains(Point(*dump))), None)
        if fx is not None:
            qa_dir.mkdir(parents=True, exist_ok=True)
            (qa_dir / f'{floor_id}-face.wkt').write_text(fx.wkt, encoding='utf-8')
            print(f'  грань в {dump}: площадь {fx.area:.0f}, дыр {len(fx.interiors)} → {qa_dir / (floor_id + "-face.wkt")}')

    if DEBUG:
        deg: dict[tuple, int] = {}
        for g in getattr(net, 'geoms', [net]):
            cs = list(g.coords)
            for c in (cs[0], cs[-1]):
                kk = (round(c[0], 3), round(c[1], 3))
                deg[kk] = deg.get(kk, 0) + 1
        dangles = sorted(kk for kk, d in deg.items() if d == 1)
        print(f'  [net] висячих концов {len(dangles)}:', [(int(x), int(y)) for x, y in dangles])

    def face_at(x, y):
        inside = [i for i, f in enumerate(faces) if f.contains(Point(x, y))]
        if not inside:
            return None
        return min(inside, key=lambda i: faces[i].area)

    named: dict[int, dict] = {}
    problems: list[str] = []
    for code, text, (x, y), angle in captions:
        i = face_at(x, y)
        if i is None:
            problems.append(f'подпись {text!r} в ({x:.0f},{y:.0f}) не попала ни в одну грань')
            continue
        if i in named:
            problems.append(f'подпись {text!r} в ({x:.0f},{y:.0f}) попала в грань #{i} ({faces[i].area:.0f} ед²), где уже {named[i]["text"]!r}')
            continue
        named[i] = {'code': code, 'text': text, 'x': x, 'y': y, 'angle': round(angle, 2)}
    for code, spec in cfg['anchors'].items():
        i = face_at(*spec['at'])
        if i is None:
            problems.append(f'якорь {code} {spec["at"]} не попал ни в одну грань')
            continue
        if i in named:
            problems.append(f'якорь {code} попал в грань #{i}, где уже {named[i]["text"]!r}')
            continue
        pole = polylabel(faces[i], 0.5)
        lx, ly = spec.get('label', (pole.x, pole.y))
        named[i] = {'code': code, 'text': spec.get('text', code), 'x': lx, 'y': ly, 'angle': spec.get('angle', 0), 'hidden': spec.get('hidden', False)}

    kinds: dict[int, str] = {}
    unnamed = [i for i in range(len(faces)) if i not in named]
    for i in unnamed:
        f = faces[i]
        kinds[i] = 'floor' if f.area < min_area else 'wall' if mean_width(f) < wall_w else 'space'
    # типы из конфигурации — до выбора коридора, чтобы «Закрытая зона» не стала коридором
    types: dict[int, str] = {}
    for (x, y), typ in cfg.get('types', {}).items():
        i = face_at(x, y)
        if i is None:
            problems.append(f'тип {typ} в ({x},{y}) не попал ни в одну грань')
        elif i in named:
            problems.append(f'тип {typ} в ({x},{y}) попал в подписанную грань {named[i]["text"]!r}')
        else:
            kinds[i] = 'space'
            types[i] = typ
    spaces = [i for i in unnamed if kinds[i] == 'space' and i not in types]
    if spaces:
        kinds[max(spaces, key=lambda i: faces[i].area)] = 'corridor'
    for x, y in cfg['corridor']:
        i = face_at(x, y)
        if i is not None and i in unnamed and i not in types:
            kinds[i] = 'corridor'
    virtual_union = unary_union(bridges, grid_size=GRID) if bridges else LineString()
    regions = [(i, f, 'room' if i in named else kinds[i], named.get(i)) for i, f in enumerate(faces)]
    holes_total = sum(len(f.interiors) for f in faces)
    if dump:
        for i, f, kind, info in sorted(regions, key=lambda r: -r[1].area):
            b = f.bounds
            print(f'  #{i:<3} {kind:<8} {info["text"] if info else "":<7} area {f.area:9.0f} holes {len(f.interiors):2} '
                  f'bbox {b[0]:6.0f},{b[1]:6.0f}–{b[2]:6.0f},{b[3]:6.0f} width {mean_width(f):6.1f}')

    # топология: точки/стены из нодированной сети, контуры граней → ссылки на стены
    key = lambda x, y: (round(x, 3), round(y, 3))
    points: dict[tuple, str] = {}
    walls: dict[frozenset, dict] = {}
    pt_list, wall_list = [], []

    def pid(x, y):
        kk = key(x, y)
        if kk not in points:
            points[kk] = f'p{len(points) + 1}'
            pt_list.append({'id': points[kk], 'x': round(x, 2), 'y': round(y, 2)})
        return points[kk]

    def wid(a, b):
        ka, kb = key(*a), key(*b)
        if ka == kb:
            return None
        kk = frozenset((ka, kb))
        if kk not in walls:
            mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            virtual = stroke_union.distance(mid) > 2 * GRID and (not virtual_union.is_empty and virtual_union.distance(mid) <= 2 * GRID)
            w = {'id': f'w{len(walls) + 1}', 'start': pid(*a), 'end': pid(*b), 'type': 'line'}
            if virtual:
                w['virtual'] = True
            walls[kk] = w
            wall_list.append(w)
        return walls[kk]

    for g in getattr(net, 'geoms', [net]):
        cs = list(g.coords)
        for a, b in zip(cs, cs[1:]):
            wid(a, b)

    def refs(ring_coords):
        out = []
        cs = list(ring_coords)
        for a, b in zip(cs, cs[1:]):
            w = wid(a, b)
            if w is None:
                continue
            out.append({'wallId': w['id'], 'direction': 1 if w['start'] == pid(*a) else -1})
        return out

    exterior_poly = unary_union([f for _, f, kind, _ in regions if kind != 'floor'])
    if isinstance(exterior_poly, MultiPolygon):
        exterior_poly = max(exterior_poly.geoms, key=lambda g: g.area)
    exterior_ring = orient(Polygon(exterior_poly.exterior), 1.0).exterior
    exterior_refs = refs(exterior_ring.coords)
    for r in exterior_refs:
        next(w for w in wall_list if w['id'] == r['wallId'])['exterior'] = True

    rooms_out = []
    for i, f, kind, info in regions:
        if kind in ('wall', 'floor'):
            continue
        fo = orient(f, 1.0)  # внешнее кольцо — положительная площадь, дыры — отрицательная
        c = f.centroid
        label = None
        if info is not None and not info.get('hidden'):
            label = {'x': round(info['x'], 2), 'y': round(info['y'], 2), 'angle': info['angle'], 'glyph': round(fs_units * 0.72, 2), 'text': info['text']}
        rooms_out.append({
            'id': f'r{len(rooms_out) + 1}',
            'cls': 'mid' if kind == 'room' else 'white',
            'kind': kind,
            'type': types.get(i),
            'code': info['code'] if info else None,
            'area': round(f.area, 1),
            'centroid': {'x': round(c.x, 2), 'y': round(c.y, 2)},
            'label': label,
            'boundary': refs(fo.exterior.coords),
            'holes': [refs(h.coords) for h in fo.interiors],
        })

    # внешний штрих — тот, у которого больше всего длины на внешнем контуре
    ext_line = LineString(exterior_ring.coords).buffer(0.05)
    best, best_len = None, 0.0
    for si in range(len(paths)):
        length = sum(LineString(polys[j]).intersection(ext_line).length for j in range(len(polys)) if stroke_of[j] == si)
        if length > best_len:
            best, best_len = si, length
    if best is not None:
        strokes_out[best]['exterior'] = True

    used = {r['wallId'] for room in rooms_out for r in room['boundary'] + [h for hs in room['holes'] for h in hs]} | {r['wallId'] for r in exterior_refs}
    wall_list = [w for w in wall_list if w['id'] in used]
    used_pts = {w['start'] for w in wall_list} | {w['end'] for w in wall_list}
    pt_list = [p for p in pt_list if p['id'] in used_pts]
    for msg in problems:
        print(f'  ✖ {floor_id}: {msg}')

    data = {
        'id': floor_id,
        'viewBox': {'x': 0, 'y': 0, 'width': VIEW[0], 'height': VIEW[1]},
        'source': {'svg': f'packages/map-data/plans/{cfg["svg"]}', 'rotate': cfg['rotate'], 'scale': round(k, 5),
                   'viewBox': [viewbox.x, viewbox.y, viewbox.width, viewbox.height]},
        'strokes': strokes_out,
        'points': pt_list,
        'walls': wall_list,
        'rooms': rooms_out,
        'exterior': exterior_refs,
        'doors': [],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{floor_id}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    n_room = sum(1 for r in rooms_out if r['kind'] == 'room')
    n_corr = sum(1 for r in rooms_out if r['kind'] == 'corridor')
    n_space = sum(1 for r in rooms_out if r['kind'] == 'space')
    n_wall = sum(1 for _, _, kind, _ in regions if kind == 'wall')
    print(f'{floor_id}: штрихов {len(strokes_out)}, ломаных {len(polys)}, точек {len(pt_list)}, стен {len(wall_list)}, '
          f'мостиков {len(b_end)}+{len(b_door)}+{len(b_neck)}; граней {len(faces)} (дыр {holes_total}): помещений {n_room}, '
          f'коридоров {n_corr}, безымянных {n_space}, внутренностей стен {n_wall}; масштаб {k:.4f}')
    qa_render(floor_id, regions, polys, b_end, b_door + b_neck, captions, qa_dir, crop, lines_only)
    if problems:
        sys.exit(1)
    return data


def qa_render(floor_id, regions, polys, b_end, b_door, captions, qa_dir: Path, crop=None, lines_only=False):
    if crop:
        x0, y0, x1, y1 = crop
        S = min(1920 / (x1 - x0), 1200 / (y1 - y0))
        W, H = int((x1 - x0) * S), int((y1 - y0) * S)
    else:
        x0, y0, S = 0, 0, 1.2
        W, H = int(VIEW[0] * S), int(VIEW[1] * S)
    T = lambda x, y: ((x - x0) * S, (y - y0) * S)
    im = Image.new('RGB', (W, H), '#111c29')
    dr = ImageDraw.Draw(im)
    fill = {'room': '#2d6fd6', 'corridor': '#172432', 'space': '#3b4b60', 'wall': '#0d1520', 'floor': '#5a2d2d'}
    if not lines_only:
        for i, f, kind, info in sorted(regions, key=lambda r: -Polygon(r[1].exterior).area):
            dr.polygon([T(x, y) for x, y in f.exterior.coords], fill=fill[kind])
    for j, pts in enumerate(polys):
        dr.line([T(x, y) for x, y in pts], fill='#7fc3e6', width=2)
        if lines_only:
            for e in (pts[0], pts[-1]):
                ex, ey = T(*e)
                dr.ellipse([ex - 4, ey - 4, ex + 4, ey + 4], outline='#ff5050', width=2)
            mx, my = T(*pts[len(pts) // 2])
            dr.text((mx, my), f'L{j}', fill='#ffd166', anchor='mm')
    for b in b_end:
        dr.line([T(x, y) for x, y in b.coords], fill='#ff5050', width=2)
    for b in b_door:
        dr.line([T(x, y) for x, y in b.coords], fill='#ffb648', width=2)
    try:
        font = ImageFont.truetype('arial.ttf', 13)
        big = ImageFont.truetype('arial.ttf', 17)
    except OSError:
        font = big = ImageFont.load_default()
    for i, f, kind, info in regions:
        if kind in ('wall', 'floor') or lines_only:
            continue
        p = polylabel(f, 0.5)
        tx, ty = T(p.x, p.y)
        dr.text((tx, ty), f'#{i}', fill='#ffd166', font=font, anchor='mm')
        dr.text((tx, ty + 14), f'{int(f.centroid.x)},{int(f.centroid.y)}', fill='#9fb3c8', font=font, anchor='mm')
    for code, text, (x, y), angle in captions:
        tx, ty = T(x, y)
        dr.text((tx, ty - 16), text, fill='white', font=big, anchor='mm')
    qa_dir.mkdir(parents=True, exist_ok=True)
    im.save(qa_dir / f'{floor_id}-qa{"-crop" if crop else ""}.png')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('floor', nargs='?', choices=list(FLOORS))
    ap.add_argument('--qa', type=Path, default=HERE / 'traced')
    ap.add_argument('--crop', type=float, nargs=4, metavar=('X0', 'Y0', 'X1', 'Y1'))
    ap.add_argument('--dump-face', type=float, nargs=2, metavar=('X', 'Y'), help='сохранить WKT грани, содержащей точку')
    ap.add_argument('--debug', action='store_true')
    ap.add_argument('--lines', action='store_true', help='QA: только штрихи, их концы и мостики')
    a = ap.parse_args()
    DEBUG = a.debug
    DEBUG_DIR = a.qa
    for fid in ([a.floor] if a.floor else list(FLOORS)):
        build(fid, a.qa, a.crop, a.dump_face, a.lines)
