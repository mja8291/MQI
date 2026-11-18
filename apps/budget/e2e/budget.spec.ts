import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PASSWORD = 'mqi-dev-pass-1';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('R&M Budget: surveyors are turned away', async ({ page }) => {
  await signIn(page, 'surveyor@tcf.test');
  await expect(page.getByText("doesn't have access to the R&M Budget")).toBeVisible();
});

test('R&M Budget: import, cycle, two scenarios, compare and the budget book in three formats', async ({ page }) => {
  await signIn(page, 'costs@tcf.test');
  await page.getByTestId('import').click();
  await expect(page.getByTestId('import-summary')).toContainText('5 campuses loaded');

  // A cycle (the dev server may already have one from an earlier run).
  const existing = page.getByRole('link', { name: /^FY \d{4}-\d{2}$/ }).first();
  if (!(await existing.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Create cycle' }).click();
  await page.getByRole('link', { name: /^FY \d{4}-\d{2}$/ }).first().click();
  await expect(page.getByTestId('cycle-summary')).toContainText('Campuses loaded');

  // Scenario A: rates entered, saved.
  await page.getByRole('button', { name: 'New scenario' }).click();
  await expect(page.getByTestId('campus-settings')).toBeVisible();
  await page.getByLabel('Last year cost of Critically unsafe').fill('6.5');
  await page.getByLabel('Last year cost of Poor').fill('2');
  await page.getByLabel('Count of Emergencies').fill('10');
  await page.getByLabel('Last year cost of Emergencies').fill('0.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.getByRole('tab', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('total')).toHaveText('5.00');
  const scenarioUrl = page.url();

  // Scenario B: a clone with a different emergency count.
  await page.getByRole('link', { name: /^FY \d{4}-\d{2}$/ }).click();
  const rows = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Clone' }) });
  const before = await rows.count();
  await rows.last().getByRole('button', { name: 'Clone' }).click();
  await expect(rows).toHaveCount(before + 1);
  await rows.last().getByRole('link').click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByLabel('Count of Emergencies').fill('20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  // The source scenario is unchanged.
  await page.goto(scenarioUrl);
  await expect(page.getByTestId('total')).toHaveText('5.00');

  // Compare the two.
  await page.getByRole('link', { name: /^FY \d{4}-\d{2}$/ }).click();
  await rows.nth(before - 1).getByRole('checkbox').check();
  await rows.nth(before).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Compare' }).click();
  const compare = page.getByTestId('compare');
  await expect(compare.locator('tr[data-differs="yes"]').filter({ hasText: 'Emergencies' }).first()).toBeVisible();
  await expect(compare.locator('tr').filter({ hasText: 'Total (Rs M)' })).toContainText('10.00');

  // The budget book in all three formats.
  for (const [id, ext] of [['export-xlsx', '.xlsx'], ['export-pptx', '.pptx'], ['export-pdf', '.pdf']] as const) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()]);
    expect(download.suggestedFilename().startsWith('Budget-book-') && download.suggestedFilename().endsWith(ext)).toBe(true);
  }
});
