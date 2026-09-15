import { expect, test } from '@playwright/test';
import { openBoard, settledBox } from './helpers';

test('floor tab focuses a floor, room click opens the detail panel, keyboard works', async ({ page }) => {
  await openBoard(page);
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-view', 'exploded');
  await expect(page.getByTestId('floor-layer-1')).toHaveAttribute('data-mode', 'exploded');

  await page.getByTestId('floor-tab-1').click();
  await expect(stage).toHaveAttribute('data-view', 'focus');
  await expect(page.getByTestId('floor-layer-1')).toHaveAttribute('data-mode', 'focus');
  await expect(page.getByTestId('floor-layer-2')).toHaveAttribute('data-mode', 'background');
  // chips appear over schedulable rooms in focus view
  await expect(page.getByTestId('room-chip-101')).toBeAttached();

  // click a room once the focus spring has settled → panel
  const room = page.locator('[data-floor="1"] [data-room-code="101"].room');
  const box = await settledBox(page, room);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('room-panel')).toBeVisible();
  await expect(page.getByTestId('room-panel')).toContainText('101');
  await expect(page.getByTestId('room-panel')).toContainText('Учебный класс');
  // rooms are keyboard focusable buttons with an aria-label
  await expect(room).toHaveAttribute('role', 'button');
  await expect(room).toHaveAttribute('tabindex', '0');
  expect(await room.getAttribute('aria-label')).toMatch(/Аудитория 101/);
  // Escape closes the panel, then leaves focus view
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-panel')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-view', 'exploded');
});

test('hover shows a tooltip; the legend filters by status', async ({ page }) => {
  await openBoard(page);
  await page.getByTestId('floor-tab-2').click();
  const room = page.locator('[data-floor="2"] [data-room-code="201"].room');
  const box = await settledBox(page, room);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('map-tooltip')).toBeVisible();
  await expect(page.getByTestId('map-tooltip')).toContainText('201');
  const legendLive = page.getByTestId('legend').getByRole('button', { name: /Занятие идёт|Заканчивается/ }).first();
  await legendLive.click();
  await expect(page.getByTestId('board-filter')).toBeVisible();
  await legendLive.click();
  await expect(page.getByTestId('board-filter')).toHaveCount(0);
});

test('reduced motion disables the parallax and pulses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBoard(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.waitForTimeout(1800); // let the entry springs settle
  const before = await page.getByTestId('scene').evaluate((el) => getComputedStyle(el).transform);
  await page.getByTestId('stage').hover({ position: { x: 50, y: 50 } });
  await page.waitForTimeout(500);
  const after = await page.getByTestId('scene').evaluate((el) => getComputedStyle(el).transform);
  expect(after).toBe(before);
});

test('visual: main screen and focus view', async ({ page }) => {
  await openBoard(page);
  await page.waitForTimeout(1500); // springs settle
  // the clock is fixed (CLOCK_MODE=fixed); the ticker marquee and connection dot are masked
  const mask = [page.getByTestId('ticker')];
  await expect(page).toHaveScreenshot('main-exploded.png', { mask, maxDiffPixelRatio: 0.05, timeout: 20_000 });
  await page.getByTestId('floor-tab-1').click();
  await page.waitForTimeout(1500);
  await expect(page).toHaveScreenshot('main-focus-1.png', { mask, maxDiffPixelRatio: 0.05, timeout: 20_000 });
});
