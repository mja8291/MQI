import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addDrillingHolePhoto, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

const field = (page: Page, label: string) =>
  page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).last().locator('input, select').first();

/**
 * W70 (requested 2026-11-13): with drilling done, the Roof can't be saved without the drilled-hole
 * photo; the dashboard's MIN box gives the principal's minor-items report.
 */
test('W70: drilling needs its hole photo; MIN downloads the principal report', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('select').first().selectOption('YES');
  await field(page, 'Drilling point marked').selectOption('YES');
  await field(page, 'Total depth of slab + roof screed/waterproofing (mm)').fill('200');
  await field(page, 'Slab thickness recorded (mm)').fill('150');
  await field(page, 'Slab + Screeding/Waterproofing thickness assessment').selectOption('Ok');
  await field(page, 'Roof screeding thickness recorded (mm)').fill('50');
  await field(page, 'Was the drilled hole repaired').selectOption('YES');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByText('Take a photo of the drilled hole (Slab thickness recorded) to continue.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toHaveCount(0);

  await addDrillingHolePhoto(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  expect(rowsOf(await devState(), id)[0]!['Rubric Version']).toBe('2026-11-13');

  await page.goto('/dashboard');
  const min = page.getByRole('button', { name: /^Minor items report for OGS Trust Campus/ }).first();
  await expect(min).toHaveText('MIN', { timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), min.click()]);
  expect(download.suggestedFilename()).toMatch(/^mqi-minor-items-OGS-Trust-Campus.*\.pdf$/);
});
