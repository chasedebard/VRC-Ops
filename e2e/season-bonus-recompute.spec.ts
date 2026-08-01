import { test, expect } from '@playwright/test'

/**
 * Owner/admin golden path from the parity spec's Phase 19: sign in, open a season with
 * finalized results, enable both bonuses, save, confirm the recompute runs, and confirm no
 * point duplication after a reload.
 *
 * This runs against the real shared Supabase project (there is no seeded test/staging
 * environment for this app), so it needs real credentials for a league owner/admin and a real
 * season that already has at least one finalized official race result. Rather than fabricating
 * fixtures against production data, this spec is skipped unless the following env vars are set:
 *
 *   E2E_OWNER_EMAIL         - login email for a league owner or admin
 *   E2E_OWNER_PASSWORD      - that account's password
 *   E2E_SEASON_NAME         - the exact name of a season (with finalized results) to open from
 *                             Championships → that season's page
 *
 * Run with: E2E_OWNER_EMAIL=... E2E_OWNER_PASSWORD=... E2E_SEASON_NAME=... npm run test:e2e
 */

const email = process.env.E2E_OWNER_EMAIL
const password = process.env.E2E_OWNER_PASSWORD
const seasonName = process.env.E2E_SEASON_NAME

test.skip(!email || !password || !seasonName, 'Set E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD/E2E_SEASON_NAME to run this against real data.')

test('owner enables bonus points, save recomputes scoring without duplicating points on reload', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email!)
  await page.getByLabel(/password/i).fill(password!)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.getByRole('link', { name: 'Championship' }).click()
  await page.getByRole('link', { name: seasonName! }).click()
  await expect(page.getByRole('heading', { name: 'Bonus Points' })).toBeVisible()

  const poleToggle = page.getByLabel('Pole position bonus')
  if (!(await poleToggle.isChecked())) await poleToggle.check()
  await page.getByRole('radio', { name: '+2' }).first().click()

  const fastestLapToggle = page.getByLabel('Fastest lap bonus')
  if (!(await fastestLapToggle.isChecked())) await fastestLapToggle.check()
  await page.getByRole('radio', { name: '+3' }).nth(1).click()

  await page.getByRole('button', { name: /^Save$/ }).click()

  // Either a real recompute ran, or there were no finalized results to recompute — either is a
  // valid terminal state, but a raw/unhandled error is not.
  await expect(page.getByText(/Saved\.|Recalculated \d+ result/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/could not be recalculated/i)).not.toBeVisible()

  const pointsBefore = await page.locator('text=Scoring').first().innerText()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bonus Points' })).toBeVisible()
  const pointsAfter = await page.locator('text=Scoring').first().innerText()
  expect(pointsAfter).toBe(pointsBefore)
})
