import { defineConfig, devices } from '@playwright/test'

/**
 * Browser harness for the flows that only a real page can prove: registration
 * through plan selection, chat streaming/cancellation/retry, and the template /
 * letter-editor export path. The application under test is supplied by
 * `E2E_BASE_URL` (a deployed environment or a local `pnpm dev` server); an
 * authenticated run additionally supplies `E2E_STORAGE_STATE`, captured once
 * after email verification so each spec starts signed in.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
