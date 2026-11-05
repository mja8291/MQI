import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything } from './helpers';

/** A drilling-card field, found by its label (the innermost wrapper: the card itself is a div.mb-4 too). */
const field = (page: Page, label: string) =>
  page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).last().locator('input, select').first();

/**
 * W55 (2026-11-05): a building level besides External and Roof is required; depths can be typed
 * in inches (saved as mm); the soffit risk factor reaches the sheet; Schmidt reading shows N/mm².
 */
test('W55: levels need a building level; inches are saved as mm; soffit risk factor is saved', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await page.getByRole('link', { name: 'Start new survey' }).click();
  await page.getByPlaceholder('Start typing a campus name').fill('OGS');
  await page.getByRole('button', { name: /^OGS Trust Campus South West/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Start survey/ }).click();

  // Untick Ground and First: only External and Roof are left, so Continue is off.
  const cont = page.getByRole('button', { name: 'Continue' });
  await page.getByRole('checkbox', { name: /Ground/ }).click();
  await page.getByRole('checkbox', { name: /First/ }).click();
  await expect(page.getByText('Tick at least one level besides External and Roof.')).toBeVisible();
  await expect(cont).toBeDisabled();
  await page.getByRole('checkbox', { name: /Second/ }).click();
  await expect(page.getByText('Tick at least one level besides External and Roof.')).toHaveCount(0);
  await cont.click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('select').first().selectOption('YES');
  await field(page, 'Drilling point marked').selectOption('YES');
  await page.getByRole('radio', { name: 'inches' }).click();
  await field(page, 'Total depth of slab + roof screed/waterproofing (in)').fill('10');
  await expect(page.getByText('= 254 mm')).toBeVisible();
  await field(page, 'Slab thickness recorded (in)').fill('5.5');
  await field(page, 'Slab thickness assessment').selectOption('Ok');
  await field(page, 'Roof screeding thickness recorded (in)').fill('4.5');
  await expect(page.getByText(/110 mm \(4\.3 in\) or more/)).toBeVisible(); // 114.3 mm
  // Back to mm shows the saved mm values.
  await page.getByRole('radio', { name: 'mm' }).click();
  await expect(field(page, 'Slab thickness recorded (mm)')).toHaveValue('139.7');
  // The screed reading marked Roof Screeding Unsafe (which needs a photo); set it back to OK.
  await page.getByRole('button', { name: /^Safety/ }).click();
  await page.locator('div.py-2\\.5', { hasText: 'Roof Screeding/roof drainage' }).getByRole('button', { name: /^(OK|Good)$/ }).click();
  await field(page, 'Was the drilled hole repaired').selectOption('YES');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // Tick the new risk factor just before Submit (the Review answers live on that page).
  await reviewAndSubmit(page, { beforeSubmit: async () => page.getByLabel('Unplastered Ceiling (Soffit)').check() });
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  const row = rowsOf(await devState(), id)[0]!;
  expect([String(row['Total Depth (mm)']), String(row['Slab Thickness (mm)']), String(row['Roof Screeding Thickness (mm)'])]).toEqual(['254', '139.7', '114.3']);
  expect(String(row['Building Risk Factors'])).toContain('Unplastered Ceiling (Soffit)');
});
