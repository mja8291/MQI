import { expect, test } from '@playwright/test';

/**
 * W61 (2026-11-09): Android users saw the app stuck on its logo. The Android splash stays until the
 * page draws something, and a page whose code could not load drew nothing. Now a start screen draws
 * at once, hands over to the app, and offers a way out when the app cannot start.
 */
test.describe('W61 start screen', () => {
  test('shows at once and goes when the first screen is ready', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.locator('#boot')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__mqiStarted === true)).toBe(true);
  });

  test('the app code cannot load: one reload, then "Try again" and "Repair"; Try again recovers', async ({ page }) => {
    let blocked = 0;
    await page.route(/\/assets\/index-[\w-]+\.js$/, (route) => {
      blocked++;
      return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><p>gone</p>' });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Repair the app/ })).toBeVisible();
    expect(blocked).toBe(2); // the first failure reloads once by itself
    await page.unroute(/\/assets\/index-[\w-]+\.js$/);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.locator('#boot')).toHaveCount(0);
  });

  test('the app code takes too long: the way out shows after 12 seconds', async ({ page }) => {
    await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 20_000));
      await route.continue().catch(() => undefined);
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByText('MQI Survey', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 16_000 });
    await expect(page.getByText(/drafts and unsent surveys are kept/)).toBeVisible();
  });

  test('a screen whose code a newer version removed reloads once and opens', async ({ page }) => {
    let failed = 0;
    await page.route(/\/assets\/page-[\w-]+\.js$/, (route) => {
      if (failed++ === 0) return route.fulfill({ status: 404, contentType: 'text/html', body: '' });
      return route.continue();
    });
    await page.goto('/');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    expect(failed).toBeGreaterThanOrEqual(2); // failed once, reloaded, loaded
  });
});
