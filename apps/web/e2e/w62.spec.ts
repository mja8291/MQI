import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf } from './helpers';

/** W62 (2026-11-09): Survey details asks whether the survey is an actual assessment or for checking/training. */
test('W62: a checking/training survey is marked in the sheet', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await page.getByRole('link', { name: 'Start new survey' }).click();
  await page.getByPlaceholder('Start typing a campus name').fill('OGS');
  await page.getByRole('button', { name: /^OGS Trust Campus South West/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // Actual assessment is chosen to start with.
  await expect(page.getByRole('radio', { name: /Actual assessment/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Checking or training/ }).click();
  await expect(page.getByRole('radio', { name: /Checking or training/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /Start survey/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // levels
  await addRoof(page);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  expect(rowsOf(await devState(), id)[0]!['Survey Purpose']).toBe('Checking/Training');
});
