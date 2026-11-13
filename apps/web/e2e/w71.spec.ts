import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import { addRoof, devState, installAndSignIn, lastSurveyId, reviewAndSubmit, rowsOf, photoRowsOf, startSurvey } from './helpers';

/** Counts the images drawn in a PDF (XObjects of subtype Image on its pages). */
async function imagesIn(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const page of doc.getPages()) {
    const res = page.node.Resources();
    const xo = res?.lookup(PDFName.of('XObject'), PDFDict);
    if (!xo) continue;
    for (const key of xo.keys()) {
      const obj = xo.lookup(key);
      if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') n++;
    }
  }
  return n;
}

/** W71 (reported 2026-11-13): the campus report showed no photos. */
test('W71: the campus report downloaded from the dashboard contains the survey photos; the campus list can be searched', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page, 'admin@tcf.test');
  await page.goto('/');
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page); // one photo
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);

  await page.goto('/dashboard');
  const pdf = page.getByRole('button', { name: /^Export OGS Trust Campus.* as PDF$/ }).first();
  await expect(pdf).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), pdf.click()]);
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  expect(await imagesIn(bytes)).toBe(1);

  // W71: search the campus list.
  const search = page.getByRole('searchbox', { name: 'Search campuses' });
  await search.fill('ogs trust');
  await expect(pdf).toBeVisible();
  await search.fill('no such campus');
  await expect(page.getByText('No campus matches "no such campus".')).toBeVisible();
  await expect(pdf).toHaveCount(0);
});
