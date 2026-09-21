import { test as base, expect } from '@playwright/test'

/**
 * Every browser spec skips unless an environment is supplied, so a plain
 * `pnpm test:e2e` on a checkout without a running app is green rather than a
 * false failure. CI sets `E2E_BASE_URL` and the spec actually runs.
 */
export const test = base.extend<Record<string, never>>({})

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(!process.env.E2E_BASE_URL, 'E2E_BASE_URL is not set')
})

export { expect }
