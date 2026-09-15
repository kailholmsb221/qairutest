# CampusLive — Build Prompt for Claude Code

> How to use: put `docs/ARCHITECTURE.md` (the architecture document), the two floor-plan photos (`packages/map-data/reference/floor-1.png`, `floor-2.png`) and, if you have them, the Claude Design exports (`docs/design/`) into an empty repo. Then paste everything below this line as the first message to Claude Code. Work phase by phase; start each new session with "Continue CampusLive from the phase noted in `docs/STATUS.md`".

---

## Role and mission

You are the lead full-stack engineer on **CampusLive**: a real-time, single-screen "airport departures board" for a university building, paired with an interactive 2.5D map of the building. One glance at the screen answers: which classes are running right now, in which rooms, taught by whom, and what starts next. Status changes propagate live to every open screen the second a lesson starts or ends.

This is a portfolio-grade product, not a prototype. It must look and feel finished: smooth 60 fps animations, zero page scroll, deterministic demo mode, tests at every layer, one command to run everything.

## Read first, in this order

1. `docs/ARCHITECTURE.md` — the architecture is **decided**. Follow it. If you believe a decision is wrong, say so in one paragraph with a concrete reason and wait for approval before deviating.
2. `packages/map-data/reference/*.png` — photos of the real floor plans (floors 1 and 2). The building silhouette, wings, central hall and the two vertical cores come from these photos. **Room contents are invented** and fixed in `ARCHITECTURE.md`, Appendix A.
3. `docs/design/` — if present: screens, tokens (`tokens.css`) and SVG floor plans exported from Claude Design. Treat them as the visual source of truth. If absent, use the fallback tokens at the end of this prompt and author the floor SVGs yourself.

## Hard requirements (non-negotiable)

- **One screen, no scrolling.** At 1280×720, 1920×1080, 2560×1440 and 3840×2160 `document.documentElement.scrollHeight === clientHeight`. The board fits rows to available height and paginates like an airport board; it never scrolls. Write a Playwright test for this at all four sizes.
- **Live within 1 s.** When a lesson crosses a boundary (starting-soon / start / ending / end) or an admin override is posted, every connected client shows the new state in under one second, without reloading.
- **Server is the only source of truth for status.** The Go engine computes phases; the frontend only derives progress percentages and countdowns from timestamps. Do not reimplement phase logic in TypeScript.
- **Deterministic time.** All server time flows through the `Clock` interface (`real` / `fixed` / `offset`). E2E tests and screenshots run with `CLOCK_MODE=fixed`.
- **Real building shape.** The map silhouette must match the reference photos: straight east façade, one continuous convex west façade, a large-radius sweep at the north-west corner, a large-radius south-west corner, small radii at the north-east and south-east corners, a central east–west hall with entrances on both ends, a vertical strip of cores on the east side (stairs SF-1 + elevators in the north core, stairs SF-2 + elevator P-1 in the south core). Floor 2 has an atrium void over the lobby with a bridge, and a double-height void over the Skywalkers lab. Photo of floor 2 is upside-down; rotate it 180° to the canonical orientation.
- **Motion budget.** Animate only `transform` and `opacity`. No `filter: blur/drop-shadow` on more than ~10 elements at once; glow is a second stroked path. Respect `prefers-reduced-motion`.
- **Accessibility.** Rooms are keyboard-focusable with `aria-label`; the board is a semantic table; status colours have ≥ 4.5:1 contrast on the dark background; status is never conveyed by colour alone (text or icon always accompanies it).
- **Type safety end-to-end.** `packages/contracts/openapi.yaml` is the contract. Go server types via `oapi-codegen` (strict server), TS types via `openapi-typescript`. Never hand-write a DTO on either side.

## Stack (pinned — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router, React Server Components), TypeScript 5, Tailwind CSS v4, shadcn/ui (only Dialog, Command, Tooltip, Popover), Framer Motion (`motion` package), Zustand, TanStack Query, `next-intl` (ru / kk / en), Vitest + Testing Library, Playwright |
| Backend | Go 1.23+, `chi`, `pgx/v5` + `sqlc`, `goose` migrations, `oapi-codegen`, `slog`, `testcontainers-go`, `kin-openapi` for contract tests |
| Realtime | Server-Sent Events. Own broker in `internal/realtime`, one hub per building, full `snapshot` on every change, `heartbeat` every 25 s |
| Database | PostgreSQL 16 |
| Monorepo | pnpm workspaces + Turborepo (`apps/web`, `services/api`, `packages/contracts`, `packages/map-data`, `infra`, `docs`) |
| Infra | Docker Compose (postgres, api, web, caddy), GitHub Actions CI |

