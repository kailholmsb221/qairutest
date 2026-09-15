import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.WEB_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

/**
 * E2E runs against a started API with CLOCK_MODE=fixed (see infra/.env.example and .github/workflows/ci.yml).
 * Locally: `pnpm --filter @campuslive/web build && pnpm --filter @campuslive/web e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: 'disabled' } },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
    colorScheme: 'dark',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
  webServer: {
    command: 'pnpm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
