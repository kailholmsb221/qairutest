# Deploy

Portfolio production = **web on Vercel** + **api + Postgres on Fly.io**. SSE is not terminated by Vercel:
the browser talks to the API host directly (`NEXT_PUBLIC_API_URL`), so the API's `CORS_ORIGINS` must list
the Vercel domain.

## API (Fly.io)

```bash
fly launch --config infra/deploy/fly.api.toml --no-deploy      # creates the app
fly postgres create --name campuslive-pg                        # managed Postgres
fly postgres attach campuslive-pg --app campuslive-api          # sets DATABASE_URL
fly secrets set ADMIN_API_KEY=$(openssl rand -hex 16) CORS_ORIGINS=https://campuslive.vercel.app --app campuslive-api
fly deploy --config infra/deploy/fly.api.toml
curl https://campuslive-api.fly.dev/readyz
```

`SEED_ON_START=true` seeds the demo data set on the first boot (only when the database is empty).
For a permanent "Tuesday 10:47" demo set `CLOCK_MODE=fixed` and `CLOCK_FIXED_AT=2026-09-15T10:47:00+05:00`.

## Web (Vercel)

Project root: `apps/web` (monorepo; Vercel detects pnpm workspaces). Environment variables:

| name | value |
|---|---|
| `API_URL` | `https://campuslive-api.fly.dev` (server-side fetches) |
| `NEXT_PUBLIC_API_URL` | `https://campuslive-api.fly.dev` (browser fetches + EventSource) |
| `NEXT_PUBLIC_ADMIN_API_KEY` | the demo admin key (only for the public demo; omit to hide the admin panel) |

`vercel --prod` from `apps/web`, or connect the repository and let Vercel build on push.

## Docker Compose (self-hosted)

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml --profile full up --build
open https://localhost:8443
```