## Repository layout

Create exactly the tree in `ARCHITECTURE.md` §4. Key rules:

- `packages/map-data/svg/floor-{1..4}.svg` are the source of truth for geometry. `pnpm map:build` runs `scripts/svg2map.ts` → `building-a.json`. Both the web app and the Go seed read `building-a.json`; nothing else may hard-code room geometry.
- `services/api/internal/engine` has **no I/O** — pure functions over domain structs.
- `apps/web/features/*` hold hooks and selectors; `apps/web/components/*` are presentational and receive data via props or narrow store selectors.
- Add `CLAUDE.md` at repo root (content below) and `docs/STATUS.md` that you update at the end of every phase (what is done, what is next, known issues).

## Domain and engine (summary — full spec in ARCHITECTURE.md §5–§7)

- Building `A` "Main Academic Building", timezone `Asia/Almaty`, 4 floors. Room codes are three-digit (`101`, `213`), service spaces use prefixes (`WC-N1`, `CORE-S2`, `LOBBY`, `ATRIUM`). Each room has `type` (lecture | seminar | lab | coworking | admin | service | void), `wing` (north | south | core), `schedulable` (bool), `capacity`, `geometry` (SVG path + bbox + label anchor).
- Schedule = recurring `lessons` (semester, course, teacher, room, weekday, slot, parity all|odd|even, type) + `session_overrides` per date (cancel | move | delay | reassign_teacher | extra). A concrete day is **materialised on the fly** by `engine.BuildDayTimeline`; sessions are not stored.
- `engine.ComputeSnapshot(sessions, now, thresholds)` returns `Snapshot{ rooms[], now[], next[], stats, nextTransitionAt }`. Phases: `upcoming → soon (10 min before) → live → ending (last 5 min) → done`; `cancelled` sessions appear on the board in their slot but do not occupy the room. `NEXT` horizon = 90 min. Room phase = phase of the owning session with priority live/ending > soon > free. Overlapping sessions in one room → both flagged `conflict=true`, earliest start wins the room.
- `nextTransitionAt` drives the scheduler: sleep until the next boundary (max 5 min), rebuild, broadcast. Admin overrides poke an `invalidate` channel for an immediate rebuild.
- Time slots for the demo: 10 lessons of 50 min with 10-min breaks, 08:00–17:50. Store slots as local time-of-day per building; all absolute timestamps are UTC `timestamptz`.

## API (summary — full contract in `packages/contracts/openapi.yaml`, which you author in Phase 0)

```
GET  /api/v1/buildings
GET  /api/v1/buildings/{code}/map
GET  /api/v1/buildings/{code}/board?at=&date=
GET  /api/v1/buildings/{code}/timeline?date=
GET  /api/v1/rooms/{code}/day?date=
GET  /api/v1/teachers/{id}/day?date=
GET  /api/v1/groups/{code}/day?date=
GET  /api/v1/search?q=
GET  /api/v1/events?building=            (SSE: snapshot | announcement | heartbeat)
GET  /api/v1/time
POST /api/v1/admin/overrides             (X-Api-Key)
DELETE /api/v1/admin/overrides/{id}
POST /api/v1/admin/announcements
GET  /healthz  /readyz
```

Error envelope: `{ "error": { "code": "not_found", "message": "…" } }`. `/map` and `/board` send `ETag`.

## Frontend specification

### Screen anatomy (1920×1080 reference; use `clamp()` and CSS grid so it holds from 1280×720 to 4K)

```
grid-template-rows:    64px 1fr 40px;      /* header · main · ticker */
grid-template-columns: minmax(0,1fr) 560px; /* map stage · board */
gap: 16px; padding: 16px; height: 100dvh; overflow: hidden;
```

