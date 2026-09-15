#!/usr/bin/env node
/**
 * `pnpm demo` — start the whole stack so that "now" is Tuesday 10:47 (building time):
 *   1. postgres via docker compose (infra/docker-compose.yml, project campuslive-map)
 *   2. seed (Go)
 *   3. api with CLOCK_MODE=offset so the clock reads next/last Tuesday 10:47 Asia/Almaty
 *   4. web (production build if present, otherwise next dev) on WEB_PORT (default 3100)
 * Ctrl+C stops api and web; postgres keeps running (`pnpm db:down` removes it).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api = path.join(root, 'services/api');
const web = path.join(root, 'apps/web');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';

const API_PORT = process.env.API_PORT ?? '8090';
const WEB_PORT = process.env.WEB_PORT ?? '3100';
const DB_PORT = process.env.POSTGRES_PORT ?? '5434';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const DATABASE_URL = process.env.DATABASE_URL ?? `postgres://campuslive:campuslive@localhost:${DB_PORT}/campuslive?sslmode=disable`;

/** Offset so that now == the nearest Tuesday 10:47 Asia/Almaty (today if it is Tuesday). */
export function demoOffset(now = new Date()) {
  const tz = 'Asia/Almaty';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const daysToTue = (2 - wd + 7) % 7; // 0 when Tuesday
  // local midnight today in Almaty = UTC midnight - 5h
  const todayUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
  const target = todayUtc + daysToTue * 86_400_000 + (10 * 60 + 47) * 60_000 - 5 * 3_600_000;
  const delta = target - now.getTime();
  const sign = delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return `${sign}${h}h${m}m${s}s`;
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) {
    console.error(`✖ ${cmd} ${args.join(' ')} failed`);
    process.exit(r.status ?? 1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  console.log('▶ postgres (docker compose)');
  run('docker', ['compose', '-f', path.join(root, 'infra/docker-compose.yml'), 'up', '-d', 'postgres']);

  console.log('▶ seed');
  const offset = demoOffset();
  const env = { ...process.env, DATABASE_URL, CLOCK_MODE: 'offset', CLOCK_OFFSET: offset, ADMIN_API_KEY: ADMIN_KEY, PORT: API_PORT, CORS_ORIGINS: `http://localhost:${WEB_PORT},http://localhost:3000` };
  for (let i = 0; i < 10; i++) {
    const r = spawnSync('go', ['run', './cmd/seed'], { cwd: api, stdio: 'inherit', shell: isWin, env });
    if (r.status === 0) break;
    if (i === 9) process.exit(1);
    console.log('  waiting for postgres…');
    spawnSync(isWin ? 'timeout' : 'sleep', isWin ? ['/t', '2'] : ['2'], { shell: isWin });
  }

  console.log(`▶ api  http://localhost:${API_PORT}  (CLOCK_MODE=offset ${offset} → Tuesday 10:47)`);
  const apiProc = spawn('go', ['run', './cmd/api'], { cwd: api, stdio: 'inherit', shell: isWin, env });

  const built = existsSync(path.join(web, '.next/BUILD_ID'));
  console.log(`▶ web  http://localhost:${WEB_PORT}  (${built ? 'production build' : 'next dev'})`);
  const webProc = spawn(pnpm, [built ? 'start' : 'dev'], {
    cwd: web,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, PORT: WEB_PORT, API_URL: `http://localhost:${API_PORT}`, NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`, NEXT_PUBLIC_ADMIN_API_KEY: ADMIN_KEY },
  });

  const stop = () => {
    apiProc.kill();
    webProc.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
