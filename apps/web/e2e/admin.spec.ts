import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** FR-AUTH-1/2/3 with the v2 admin screen: sign up → pending → approved in-app → sign in; temporary password → forced change. */

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('sign-up, approval, temporary password and forced change', async ({ browser }) => {
  const email = `new.${Date.now()}@tcf.test`;
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();

  // Sign up: pending until approved.
  await user.goto('/signup');
  await user.getByPlaceholder(/name/i).first().fill('New Surveyor');
  await user.locator('input[type=email]').fill(email);
  const pw = user.locator('input[type=password]');
  await pw.nth(0).fill('first-password-1');
  await pw.nth(1).fill('first-password-1');
  await user.getByRole('button', { name: /create account/i }).click();
  await expect(user.getByRole('heading', { name: 'Account created' })).toBeVisible();
  await signIn(user, email, 'first-password-1');
  await expect(user.getByRole('alert')).toContainText('awaiting approval');

  // Admin approves in the app.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin@tcf.test', 'mqi-dev-pass-1');
  await admin.getByRole('link', { name: 'Manage users' }).click();
  const row = admin.locator('div.px-3\\.5', { hasText: email });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.locator('section', { hasText: 'Active' }).getByText(email)).toBeVisible();

  await signIn(user, email, 'first-password-1');
  await expect(user.getByRole('link', { name: 'Start new survey' })).toBeVisible();

  // Admin issues a temporary password: the user's session ends and the next sign-in must change it.
  await row.getByRole('button', { name: 'Temporary password' }).click();
  await admin.getByRole('button', { name: 'Issue password' }).click();
  const temp = (await admin.locator('code').innerText()).trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{10}$/);

  await signIn(user, email, temp);
  await expect(user).toHaveURL(/\/change-password$/);
  const fields = user.locator('input[type=password]');
  await fields.nth(0).fill(temp);
  await fields.nth(1).fill('second-password-2');
  await fields.nth(2).fill('second-password-2');
  await user.getByRole('button', { name: 'Save new password' }).click();
  await expect(user.getByRole('link', { name: 'Start new survey' })).toBeVisible();

  await userCtx.close();
  await adminCtx.close();
});