- **Header**: building name + logo mark · **LiveClock** (large mono `HH:MM:SS`, date, week number + parity) · **FloorTabs** (All · 1 · 2 · 3 · 4, each tab shows a small busy-count badge) · search trigger (⌘K) · locale switch RU/KZ/EN · theme toggle · kiosk button. In time-travel mode the clock shows the simulated time with a `SIMULATED` tag.
- **Map stage** (left): the 2.5D `Scene`; legend bottom-left; stats chip top-right ("28 / 41 rooms busy"); **TimeTravelBar** collapsed to a 4 px line at the bottom that expands on hover into a day timeline with slot ticks and an occupancy heat strip.
- **Board** (right): two sections, `NOW` (sorted by end time) and `NEXT` (sorted by start time). Row = `time · room · course code + title · teacher · groups · status pill`. `useAutoFitRows` measures the container and computes rows per page; `usePager` rotates pages every 8 s when overflowing, paused while hovered. Section headers show counts ("NOW · 28", "NEXT · within 90 min"). Page indicator dots.
- **Ticker** (bottom): announcements + auto-generated lines ("213 · Databases starts in 4 min · Akhmetov D."), connection dot (green live / amber reconnecting / red offline), app version.
- **Overlays**: `RoomDetailPanel` (420 px glass card sliding over the board column: room name, type, capacity, current session with progress bar and teacher card, next 3 sessions today, "show on map" button), `SearchPalette` (⌘K: teachers, groups, rooms, courses — selecting one highlights matching rooms on the map and filters the board), `DemoAdminPanel` (hidden behind a small button in the ticker: cancel / move / delay a session, post an announcement; calls the admin API).
- Below 1024 px width the map and board become tabs; the page still never scrolls.

### The 2.5D map

- `Scene`: `motion.div` with `perspective: 2200px`; `rotateX` / `rotateZ` are `useSpring` motion values. Default **exploded** view: `rotateX(58deg) rotateZ(-38deg)`, floors stacked with `translateZ(i × 72px)`. **Focus** view (click a floor tab or a floor slab): `rotateX(0) rotateZ(0)`, focused floor `scale(1.12)` on top, others fade to `opacity .06` and move away on Z. Spring: `{ stiffness: 120, damping: 18 }`.
- `FloorLayer` renders one `<svg viewBox="0 0 600 1000">` per floor from `building-a.json`: `Slab` (outline drawn twice, lower copy offset +6 px and darker → visible thickness, plus a 1 px lighter top edge), `FloorPlan` (zones at 4–6 % tint, walls, corridors, cores with stair/elevator glyphs, entrances, atrium void with railing) — memoised, never re-renders on ticks.
- `RoomShape`: `<motion.path data-phase data-type>` with fill through CSS variables; `role="button"`, `tabIndex=0`, `aria-label="Room 213, Lecture Hall Gamma, live: Databases until 10:50"`. Hover → `Tooltip`; click → select. In exploded view rooms show only tint + a pulsing 6 px dot for `live`; in focus view `RoomChip` (room code + course code + countdown) appears over each schedulable room.
- Phases → visuals: `free` dim; `soon` amber at 35 % with 1 Hz opacity blink; `live` teal at 45 % with pulsing dot and glow (glow only in focus view); `ending` orange at 45 % with a progress arc in the chip; `conflict` hatched pattern + warning glyph; `void` rooms drawn as an opening with a railing, never coloured.
- Parallax: pointer movement over the stage tilts the scene ±2.5° through `useSpring({ stiffness: 60, damping: 20 })`. Off in kiosk mode and under `prefers-reduced-motion`.
- Search highlight: matched rooms get an accent stroke + badge; others drop to `opacity .35`; the board filters to the same sessions; clearing the search restores everything with a 300 ms crossfade.

### Board animations

- Row enter/exit/move with Framer `layout` + `AnimatePresence mode="popLayout"`; a session moving from `NEXT` to `NOW` uses a shared `layoutId` so it visibly slides between sections.
- `SplitFlap` component: fixed-width character cells; on value change each cell plays a two-half `rotateX` flip (90 ms per half) with `index × 25 ms` stagger. Use it for the time, room and status columns only. Cap simultaneous flipping cells at 40; beyond that fall back to fade.
- Status pills: `LIVE`, `STARTS 09:00`, `ENDS 5 MIN`, `CANCELLED`, `MOVED → 214`, `DELAYED +15`. Pill text is translated; colour tokens are shared with the map.

