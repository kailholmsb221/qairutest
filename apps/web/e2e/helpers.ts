import { expect, type Page } from '@playwright/test';

export const API = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:8090';
export const ADMIN_KEY = process.env.ADMIN_API_KEY ?? process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? 'dev-admin-key';

/** The fixed demo instant: Tuesday 2026-09-15 10:47 Asia/Almaty (see CLOCK_FIXED_AT). */
export const FIXED_DATE = '2026-09-15';

export async function openBoard(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByTestId('shell')).toBeVisible();
  await expect(page.getByTestId('board-now')).toBeAttached();
  // the live SSE connection is up when the dot says so
  await expect(page.getByTestId('connection')).toHaveAttribute('data-state', 'online', { timeout: 30_000 });
}

/** Waits until an element stops moving (spring animations) and returns its box. */
export async function settledBox(page: Page, locator: ReturnType<Page['locator']>) {
  let prev = await locator.boundingBox();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const cur = await locator.boundingBox();
    if (prev && cur && Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5 && Math.abs(prev.width - cur.width) < 0.5) return cur;
    prev = cur;
  }
  return prev!;
}

export async function noScroll(page: Page) {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sh, 'page must not scroll vertically').toBe(m.ch);
  expect(m.sw, 'page must not scroll horizontally').toBe(m.cw);
}

export async function boardJson(): Promise<{ now: Row[]; next: Row[] }> {
  const res = await fetch(`${API}/api/v1/buildings/A/board`);
  return (await res.json()) as { now: Row[]; next: Row[] };
}

export interface Row {
  sessionId: string;
  lessonId: string | null;
  roomCode: string;
  courseCode: string;
  groups: string[];
  status: string;
  phase: string;
  startAt: string;
}

export async function adminPost(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': ADMIN_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
}

export async function adminDelete(path: string) {
  const res = await fetch(`${API}${path}`, { method: 'DELETE', headers: { 'X-Api-Key': ADMIN_KEY } });
  if (!res.ok && res.status !== 404) throw new Error(`${path} → ${res.status}`);
}
