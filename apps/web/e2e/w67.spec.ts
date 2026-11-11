import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, startSurvey } from './helpers';

/**
 * W67 (requested 2026-11-11): Online/Offline tag in the corner; on the dashboard the score sits
 * over Safe/Unsafe and the downloads are two boxes, XLS over PDF; the Excel file is the campus report.
 */
test('W67: network tag, stacked dashboard row, Excel campus report', async ({ page, context }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);

  const tag = page.getByTestId('network-tag');
  await expect(tag).toHaveText('Online');
  await context.setOffline(true);
  await expect(tag).toHaveText('Offline');
  await context.setOffline(false);
  await expect(tag).toHaveText('Online');

  await page.goto('/');
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);

  await page.goto('/dashboard');
  const xls = page.getByRole('button', { name: /^Export OGS Trust Campus.* as Excel$/ }).first();
  const pdf = page.getByRole('button', { name: /^Export OGS Trust Campus.* as PDF$/ }).first();
  await expect(xls).toHaveText('XLS', { timeout: 20_000 });
  await expect(pdf).toHaveText('PDF');
  // XLS above PDF, not touching; the score pill above Safe/Unsafe.
  const xb = (await xls.boundingBox())!;
  const pb = (await pdf.boundingBox())!;
  expect(pb.y).toBeGreaterThan(xb.y + xb.height);
  expect(Math.abs(pb.x - xb.x)).toBeLessThan(1);
  const stack = page.getByTestId('score-stack').first();
  const score = (await stack.getByText(/% · (Excellent|Good|Average|Poor)$/).boundingBox())!;
  const safe = (await stack.getByText(/^(Safe|Unsafe)$/).boundingBox())!;
  expect(safe.y).toBeGreaterThan(score.y + score.height - 1);

  const started = Date.now();
  const [download] = await Promise.all([page.waitForEvent('download'), xls.click()]);
  expect(Date.now() - started).toBeLessThan(15_000);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await download.path())!);
  expect(wb.worksheets.map((w) => w.name).slice(0, 3)).toEqual(['Summary', 'Score by group', 'Major and minor']);
  expect(wb.worksheets.at(-1)!.name).toBe('Single Survey - Calculated');
});
