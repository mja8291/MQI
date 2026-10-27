import { expect, test } from '@playwright/test';

test('a signed-out device lands on sign-in (FR-AUTH-4)', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/signin\?next=%2Fdashboard$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
