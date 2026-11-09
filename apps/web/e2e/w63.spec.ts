import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, startSurvey } from './helpers';

/**
 * W63 (2026-11-09): the dashboard follows the campus survey plan (dev: a small Campus Survey Plan
 * tab, see apps/gas/src/dev/server.ts). A survey of a Survey with App campus is captured, and its
 * Unsafe answer counts as Unsafe identified next to the plan's checked-without-App campuses.
 */
test('W63: dashboard breakup counts an app survey as captured and unsafe identified', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus II/); // 948: Survey with App in the dev plan
  await addRoof(page);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);

  await page.goto('/');
  await page.getByRole('link', { name: 'View dashboard' }).click();
  const breakup = page.getByRole('region', { name: 'Campus breakup' });
  await expect(breakup.getByText('Unsafe identified')).toBeVisible({ timeout: 20_000 });
  await expect(breakup.getByText(/of 3 surveyed/)).toBeVisible();
  await expect(page.getByText('MQI Score distribution')).toBeVisible();
  for (const gone of ['Average score', 'Overall rating', 'Avg Major score', 'Avg Minor score', 'Critical items (campus average)'])
    await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  const south = breakup.getByRole('row', { name: /^South West/ });
  await expect(south.getByRole('cell').nth(6)).toHaveText(/^[12]$/); // captured (1, or 2 if another test surveyed 947)
});