### Data flow

- `app/(main)/page.tsx` is a Server Component: fetches `/map` and `/board` on the server, passes them to `<CampusLiveApp>` so the first paint already shows live data.
- `useRealtime()` opens `EventSource(/api/v1/events?building=A)`; `snapshot` events go to `boardStore.setSnapshot(s, 'sse')`. After a reconnect, refetch `/board` once. 30 s without `heartbeat` → `connection = 'reconnecting'`.
- `useNow()` ticks once per second; only components that display countdowns or progress subscribe to it. Verify with React Profiler that a tick re-renders < 60 components.
- `useTimeTravel()`: dragging the bar sets `travelAt` (debounced 120 ms) → `GET /board?at=` → `boardStore.setSnapshot(s, 'rest')` with `mode = 'travel'`; SSE snapshots are ignored while in travel mode; `LIVE` button returns to live and re-applies the last SSE snapshot.

## Demo data and clock

- `cmd/seed` (deterministic, seed 42) creates building `A`, four floors and all rooms from `building-a.json`, 40 teachers with invented Kazakh and Russian names, 30 groups (`ПО23xx`, `ИС23xx`, `ВТ24xx`, `БДА24xx`, `КБ24xx`…), 50 courses, 10 slots, a semester containing today, ~70 % room occupancy 08:00–18:00 on weekdays, and per day 2 cancellations, 1 move, 1 delay. Placement rules: labs only in `lab` rooms; lectures for 2–4 groups in `lecture` rooms; the Assembly Hall `110` gets one weekly "Open Lecture"; themed labs (Samsung Innovation Lab, Astana Hub Startup Lab, Skywalkers Robotics Lab, Cyber Range Lab, AI & GPU Lab) get courses of their theme.
- `CLOCK_MODE=real|fixed|offset`, `CLOCK_FIXED_AT`, `CLOCK_OFFSET`. `pnpm demo` starts the stack with an offset so that "now" is Tuesday 10:47; `pnpm demo:script` then cancels one session, moves another and posts an announcement over 90 s through the admin API.

## Quality gates (CI must be green before a phase is "done")

- Go: `go vet`, `golangci-lint`, `go test ./...` with race detector; engine package ≥ 95 % coverage with table-driven tests and golden JSON fixtures (phase boundaries, parity, every override kind, conflicts, `nextTransitionAt`, midnight crossing).
- Web: `pnpm lint`, `tsc --noEmit`, `vitest` (progress/countdown derivation, `usePager`, `useAutoFitRows`, store selectors, `SplitFlap`, `BoardRow` states).
- Contract tests: every handler response validated against `openapi.yaml`.
- Playwright (`CLOCK_MODE=fixed`): no page scroll at four viewport sizes; a `NEXT` row moves to `NOW` after advancing the fixed clock; searching a group highlights its room; an admin cancel changes the board without reload; kiosk pages rotate; visual snapshots of the main screen and the focus view.
- Lighthouse on the main route: Performance ≥ 90, Accessibility ≥ 95.

## Working agreement

- Work in phases (below). Before starting a phase, post a short plan (files you will create, decisions you need). After finishing, run all quality gates, update `docs/STATUS.md`, and commit with a conventional message (`feat(engine): …`).
- Ask before: changing the stack, changing the OpenAPI contract after Phase 3, adding a dependency over 50 KB gzip to the web bundle, or deviating from the layout spec.
- Do not ask about: naming, file organisation within the prescribed tree, test structure, colours when tokens exist — decide and move on.
- When the design export and this prompt disagree on visuals, the design export wins; when they disagree on behaviour, this prompt and `ARCHITECTURE.md` win.
- Never leave `TODO` placeholders in shipped UI. Every state (loading, empty, error, reconnecting, after-hours "No classes until tomorrow 08:00") is designed and implemented.

## Phases and definition of done

