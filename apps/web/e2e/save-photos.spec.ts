import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { PHOTO, addRoof, installAndSignIn, reviewAndSubmit, scoreEverything, startSurvey } from './helpers';

/** Clicks a button and collects the downloads it starts (one per photo). */
async function downloadsFrom(page: Page, click: () => Promise<void>, count: number): Promise<Download[]> {
  const got: Download[] = [];
  const onDownload = (d: Download) => got.push(d);
  page.on('download', onDownload);
  await click();
  await expect.poll(() => got.length, { timeout: 15_000 }).toBe(count);
  page.off('download', onDownload);
  return got;
}

test('W50: Save to phone from the photo viewer, the Review page and Sync Pending, offline, with descriptive names', async ({ context, page }) => {
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  // Photo viewer, while scoring the Roof.
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('input[type=file][capture]').first().setInputFiles(PHOTO);
  await page.getByRole('button', { name: /^View / }).first().click();
  const one = await downloadsFrom(page, () => page.getByRole('dialog').getByRole('button', { name: 'Save to phone' }).click(), 1);
  expect(one[0]!.suggestedFilename()).toMatch(/^MQI OGS Trust Campus \d{4}-\d{2}-\d{2} - Roof 1 - .+\.jpg$/);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();

  // Review page: every photo of the survey. W69: the one saved from the viewer is not saved again
  // (Chrome on Android would ask "Download file again?" for each such file).
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  let extra = 0;
  page.on('download', () => extra++);
  await page.getByRole('button', { name: 'Save the photo to phone' }).click();
  await expect(page.getByText('1 photo was saved to Downloads earlier, so not saved again.')).toBeVisible();
  expect(extra).toBe(0);
});

test('W69: "Save all" saves only photos not saved before', async ({ context, page }) => {
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  const input = page.locator('input[type=file][capture]').first();
  await input.setInputFiles(PHOTO);
  await expect(page.getByText(/KB · tap to view/)).toHaveCount(1);
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  // First time: saved.
  const first = await downloadsFrom(page, () => page.getByRole('button', { name: 'Save the photo to phone' }).click(), 1);
  expect(first).toHaveLength(1);
  await expect(page.getByText('1 photo saved to Downloads (shown in the gallery).')).toBeVisible();
  // Second time: nothing downloads, and it says why.
  let again = 0;
  page.on('download', () => again++);
  await page.getByRole('button', { name: 'Save the photo to phone' }).click();
  await expect(page.getByText('1 photo was saved to Downloads earlier, so not saved again.')).toBeVisible();
  expect(again).toBe(0);
});

test('W50: a submitted survey still waiting to upload can save its photos from Sync Pending', async ({ context, page }) => {
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await reviewAndSubmit(page);
  await page.waitForURL(/\/survey\/done/); // queued
  await page.goto('/?tab=sync');
  const got = await downloadsFrom(page, () => page.getByRole('button', { name: 'Save photos to phone' }).click(), 1);
  expect(got[0]!.suggestedFilename()).toMatch(/^MQI OGS Trust Campus \d{4}-\d{2}-\d{2} - Roof.* - .+\.jpg$/);
  await context.setOffline(false);
});
