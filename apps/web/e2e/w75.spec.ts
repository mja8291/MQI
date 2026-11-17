import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** W75 (2026-11-16): admin creates and deletes accounts; requests counted on Home; sections and search. */
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('W75: request count on Home; create, search and delete an account', async ({ browser }) => {
  const requester = `req.${Date.now()}@tcf.test`;
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();
  await user.goto('/signup');
  await user.getByPlaceholder(/name/i).first().fill('Requesting Person');
  await user.locator('input[type=email]').fill(requester);
  const pw = user.locator('input[type=password]');
  await pw.nth(0).fill('first-password-1');
  await pw.nth(1).fill('first-password-1');
  await user.getByRole('button', { name: /create account/i }).click();
  await expect(user.getByRole('heading', { name: 'Account created' })).toBeVisible();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin@tcf.test', 'mqi-dev-pass-1');
  const manage = admin.getByRole('link', { name: /Manage users/ });
  await expect(manage.getByTestId('pending-requests')).toHaveText(/^[1-9]\d*$/);
  await manage.click();

  // Requests are open and counted; Access removed starts folded.
  await expect(admin.getByRole('region', { name: 'New account requests' }).getByText(requester)).toBeVisible();

  // Create an account: active at once, one-time password shown.
  const created = `made.${Date.now()}@tcf.test`;
  await admin.getByRole('button', { name: 'Create an account' }).click();
  await admin.getByLabel('Full name').fill('Made By Admin');
  await admin.getByLabel('Email').fill(created);
  await admin.getByRole('button', { name: 'Create account' }).click();
  await expect(admin.getByText(/Account created\. Temporary password for/)).toBeVisible();
  const temp = (await admin.locator('code').innerText()).trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{10}$/);

  // Search finds it among the active users.
  await admin.getByRole('searchbox', { name: 'Search users' }).fill('made by admin');
  const active = admin.getByRole('region', { name: 'Active users' });
  await expect(active.getByText(created)).toBeVisible();
  await expect(admin.getByRole('region', { name: 'New account requests' }).getByText(requester)).toHaveCount(0);

  // Delete it for good.
  await active.getByRole('button', { name: new RegExp(created) }).click();
  await active.getByRole('button', { name: "Delete Made By Admin's account" }).click();
  await admin.getByRole('button', { name: 'Delete account' }).click();
  await expect(active.getByText(created)).toHaveCount(0);
  await signIn(user, created, temp);
  await expect(user).toHaveURL(/\/signin/);

  await userCtx.close();
  await adminCtx.close();
});