| # | Phase | Done when |
|---|---|---|
| 0 | Scaffold: pnpm + Turbo, Next.js app, Go module, Compose, Caddyfile, CI, `CLAUDE.md`, `STATUS.md`, `openapi.yaml` v0 with all paths and schemas | `pnpm dev` starts web + api; `/healthz` returns 200; CI green on an empty test suite |
| 1 | Data: goose migrations for the full schema, sqlc queries, `map-data` SVGs for floors 1–4 (trace floors 1–2 from the photos, derive 3–4 as typical floors), `svg2map`, seed | `pnpm map:build && pnpm seed` succeeds; `/map` returns every room in Appendix A with a valid path |
| 2 | Engine + clock with tests | Golden fixtures pass; coverage ≥ 95 %; `NextTransitionAt` verified across a full simulated day |
| 3 | REST API + contract tests + ETag | All endpoints implemented and validated; `board?at=` works for any time of day |
| 4 | Realtime: broker, scheduler, `/events`, admin endpoints | `curl -N /api/v1/events?building=A` shows a new snapshot within 1 s of a `POST /admin/overrides` |
| 5 | Screen shell: layout, Header, LiveClock, Board with auto-fit, pager, SplitFlap, status pills, Ticker, connection state, i18n | No scroll at all four viewports (Playwright); board paginates; SSE updates rows live |
| 6 | Map: Scene, FloorLayer, Slab, FloorPlan, RoomShape, exploded/focus, tooltip, RoomDetailPanel | 60 fps during floor focus (Chrome performance trace attached to STATUS.md); silhouette matches the reference photos |
| 7 | Interaction: SearchPalette, highlight, filters, TimeTravelBar, keyboard navigation, reduced-motion | Playwright interaction scenarios pass |
| 8 | Kiosk + demo: `/kiosk`, DemoAdminPanel, `pnpm demo`, `pnpm demo:script` | A 90-second demo can be recorded without touching the keyboard |
| 9 | Polish: Lighthouse, a11y audit, empty/after-hours/error states, README with screenshots and architecture diagram, deploy config for Vercel + Fly.io | Public demo URL works; README explains how to plug a real schedule source |

## `CLAUDE.md` to create at repo root

```md
# CampusLive
Single-screen realtime "airport board" + 2.5D map of a university building. Read docs/ARCHITECTURE.md before changing anything.
## Commands
pnpm dev · pnpm map:build · pnpm seed · pnpm test · pnpm e2e · pnpm demo · pnpm demo:script
## Rules
- Status/phase logic lives ONLY in services/api/internal/engine (pure Go). Frontend derives progress/countdown from timestamps only.
- All server time comes from internal/clock. Never call time.Now() elsewhere.
- API types are generated from packages/contracts/openapi.yaml (oapi-codegen, openapi-typescript). Never hand-write DTOs.
- Room geometry comes only from packages/map-data/building-a.json (built from svg/). Never hard-code coordinates.
- The page never scrolls. Animate transform/opacity only. Respect prefers-reduced-motion.
- Every phase ends with green quality gates and an updated docs/STATUS.md.
```

## Fallback design tokens (use only if `docs/design/tokens.css` is missing)

```css
:root {
  --bg: #0B0F17;            --bg-elev: #111826;       --panel: rgba(255,255,255,.04);
  --line: rgba(255,255,255,.08);  --text: #E6EAF2;   --text-dim: #8B94A7;
  --accent: #5EEAD4;        /* board headers, focus rings */
  --status-live: #2DD4BF;   --status-soon: #FBBF24;   --status-ending: #FB923C;
  --status-cancelled: #F87171; --status-moved: #A78BFA; --status-delayed: #F59E0B;
  --room-free: rgba(255,255,255,.10);
  --wing-north: rgba(96,165,250,.06); --wing-south: rgba(244,114,182,.06); --wing-core: rgba(134,239,172,.05);
  --slab: #161E2E;          --slab-edge: #0A0E16;     --slab-top: rgba(255,255,255,.12);
  --font-ui: "Manrope", "Inter", system-ui, sans-serif;
  --font-board: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
  --radius: 12px;  --ease-out: cubic-bezier(.16,1,.3,1);
  --dur-fast: 150ms; --dur-base: 300ms; --dur-slow: 600ms;
}
```

Begin with Phase 0. Post your plan for it, then execute.
