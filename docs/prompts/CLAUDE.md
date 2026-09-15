# CampusLive
Single-screen realtime "airport board" + 2.5D map of a university building. Read docs/ARCHITECTURE.md before changing anything.
## Commands
pnpm dev · pnpm map:build · pnpm seed · pnpm test · pnpm e2e · pnpm demo · pnpm demo:script
## Rules
- Status/phase logic lives ONLY in services/api/internal/engine (pure Go). Frontend derives progress/countdown from timestamps only.
- All server time comes from internal/clock. Never call time.Now() elsewhere.
- API types are generated from packages/contracts/openapi.yaml (oapi-codegen, openapi-typescript). Never hand-write DTOs.
- Room identity (codes, names, types) comes only from packages/map-data/building-a.json (built from svg/); what the screen draws comes only from packages/map-data/vector-map.json (built from vector/ by `vector:build`). Never hard-code coordinates.
- The building is REAL and has two floors: docs/BUILDING.md is the authoritative room programme. Never invent a room code.
- The page never scrolls. Animate transform/opacity only. Respect prefers-reduced-motion.
- Every phase ends with green quality gates and an updated docs/STATUS.md.

## Repo map
`apps/web` — Next.js 15 App Router UI (board, 2.5D map, overlays). `services/api` — Go service (`cmd/api`, `cmd/seed`, `internal/{domain,engine,schedule,repo,httpapi,realtime,scheduler,clock,config,seed}`, goose `migrations/`). `packages/contracts` — `openapi.yaml` (single source of truth for the HTTP contract) plus the committed `src/types.gen.ts` produced by `openapi-typescript`; Go types are generated from the same file into `services/api/internal/httpapi/gen.go` by `oapi-codegen`. `packages/map-data` — `svg/floor-{1,2}.svg` (traced from the real plans) → `scripts/svg2map.ts` → committed `building-a.json`, validated against `schema.json`; consumed by both the web app and `cmd/seed`. `vector/floor-{1,2}.json` (the hand-digitised vector plans) → `scripts/vector2map.ts` → committed `vector-map.json`, the presentation geometry the web app draws (`apps/web/lib/vector-map.ts`). `infra` — docker-compose, Caddyfile, `.env.example`, demo scripts. `docs` — ARCHITECTURE.md, STATUS.md, design exports and prompts.
