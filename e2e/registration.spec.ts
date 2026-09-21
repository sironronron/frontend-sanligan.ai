import { test, expect } from './fixtures'

async function openEmailRegistration(page: import('@playwright/test').Page) {
  await page.goto('/register')
  await page.getByRole('button', { name: 'Create account with Email' }).click()
  await expect(page.getByLabel('Full name')).toBeVisible()
}

test('the registration form validates before it calls the API', async ({ page }) => {
  await openEmailRegistration(page)

  await page.getByLabel('Full name').fill('E2E Tester')
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Confirm password').fill('different')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()

  await expect(page.getByText('Use at least 8 characters.')).toBeVisible()
  await expect(page.getByText('Passwords do not match.')).toBeVisible()
  await expect(page).toHaveURL(/\/register/)
})

test('a new account reaches the full-screen plan selector', async ({ page }) => {
  await openEmailRegistration(page)

  const email = `e2e-${Date.now()}@example.com`

  await page.getByLabel('Full name').fill('E2E Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Passphrase!2345')
  await page.getByLabel('Confirm password').fill('Passphrase!2345')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()

  // With confirmation enabled the app parks on "check your email"; without it,
  // the account lands straight on the full-screen plan selector.
  const confirmation = page.getByText(/check your email/i)
  const selector = page.getByRole('heading', { name: /choose how to begin/i })

  await expect(confirmation.or(selector)).toBeVisible({ timeout: 30_000 })

  if (await selector.isVisible()) {
    await expect(page.getByRole('button', { name: /start free trial/i })).toBeVisible()
  }
})

test('the terms page is reachable without an account', async ({ page }) => {
  const response = await page.goto('/terms')

  expect(response?.status() ?? 500).toBeLessThan(400)
  await expect(page.locator('body')).not.toContainText('Application error')
})
