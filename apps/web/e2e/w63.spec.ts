import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, startSurvey } from './helpers';

/**
 * W63/W65 (2026-11-09): the dashboard follows the campus survey plan (dev: a small Campus Survey
 * Plan tab, see apps/gas/src/dev/server.ts) as one hierarchy: Total → Exempted | Assessed | Pending,
 * the Safe/Unsafe matrix, App progress and the region breakup. On a 380px screen nothing scrolls
 * sideways; region names stay visible; the region filter applies everywhere.
 */
test('W65: dashboard hierarchy adds up, follows the region filter and fits 380px', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 380, height: 820 });
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus II/); // 948: Survey with App in the dev plan
  await addRoof(page);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);

  await page.goto('/');
  await page.getByRole('link', { name: 'View dashboard' }).click();
  const network = page.getByRole('region', { name: 'Network' });
  await expect(network).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Data check failed')).toHaveCount(0);
  // Dev plan: 7 campuses; Exempted 2 (PSSP 1 + 5 yr 1); scope 5 = Done without App 2 + Survey with App 3.
  await expect(page.locator('#card-exempted')).toContainText('2');
  await expect(page.locator('#card-assessed')).toContainText(/of 5 in scope/);
  const matrix = page.getByRole('region', { name: 'Safety result' });
  await expect(matrix).toContainText(/Out of \d+ assessed campuses/);
  await expect(page.getByRole('region', { name: 'App survey progress' })).toContainText(/Campuses surveyed\s*[12] \/ 3/);
  // Removed cards stay removed; the score chart is renamed.
  for (const gone of ['Average score', 'Overall rating', 'Avg Major score', 'Avg Minor score', 'Critical items (campus average)'])
    await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(page.getByText('MQI Score distribution')).toBeVisible();
  // The captured campus carries a Safe/Unsafe badge beside its score.
  await expect(page.getByText(/^(Safe|Unsafe)$/).first()).toBeVisible();

  // Nothing wider than the screen; region names in full.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await expect(page.getByRole('region', { name: 'Region breakup' }).getByRole('button', { name: /^South West/ })).toBeVisible();

  // The region filter applies to every section.
  await page.getByLabel('Region', { exact: true }).selectOption('North');
  await expect(page.locator('#card-assessed')).toContainText(/of 2 in scope/) // North: 1 without App + 1 to survey;
  await expect(page.getByRole('region', { name: 'Region breakup' }).getByRole('button', { name: /^South West/ })).toHaveCount(0);
});
