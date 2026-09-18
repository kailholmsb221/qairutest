import { expect, test } from '@playwright/test';
import { openBoard } from './helpers';

/**
 * The weekly timetable editor behind ⚙ → 📅. Saturday is never seeded, so the first Saturday slot
 * of the first room is free; the test adds a lesson there and removes it again (the fixed-clock
 * Tuesday board stays untouched).
 */
test('admin can add a weekly lesson in the timetable editor and remove it', async ({ page }) => {
  await openBoard(page);
  await page.getByTestId('admin-toggle').click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();
  await page.getByTestId('admin-schedule-open').click();
  const panel = page.getByTestId('schedule-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('sched-grid')).toBeVisible();

  // the grid lists the seeded lessons of the first schedulable room
  const room = await page.getByTestId('sched-room').inputValue();
  expect(room).not.toBe('');
  await expect(page.getByTestId('sched-lesson').first()).toBeVisible();

  // Saturday, first slot: free → add
  const cell = page.locator('[data-testid^="sched-cell-6-"]').first();
  await expect(cell.getByTestId('sched-lesson')).toHaveCount(0);
  await cell.locator('[data-testid^="sched-add-"]').click();
  await expect(page.getByTestId('sched-form')).toBeVisible();
  await page.getByTestId('sched-save').click();
  await expect(cell.getByTestId('sched-lesson')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('toast')).toContainText(/добавлено|added/i);

  // remove it again
  await cell.locator('[data-testid^="sched-delete-"]').click();
  await expect(cell.getByTestId('sched-lesson')).toHaveCount(0, { timeout: 15_000 });

  // Escape closes the editor; nothing scrolled
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
