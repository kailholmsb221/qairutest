#!/usr/bin/env node
/**
 * `pnpm demo:script` — a 90-second scripted demo over the admin API while the screen is recording:
 *   t+0s   announcement "Демо началось"
 *   t+15s  cancel a session from NEXT
 *   t+40s  move another session to a free room
 *   t+60s  delay a third one by 15 minutes
 *   t+80s  warning announcement
 *   t+90s  done — overrides are removed again unless --keep is passed
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8090'}`;
const KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const keep = process.argv.includes('--keep');
const fast = process.argv.includes('--fast'); // 9 seconds instead of 90 (tests)
const T = (s) => (fast ? s * 100 : s * 1000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok && res.status !== 204) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const log = (msg) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);

const board = await (await fetch(`${API}/api/v1/buildings/A/board`)).json();
const date = board.date;
const candidates = board.next.filter((s) => s.status === 'scheduled' && s.lessonId);
if (candidates.length < 3) {
  console.error('need at least three scheduled sessions in NEXT — run `pnpm demo` (Tuesday 10:47) first');
  process.exit(1);
}
const [toCancel, toMove, toDelay] = candidates;
const busyRooms = new Set([...board.now, ...board.next].map((s) => s.roomCode));
const freeRoom = board.rooms.find((r) => r.phase === 'free' && !busyRooms.has(r.roomCode))?.roomCode ?? board.rooms.find((r) => r.roomCode !== toMove.roomCode)?.roomCode;
const created = [];

log('📣 announcement');
await call('POST', '/api/v1/admin/announcements', { text: 'Демо CampusLive: следите за табло — сейчас всё изменится', severity: 'info', durationMinutes: 5 });
await sleep(T(15));

log(`✕ cancel ${toCancel.roomCode} ${toCancel.courseCode} ${toCancel.courseTitle}`);
created.push(await call('POST', '/api/v1/admin/overrides', { kind: 'cancel', date, lessonId: toCancel.lessonId, note: 'Демо: преподаватель на конференции' }));
await sleep(T(25));

log(`→ move ${toMove.roomCode} ${toMove.courseCode} → ${freeRoom}`);
created.push(await call('POST', '/api/v1/admin/overrides', { kind: 'move', date, lessonId: toMove.lessonId, newRoomCode: freeRoom, note: 'Демо: ремонт проектора' }));
await sleep(T(20));

log(`⏱ delay ${toDelay.roomCode} ${toDelay.courseCode} +15`);
created.push(await call('POST', '/api/v1/admin/overrides', { kind: 'delay', date, lessonId: toDelay.lessonId, delayMinutes: 15, note: 'Демо: преподаватель в пути' }));
await sleep(T(20));

log('📣 warning announcement');
await call('POST', '/api/v1/admin/announcements', { text: 'Внимание: в 12:00 учебная пожарная тревога, аудитории освободить за 5 минут', severity: 'warning', durationMinutes: 10 });
await sleep(T(10));

if (!keep) {
  log('↶ cleaning up overrides');
  for (const o of created) await call('DELETE', `/api/v1/admin/overrides/${o.id}`);
}
log('✔ demo script finished');
