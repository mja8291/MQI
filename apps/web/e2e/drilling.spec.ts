import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/** A drilling-card field, found by its label (the innermost wrapper: the card itself is a div.mb-4 too). */
const field = (page: Page, label: string) =>
  page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).last().locator('input, select').first();

test('W44/W45: Roof shows Solar Panels; total depth comes first with its guidance; 110 mm screed marks Roof Screeding Unsafe, and it can be changed back', async ({ page }) => {
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: /^Functionality/ }).click(); // one section open at a time
  await expect(page.getByText('Solar Panels', { exact: true })).toBeVisible();
  await expect(page.getByText('Solar Panels/Inverter/Batteries')).toHaveCount(0);

  await page.locator('select').first().selectOption('YES');
  await field(page, 'Drilling point marked').selectOption('YES');
  await expect(page.getByText('If the total depth is more than 260 mm, remove the roof screed and inspect it.')).toBeVisible();
  await field(page, 'Total depth of slab + roof screed/waterproofing (mm)').fill('300');
  await field(page, 'Slab thickness recorded (mm)').fill('150');
  await field(page, 'Slab thickness assessment').selectOption('Ok');
  await page.getByRole('button', { name: /^Safety/ }).click(); // Roof Screeding is a Safety item
  const screed = page.locator('div.py-2\\.5', { hasText: 'Roof Screeding/roof drainage' });
  await expect(screed.getByText(/Marked Unsafe/)).toHaveCount(0);
  await field(page, 'Roof screeding thickness recorded (mm)').fill('120');
  await expect(page.getByText(/110 mm or more: Roof Screeding\/roof drainage is marked Unsafe/)).toBeVisible();
  await expect(screed.getByText(/Marked Unsafe/)).toBeVisible();

  // The surveyor can change it back, and a further edit of the reading doesn't override that.
  await screed.getByRole('button', { name: /^(OK|Good)$/ }).click();
  await expect(screed.getByText(/Marked Unsafe/)).toHaveCount(0);
  await field(page, 'Roof screeding thickness recorded (mm)').fill('125');
  await expect(screed.getByText(/Marked Unsafe/)).toHaveCount(0);

  // The location doesn't save without the total depth.
  await field(page, 'Was the drilled hole repaired').selectOption('YES');
  await field(page, 'Total depth of slab + roof screed/waterproofing (mm)').fill('');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toHaveCount(0);
  await field(page, 'Total depth of slab + roof screed/waterproofing (mm)').fill('300');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  const row = rowsOf(await devState(), id)[0]!;
  expect([String(row['Total Depth (mm)']), String(row['Slab Thickness (mm)']), String(row['Roof Screeding Thickness (mm)'])]).toEqual(['300', '150', '125']);
});
