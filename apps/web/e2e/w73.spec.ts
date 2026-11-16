import { expect, test } from '@playwright/test';
import { installAndSignIn } from './helpers';

/** W73 (2026-11-16): Find school finds a campus by another name, its e-compound number, or one the App adds. */
test('W73: Find school searches other names, e-compound numbers and added campuses', async ({ page }) => {
  await installAndSignIn(page);
  await page.getByRole('link', { name: 'Start new survey' }).click();
  const search = page.getByPlaceholder('Start typing a campus name');

  await search.fill('Orangi Gadap');
  const ogs = page.getByRole('button', { name: /^OGS Trust Campus South West/ });
  await expect(ogs).toBeVisible();
  await expect(ogs).toContainText('Also known as Orangi Gadap Seaside Campus');

  await search.fill('S/1/10');
  await expect(page.getByRole('button', { name: /^OGS Trust Campus II/ })).toBeVisible();

  await search.fill('GGPS Test');
  await page.getByRole('button', { name: /^GGPS Test Added/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/survey\/details/);
});
