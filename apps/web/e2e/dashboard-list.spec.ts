import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, startSurvey } from './helpers';

/**
 * W53 (reported 2026-11-04): after a training day, four surveys of Habibmetro Campus were on the
 * server but the dashboard listed the campus once (its latest survey), so three looked lost. The
 * figures still count a campus once; the list now shows every survey of it.
 */
test('W53: a campus surveyed twice lists both surveys on the dashboard', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  for (let i = 0; i < 2; i++) {
    await page.goto('/');
    await startSurvey(page, /^OGS Trust Campus South West/);
    await addRoof(page);
    await reviewAndSubmit(page);
    const id = await lastSurveyId(page);
    await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
    await page.waitForURL(/\/survey\/done/);
  }
  await page.goto('/');
  await page.getByRole('link', { name: 'View dashboard' }).click();
  const more = page.getByRole('button', { name: /surveys of this campus/ }).first();
  await expect(more).toBeVisible({ timeout: 20_000 });
  await more.click();
  // Each earlier survey has its own row with who submitted it and its own downloads.
  await expect(page.getByText(/· Dev Surveyor/).nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Export OGS Trust Campus \(.+\) as PDF$/ }).first()).toBeVisible();
});
