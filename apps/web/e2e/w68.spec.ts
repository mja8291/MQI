import { expect, test } from '@playwright/test';
import { devState, installAndSignIn, lastSurveyId, rowsOf, scoreEverything, startSurvey } from './helpers';

/**
 * W68 (requested 2026-11-11): roof access at the Roof location takes the Review page's options and
 * fills the Review page; the dashboard shows Major and Minor scores (a campus's on tap on a phone).
 */
test('W68: roof access Ladder at the Roof fills Review; dashboard Major/Minor', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);

  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  // The Roof's roof-access item now offers the Review page's options (Safety folds once scored).
  if (!(await page.getByRole('button', { name: 'Proper staircase' }).isVisible())) await page.getByRole('button', { name: /^Safety/ }).click();
  await expect(page.getByRole('button', { name: 'Proper staircase' })).toBeVisible();
  await page.getByRole('button', { name: 'Ladder' }).click();
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();

  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(page.getByTestId('roof-access-from-roof')).toHaveText('Filled in from your answer at the Roof location.');
  const s = page.locator('select');
  await expect(s.nth(4)).toHaveValue('Ladder');
  await s.nth(0).selectOption('Solar');
  await s.nth(1).selectOption('NO');
  await s.nth(2).selectOption('RCC');
  await s.nth(3).selectOption('YES');
  await s.nth(5).selectOption('Provided');
  await s.nth(6).selectOption('Yes');
  await s.nth(7).selectOption('Yes');
  await page.locator('input[type=checkbox]').last().check();
  await page.getByRole('button', { name: 'Submit survey' }).click();
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  const row = rowsOf(await devState(), id)[0]!;
  expect(row['Rubric Version']).toBe('2026-11-13'); // W70
  expect(row['Access to roof area /tanks']).toBe('Poor'); // Ladder = 50%
  expect(row['Roof Access Type']).toBe('Ladder');

  await page.goto('/dashboard');
  await expect(page.getByTestId('major-minor')).toContainText('Major items');
  await expect(page.getByTestId('major-minor')).toContainText('Minor items');
  // On a phone the campus's own Major/Minor shows after a tap on its name.
  const detail = page.getByTestId('major-minor-row').first();
  await expect(detail).toBeHidden();
  await page.getByRole('button', { name: /^OGS Trust Campus/ }).first().click();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(/Major \d+%/);
});
