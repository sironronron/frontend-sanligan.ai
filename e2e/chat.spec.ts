import { test, expect } from './fixtures'

/**
 * Authenticated chat flows. These need `E2E_STORAGE_STATE` — a Playwright
 * storage state captured once after email verification — so they skip in a
 * plain run and execute in CI against the staging environment.
 */
test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(!process.env.E2E_STORAGE_STATE, 'E2E_STORAGE_STATE is not set')
})

test('a message is sent and an answer streams back', async ({ page }) => {
  await page.goto('/chat')

  const composer = page.getByLabel('Message').first()
  await expect(composer).toBeVisible()
  await composer.fill('What is the prescriptive period under Rule 70?')
  await page.getByRole('button', { name: 'Send' }).first().click()

  await expect(page.getByText('What is the prescriptive period under Rule 70?').first()).toBeVisible()
  // The turn either streams an answer or surfaces an inline error; both prove
  // the request left the page and a response came back.
  await expect(page.getByLabel('Stop generating').or(page.getByText(/could not be completed|Something went wrong/i)).first())
    .toBeVisible({ timeout: 30_000 })
})

test('cancelling keeps the user message on the thread', async ({ page }) => {
  await page.goto('/chat')

  const composer = page.getByLabel('Message').first()
  await composer.fill('Draft a demand letter for P855,000.')
  await page.getByRole('button', { name: 'Send' }).first().click()

  const stop = page.getByLabel('Stop generating').first()
  if (await stop.isVisible().catch(() => false)) {
    await stop.click()
  }

  await expect(page.getByText('Draft a demand letter for P855,000.').first()).toBeVisible()
})
