# CampusLive
Single-screen realtime "airport board" + 2.5D map of a university building. Read docs/ARCHITECTURE.md before changing anything.
## Commands
pnpm dev · pnpm map:build · pnpm seed · pnpm test · pnpm e2e · pnpm demo · pnpm demo:script
## Rules
- Status/phase logic lives ONLY in services/api/internal/engine (pure Go). Frontend derives progress/countdown from timestamps only.
- All server time comes from internal/clock. Never call time.Now() elsewhere.
- API types are generated from packages/contracts/openapi.yaml (oapi-codegen, openapi-typescript). Never hand-write DTOs.
- Room identity (codes, names, types) comes only from packages/map-data/building-a.json; what the screen draws comes only from packages/map-data/vector-map.json. Both are built from packages/map-data/vector/ + room-codes.json by `pnpm map:build`. Never hard-code coordinates.
- The building is REAL and has two floors: docs/BUILDING.md (generated) is the authoritative room programme. Never invent a room code — codes come from packages/map-data/room-codes.json.
- The map's visual design (apps/map-editor and the ported renderer in apps/web/components/map) is final: walls, doors, labels, palette stay as they are. 2.5D adds the scene around it, not changes inside it.
- The page never scrolls. Animate transform/opacity only. Respect prefers-reduced-motion.
- Every phase ends with green quality gates and an updated docs/STATUS.md.

## Repo map
`apps/web` — Next.js 15 App Router UI (board, 2.5D map, overlays). `apps/map-editor` — the Vite editor used to hand-digitise the floor plans (source of packages/map-data/vector). `services/api` — Go service (`cmd/api`, `cmd/seed`, `internal/{domain,engine,schedule,repo,httpapi,realtime,scheduler,clock,config,seed}`, goose `migrations/`). `packages/contracts` — `openapi.yaml` + committed `src/types.gen.ts` (openapi-typescript); Go types go to `services/api/internal/httpapi/gen.go` (oapi-codegen). `packages/map-data` — `vector/floor-{1,2}.json` + `room-codes.json` → `scripts/vector2map.ts` → `building-a.json` (identity, read by web and seed) and `vector-map.json` (presentation geometry, read by web). `infra` — docker-compose, Caddyfile, `.env.example`, demo scripts. `docs` — ARCHITECTURE.md, BUILDING.md, STATUS.md, prompts.
