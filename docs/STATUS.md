# CampusLive — статус

> Обновляется в конце каждой фазы. Продолжать сессию: «Continue CampusLive from the phase noted in docs/STATUS.md».

Последнее обновление: 2026-09-15.

## Решения, принятые при старте (отличия от docs/ARCHITECTURE.md)

| Что | Как сделано | Почему |
|---|---|---|
| Программа помещений | **Реальные 2 этажа** из ручной оцифровки (`packages/map-data/vector`), а не Приложение A и не 4 этажа | Карта уже оцифрована по настоящим планам; её дизайн финальный и не меняется |
| Коды аудиторий | `packages/map-data/room-codes.json` (14 расписуемых: 100–107, 201, 202, 221, 222, 224, AI-LAB); дубли получают суффикс (102A, 226A); остальные — `code = id` карты | Единственное место, где придумываются коды; подписи на карте не трогаются. Список ждёт подтверждения пользователя — правится в одном файле + `pnpm map:build` |
| Крылья | enum `west \| east \| core` вместо `north \| south \| core` | Реальный план — ландшафтный (ядра сверху, дуга фасада снизу), крылья слева/справа от центрального холла (x 700–900) |
| Источник геометрии | `vector/*.json` → `scripts/vector2map.ts` → `vector-map.json` (что рисуем) + `building-a.json` (идентичность) | SVG-трассировка не нужна: планы уже в топологической модели редактора; svg2map заменён на vector2map |
| Палитра | Токены = палитра карты (`#0d1520`, cyan `#4fd1ff`, статусы green/orange/yellow/blue), не fallback-токены промта | Один цвет — одно значение и на карте, и на табло; карта неприкосновенна |
| RoomShape | `<path data-phase>` + CSS-переходы вместо `motion.path` | 300 путей; CSS дешевле и не меняет рендер редактора |
| Zoom/pan | В фокус-виде сохранены колесо + перетаскивание из редактора | Ландшафтный план 1600×1000 с мелкими подписями |
| Зазор этажей | `max(72px, 0.32 × высота слоя)` | При 72px два больших ландшафтных этажа перекрываются |
| Порты по умолчанию | api 8090, postgres 5434, web dev 3000/3100, compose-проект `campuslive-map` | На машине разработчика 8080/5432 заняты другим стеком |
| Пакет `internal/service` | Добавлен (кэш каталога + снимка, admin use-cases) | §8.1 архитектуры описывает `service.Board`, но дерева для него не было |
| `Snapshot.announcements`, `DayTimeline.slots`, `TimeInfo.localDate/weekNumber/parity` | Добавлены в контракт | Тикер получает объявления при подключении; шкала времени знает слоты; шапка показывает неделю/чётность |

## Фазы

| # | Фаза | Статус | Проверки |
|---|---|---|---|
| 0 | Скелет: pnpm + Turbo, Next.js 15, Go-модуль, Compose, Caddy, CI, CLAUDE.md, openapi.yaml | ✅ | `pnpm install`, `/healthz` 200 |
| 1 | Данные: миграции goose, sqlc, `vector2map`, seed (42) | ✅ | `pnpm map:build` (151 помещения, 14 с расписанием), `pnpm seed` (40 преподавателей, 30 групп, 50 курсов, 10 слотов, 424 пары, 81 override) |
| 2 | Движок + часы | ✅ | `go test ./internal/engine` — 97.9 % покрытия, golden-фикстуры (`testdata/golden`), полный день переходов, полночь |
| 3 | REST API + контрактные тесты + ETag | ✅ | `go test ./internal/httpapi` (testcontainers + kin-openapi): каждый ответ валидируется по openapi.yaml; `board?at=` для любого времени |
| 4 | Realtime: broker, scheduler, `/events`, admin | ✅ | тест: snapshot после `POST /admin/overrides` приходит < 1 с; heartbeat; медленный клиент отбрасывается |
| 5 | Экран: layout, Header, LiveClock, Board (autofit + pager + split-flap), pills, Ticker, connection, i18n ru/kk/en | ✅ | Playwright: нет скролла на 1280×720 / 1920×1080 / 2560×1440 / 3840×2160; пагинация; SSE обновляет строки |
| 6 | Карта: Scene, FloorLayer, Slab, FloorPlan, RoomShape, exploded/focus, tooltip, RoomDetailPanel | ✅ | фокус-вид пиксельно повторяет редактор; 2.5D-стопка; e2e: фокус, клик, панель, клавиатура |
| 7 | Интерактив: SearchPalette, highlight, фильтры, TimeTravelBar, клавиатура, reduced-motion | ✅ | e2e: поиск группы подсвечивает аудиторию и фильтрует табло; travel переносит строку NEXT → NOW; reduced-motion отключает параллакс |
| 8 | Kiosk + демо: `/kiosk`, DemoAdminPanel, `pnpm demo`, `pnpm demo:script` | ✅ | e2e: киоск листает страницы и этажи; сценарий 90 с через admin API |
| 9 | Полировка: Lighthouse, a11y, пустые/after-hours/error состояния, README, деплой | 🟡 | README + `infra/deploy` (Fly.io + Vercel) готовы; состояния реализованы; **Lighthouse не прогонялся** (нет публичного URL, локально — см. «Что дальше») |

## Quality gates (локально, 2026-09-15)

- Go: `go vet ./...` ✅, `go test ./...` ✅ (engine 97.9 %, realtime 91.8 %, httpapi интеграционные + контрактные). **`-race` недоступен на windows/386** — гоняется в CI (ubuntu).
- Web: `pnpm lint` ✅, `pnpm typecheck` ✅, `vitest` 47 тестов ✅, `next build` ✅ (First Load JS главного маршрута 247 KB < 300 KB).
- Playwright (CLOCK_MODE=fixed 2026-09-15 10:47): 15 сценариев + 2 визуальных снимка (`apps/web/e2e/*.spec.ts-snapshots`).
- Артефакты: `pnpm --filter @campuslive/map-data check`, `pnpm --filter @campuslive/contracts check`, `go generate` diff — в CI.

## Известные ограничения

- Коды комнат в `room-codes.json` — предложение; после списка от владельца достаточно поправить файл и `pnpm map:build`.
- `golangci-lint` не установлен локально — запускается только в CI.
- Chrome performance trace 60 fps для фокуса этажа не прикладывался (нет headed-браузера в сессии); анимируются только `transform`/`opacity`, фильтры — один `drop-shadow` на группу внешних стен и один `feGaussianBlur` на контур этажа.
- Прод-сборка Next с `output: standalone` включается переменной `NEXT_STANDALONE=1` (Docker/CI): на Windows без developer mode pnpm-симлинки не создаются.

## Что дальше

1. Подтвердить/заменить коды в `packages/map-data/room-codes.json` → `pnpm map:build` → `pnpm seed`.
2. Lighthouse: `pnpm --filter @campuslive/web build && pnpm --filter @campuslive/web start` → `npx lighthouse http://localhost:3000 --preset=desktop`.
3. Публичный демо-URL: `infra/deploy/README.md` (Fly.io + Vercel), затем вписать ссылку в README.
4. Записать 90-секундное демо: `pnpm demo` + `pnpm demo:script`.
