import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf } from './helpers';

const REMINDER = /R&M Plan 2026-27: prepare the BOQ/;

/** W64 (2026-11-09): a campus in the R&M Plan 2026-27 (dev: 948) reminds about its BOQ on Find school, Review and Done. */
test('W64: R&M Plan campus shows the BOQ reminder when chosen and on submission', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await page.getByRole('link', { name: 'Start new survey' }).click();
  await page.getByPlaceholder('Start typing a campus name').fill('OGS');
  await page.getByRole('button', { name: /^OGS Trust Campus South West/ }).click(); // 947: not in the plan
  await expect(page.getByText(REMINDER)).toHaveCount(0);
  await page.getByRole('button', { name: 'OGS Trust Campus II', exact: true }).click(); // its sibling, from the card
  await expect(page.getByText(REMINDER)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Start survey/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await addRoof(page);
  await reviewAndSubmit(page, { beforeSubmit: async () => expect(page.getByText(REMINDER)).toBeVisible() });
  await page.waitForURL(/\/survey\/done/);
  await expect(page.getByText(REMINDER)).toBeVisible();
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
});
