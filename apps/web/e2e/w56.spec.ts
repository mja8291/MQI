import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

const field = (page: Page, label: string) =>
  page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).last().locator('input, select').first();

const SLAB = 'Slab + Screeding/Waterproofing thickness assessment';
const OVERFLOW = 'Proper Overflow Disposal System';

/**
 * W56 (2026-11-07): Guardroom/Canteen & UGWT on External (Guardroom scored on Toilet items); the slab
 * assessment and overflow answers score the two new Roof items; an Unsafe survey shows red on the dashboard.
 */
test('W56: Guardroom card, derived Roof items in the sheet, Unsafe on the dashboard', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);

  // Roof: drilling done, slab assessment Unsafe.
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await expect(page.getByText(SLAB, { exact: true })).toHaveCount(0); // not picked as an item
  await page.locator('select').first().selectOption('YES');
  await field(page, 'Drilling point marked').selectOption('YES');
  await expect(page.getByText(/In case of roof screed \(not tassu waterproofing\)/)).toBeVisible();
  await field(page, 'Total depth of slab + roof screed/waterproofing (mm)').fill('200');
  await field(page, 'Slab thickness recorded (mm)').fill('150');
  await field(page, SLAB).selectOption('Unsafe');
  await field(page, 'Roof screeding thickness recorded (mm)').fill('50');
  await field(page, 'Was the drilled hole repaired').selectOption('YES');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // External: one card for Guardroom/Canteen & UGWT; Guardroom gets the Toilet items.
  await page.getByRole('button', { name: /^External/ }).click();
  await page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ }).click();
  await page.locator('select').first().selectOption('Guardroom');
  await page.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: /^1 Guardroom\/Canteen & UGWT/ })).toBeVisible(); // counted on the card
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click(); // a floor with one location asks first
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible({ timeout: 10_000 });

  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(2);
  const rows = rowsOf(await devState(), id);
  const roof = rows.find((r) => r['Location Type'] === 'Roof')!;
  const guard = rows.find((r) => r['Location Type'] === 'Guardroom')!;
  expect([roof[SLAB], roof[OVERFLOW]]).toEqual(['Very Poor', 'Good']);
  expect(guard['Location Name']).toBe('Guardroom');
  expect(guard['Flush Tanks']).toBe('Good');
  expect(guard['Distribution Board']).toBe('Good'); // W59
  expect(guard[SLAB]).toBe('');

  await page.goto('/');
  await page.getByRole('link', { name: 'View dashboard' }).click();
  await expect(page.getByText(`Unsafe: ${SLAB}`).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Unsafe', { exact: true }).first()).toBeVisible();
});
