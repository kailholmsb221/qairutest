import { expect, test } from '@playwright/test';
import { noScroll, openBoard } from './helpers';

const SIZES = [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
] as const;

for (const [w, h] of SIZES) {
  test(`one screen, no scroll at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openBoard(page);
    await noScroll(page);
    // the board fits rows to the available height and paginates instead of overflowing
    const rows = page.getByTestId('board-now-rows');
    const perPage = Number(await rows.getAttribute('data-per-page'));
    expect(perPage).toBeGreaterThanOrEqual(1);
    const visible = await rows.getByTestId('board-row').count();
    expect(visible).toBeLessThanOrEqual(perPage);
    const box = await rows.boundingBox();
    const rowBoxes = await rows.getByTestId('board-row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    for (const bottom of rowBoxes) expect(bottom).toBeLessThanOrEqual(box!.y + box!.height + 1);
  });
}

test('board paginates when overflowing and shows page dots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openBoard(page);
  // at 720p NEXT (≈18 rows at 10:47) cannot fit → dots
  const dots = page.getByTestId('board-next').getByTestId('pager');
  await expect(dots).toBeVisible();
  await expect(dots.locator('i')).toHaveCount(await dots.locator('i').count());
  expect(await dots.locator('i').count()).toBeGreaterThan(1);
});

test('below 1024px the map and board become tabs and still nothing scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openBoard(page);
  await noScroll(page);
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('board')).toBeHidden();
  await page.getByRole('tab', { name: 'Табло' }).click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('stage')).toBeHidden();
  await noScroll(page);
});
