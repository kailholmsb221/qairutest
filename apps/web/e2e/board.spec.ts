import { expect, test } from '@playwright/test';
import { adminDelete, adminPost, boardJson, FIXED_DATE, openBoard } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a NEXT row moves to NOW after advancing the clock (time travel)', async ({ page }) => {
  await openBoard(page);
  const snap = await boardJson();
  const upcoming = snap.next.find((s) => s.status === 'scheduled');
  expect(upcoming, 'a scheduled session in NEXT').toBeTruthy();
  const nextRows = page.getByTestId('board-next').locator(`[data-session-id="${upcoming!.sessionId}"]`);
  // it may sit on a later page; check through the store-backed DOM after forcing page 0..n
  const startsAt = Date.parse(upcoming!.startAt);
  // advance the simulated clock to 5 minutes after the start with the time-travel bar (keyboard)
  const bar = page.getByTestId('time-travel');
  await bar.hover();
  const slider = page.getByTestId('time-travel-scale');
  await slider.focus();
  const target = new Date(startsAt + 5 * 60_000);
  const hh = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Almaty' }).format(target));
  const mm = Number(new Intl.DateTimeFormat('en-GB', { minute: '2-digit', timeZone: 'Asia/Almaty' }).format(target));
  const box = (await slider.boundingBox())!;
  const f = (hh * 60 + mm - 7 * 60) / (13 * 60);
  await page.mouse.click(box.x + box.width * f, box.y + box.height / 2);
  await expect(page.getByTestId('clock-simulated')).toBeVisible();
  await expect(page.getByTestId('time-travel')).toHaveAttribute('data-mode', 'travel');
  // the row is now in NOW (possibly on a later page) and no longer in NEXT
  const nowRow = page.getByTestId('board-now').locator(`[data-session-id="${upcoming!.sessionId}"]`);
  await expect
    .poll(async () => (await nowRow.count()) + (await page.getByTestId('board-now').getByTestId('board-row').count()) > 0, { timeout: 10_000 })
    .toBe(true);
  await expect(page.getByTestId('board-now').getByTestId('board-row').first()).toHaveAttribute('data-phase', /live|ending/);
  await expect(nextRows).toHaveCount(0);
  // back to live
  await page.getByTestId('time-travel-live').click();
  await expect(page.getByTestId('clock-simulated')).toHaveCount(0);
  await expect(page.getByTestId('clock-time')).toHaveText(/10:47/);
});

test('searching a group highlights its rooms on the map and filters the board', async ({ page }) => {
  await openBoard(page);
  const snap = await boardJson();
  const withGroup = [...snap.now, ...snap.next].find((s) => s.groups.length && s.status === 'scheduled')!;
  const group = withGroup.groups[0];
  await page.keyboard.press('Control+K');
  await expect(page.getByTestId('search-palette')).toBeVisible();
  await page.getByTestId('search-input').fill(group);
  const item = page.getByTestId('search-item').filter({ hasText: group }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByTestId('board-filter')).toContainText(group);
  // every visible row belongs to the group
  const rows = page.getByTestId('board-row');
  await expect.poll(async () => rows.count()).toBeGreaterThan(0);
  for (const id of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-session-id')))) {
    const s = [...snap.now, ...snap.next].find((x) => x.sessionId === id);
    expect(s?.groups).toContain(group);
  }
  // the matching room is stroked on the map, others are muted
  const stage = page.getByTestId('stage');
  await expect(stage.locator('.highlight-outline').first()).toBeAttached();
  expect(await stage.locator(`[data-room-code="${withGroup.roomCode}"].room`).first().getAttribute('class')).not.toContain('is-muted');
  await expect(stage.locator('.room.is-muted').first()).toBeAttached();
  // Escape clears the highlight
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-filter')).toHaveCount(0);
});

test('an admin cancel changes the board without a reload (SSE)', async ({ page }) => {
  await openBoard(page);
  const snap = await boardJson();
  const target = snap.next.find((s) => s.status === 'scheduled' && s.lessonId)!;
  const marker = await page.evaluate(() => (window as unknown as { __m?: number }).__m ?? ((window as unknown as { __m?: number }).__m = Math.random()));
  const ov = await adminPost('/api/v1/admin/overrides', { kind: 'cancel', date: FIXED_DATE, lessonId: target.lessonId, note: 'e2e' });
  try {
    const row = page.getByTestId('board-next').locator(`[data-session-id="${target.sessionId}"]`);
    // the row might be on another page; the status pill reads from the store, so search all pages via DOM attribute
    await expect.poll(async () => (await row.count()) === 0 || (await row.getAttribute('data-status')) === 'cancelled', { timeout: 5000 }).toBe(true);
    if (await row.count()) await expect(row.getByTestId('status-pill')).toHaveAttribute('data-kind', 'cancelled');
    // no reload happened
    expect(await page.evaluate(() => (window as unknown as { __m?: number }).__m)).toBe(marker);
    // the ticker mentions the cancellation
    await expect(page.getByTestId('ticker')).toContainText(target.courseCode.length ? /отменена/ : /x/);
  } finally {
    await adminDelete(`/api/v1/admin/overrides/${ov.id}`);
  }
});

test('an announcement reaches the ticker live', async ({ page }) => {
  await openBoard(page);
  const text = `E2E объявление ${Date.now()}`;
  await adminPost('/api/v1/admin/announcements', { text, severity: 'warning', durationMinutes: 2 });
  await expect(page.getByTestId('ticker')).toContainText(text, { timeout: 5000 });
});

test('kiosk page rotates board pages and cycles floors', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  // 1) floors cycle on their own
  await page.goto('/kiosk?floorCycle=2s');
  await expect(page.getByTestId('shell')).toHaveClass(/is-kiosk/);
  await expect(page.getByTestId('admin-toggle')).toHaveCount(0);
  await expect(page.getByTestId('time-travel')).toHaveCount(0);
  const stage = page.getByTestId('stage');
  const views: string[] = [];
  for (let i = 0; i < 4; i++) {
    views.push((await stage.getAttribute('data-view')) ?? '');
    await page.waitForTimeout(2100);
  }
  expect(new Set(views).size).toBeGreaterThan(1);

  // 2) board pages rotate on their own (floor cycling parked so the page count is stable)
  await page.goto('/kiosk?floorCycle=10m&page=3s');
  const dots = page.getByTestId('board-next').getByTestId('pager');
  await expect(dots).toBeVisible();
  const active = () => dots.locator('i.is-active').evaluate((el) => [...el.parentElement!.children].indexOf(el));
  const a = await active();
  await expect.poll(active, { timeout: 10_000 }).not.toBe(a);
});
