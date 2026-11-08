import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/**
 * W60 (2026-11-08): like External Development, a Guardroom / Canteen / UGWT recorded for one campus
 * pre-fills the same location at a sibling campus of the e-compound (dev: 947 and 948, S/1/10).
 */
test('W60: a sibling campus Guardroom pre-fills the Guardroom here', async ({ page }) => {
  test.setTimeout(240_000);
  await installAndSignIn(page);

  // Campus 947: a Guardroom, everything Good.
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await page.getByRole('button', { name: /^External/ }).click();
  await page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ }).click();
  await page.locator('select').first().selectOption('Guardroom');
  await expect(page.getByText(/Pre-filled from/)).toHaveCount(0); // nothing recorded at the sibling yet
  await page.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(2);
  await page.waitForURL(/\/survey\/done/);

  // Campus 948, same e-compound: picking Guardroom says where it comes from and fills it in.
  await page.goto('/');
  await startSurvey(page, /^OGS Trust Campus II/);
  await page.getByRole('button', { name: /^External/ }).click();
  await page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ }).click();
  await page.locator('select').first().selectOption('Guardroom');
  await expect(page.getByText(/Pre-filled from OGS Trust Campus \(/)).toBeVisible({ timeout: 15_000 });
  await page.locator('select').first().selectOption('Guardroom');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const section of ['Safety', 'Functionality', 'Aesthetics'])
    await expect(page.getByRole('button', { name: new RegExp(`^${section}`) })).toContainText(/(\d+) of \1 scored/);
});
