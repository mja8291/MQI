import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAndSignIn, scoreEverything, startSurvey, addDrillingHolePhoto } from './helpers';

/** QA pass (2026-11-07) on W55/W56 phone flows that the feature tests don't cover. */
const field = (page: Page, label: string) =>
  page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).last().locator('input, select').first();
const safety = (page: Page) => page.locator('div.mb-2\\.5', { has: page.getByText('Safety', { exact: true }) }).first();

test('QA: inches survive removing a drill hole; the review score follows the overflow answer; a Guardroom reopens as a Guardroom', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);

  // Roof, drilling in inches with three holes; remove the middle one.
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('select').first().selectOption('YES');
  await field(page, 'Drilling point marked').selectOption('YES');
  await addDrillingHolePhoto(page);
  await page.getByRole('radio', { name: 'inches' }).click();
  await field(page, 'Total depth of slab + roof screed/waterproofing (in)').fill('9');
  await field(page, 'Slab thickness recorded (in)').fill('5');
  await field(page, 'Slab + Screeding/Waterproofing thickness assessment').selectOption('Ok');
  await field(page, 'Roof screeding thickness recorded (in)').fill('2');
  await page.getByRole('button', { name: '+ Add another drill hole' }).click();
  await page.getByRole('button', { name: '+ Add another drill hole' }).click();
  await page.getByLabel('Drill hole 2: total depth (in)').fill('8');
  await page.getByLabel('Drill hole 3: total depth (in)').fill('12');
  await page.getByLabel('Drill hole 3: slab thickness (in)').fill('6');
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click(); // hole 2 goes; hole 3 becomes hole 2
  await expect(page.getByLabel('Drill hole 2: total depth (in)')).toHaveValue('12');
  await expect(page.getByLabel('Drill hole 2: slab thickness (in)')).toHaveValue('6');
  await expect(page.getByText('= 304.8 mm')).toBeVisible();
  await expect(page.getByLabel('Drill hole 3: total depth (in)')).toHaveCount(0);
  // mm and back: the same lengths.
  await page.getByRole('radio', { name: 'mm' }).click();
  await expect(page.getByLabel('Drill hole 2: total depth (mm)')).toHaveValue('304.8');
  await page.getByRole('radio', { name: 'inches' }).click();
  await expect(page.getByLabel('Drill hole 2: total depth (in)')).toHaveValue('12');
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await field(page, 'Was the drilled hole repaired').selectOption('YES');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // Guardroom, then reopen it from the list: still a Guardroom with the Toilet items.
  await page.getByRole('button', { name: /^External/ }).click();
  await page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ }).click();
  await page.locator('select').first().selectOption('Guardroom');
  await page.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  await page.getByRole('button', { name: /Guardroom — Guardroom/ }).click();
  await expect(page.getByText(/Guardroom — Guardroom/).first()).toBeVisible();
  await page.getByRole('button', { name: /^Functionality/ }).click();
  await expect(page.getByText('Flush Tanks')).toBeVisible();
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: /^1 Guardroom\/Canteen & UGWT/ })).toBeVisible(); // edited, not duplicated
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // Review: Safety follows the overflow answer (NO = 25% at weight 4 among Roof's 24 Safety points).
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const overflow = page.locator('select').nth(5);
  await overflow.selectOption('Provided');
  await expect(safety(page)).toContainText('100%');
  await overflow.selectOption('Not provided');
  await expect(safety(page)).not.toContainText('100%');
  await overflow.selectOption('Provided');
  await expect(safety(page)).toContainText('100%');
});
