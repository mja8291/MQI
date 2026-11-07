import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/** W58 (2026-11-07): UGWT has External Plumbing as its only Functionality item and no Paint; Canteen has no Green board. */
test('W58: UGWT and Canteen are scored on their own items and written with their own types', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);

  await page.getByRole('button', { name: /^External/ }).click();
  for (const name of ['UGWT', 'Canteen']) {
    await page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ }).click();
    await page.locator('select').first().selectOption(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await scoreEverything(page);
    if (name === 'UGWT') {
      await expect(page.getByRole('button', { name: /^Functionality/ })).toContainText('1 of 1 scored');
      await expect(page.getByRole('button', { name: /^Aesthetics/ })).toContainText('1 of 1 scored'); // Plaster only
    } else {
      await page.getByRole('button', { name: /^Functionality/ }).click();
      await expect(page.getByText('Green board/Softboard/Cabinet')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Save Selection and Return' }).click();
    await expect(page.getByRole('button', { name: /Guardroom\/Canteen & UGWT/ })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(3);
  const rows = rowsOf(await devState(), id);
  const ugwt = rows.find((r) => r['Location Type'] === 'UGWT')!;
  const canteen = rows.find((r) => r['Location Type'] === 'Canteen')!;
  expect([ugwt['External Plumbing'], ugwt['Paint'], ugwt['Furniture Condition'], ugwt['Plaster']]).toEqual(['Good', '', '', 'Good']);
  expect([canteen['Green board/Softboard/Cabinet'], canteen['Furniture Condition'], canteen['Paint']]).toEqual(['', 'Good', 'Good']);
});
