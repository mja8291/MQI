import { expect, test } from '@playwright/test';
import { addRoof, installAndSignIn, startSurvey } from './helpers';

/** W72 (2026-11-14 audit): a greyed-out Submit says what is still needed. */
test('W72: the Review page says why Submit is off, and it goes when everything is answered', async ({ page }) => {
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const blockers = page.getByTestId('submit-blockers');
  await expect(page.getByRole('button', { name: 'Submit survey' })).toBeDisabled();
  await expect(blockers).toContainText('Answer every question on this page.');
  await expect(blockers).toContainText('Tick the declaration at the bottom.');

  const s = page.locator('select');
  await s.nth(0).selectOption('Solar');
  await s.nth(1).selectOption('NO');
  await s.nth(2).selectOption('RCC');
  await s.nth(3).selectOption('YES');
  await s.nth(4).selectOption('Ladder');
  await s.nth(5).selectOption('Provided');
  await s.nth(6).selectOption('Yes');
  await s.nth(7).selectOption('Yes');
  await expect(blockers).toHaveText('To submit: Tick the declaration at the bottom.');
  await page.locator('input[type=checkbox]').last().check();
  await expect(blockers).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit survey' })).toBeEnabled();
});
