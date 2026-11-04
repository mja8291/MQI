import { expect, test } from '@playwright/test';
import { PHOTO, devState, installAndSignIn, lastSurveyId, photoRowsOf, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/**
 * W54: once the server has a survey's answers and every photo, the phone keeps only a "sent"
 * marker; the survey opens read only from the server under My assessments, photos on tap.
 */
test('W54: a confirmed survey leaves the phone and opens read only under My assessments, with its photo', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('input[type=file][capture]').first().setInputFiles(PHOTO);
  await expect(page.getByText(/KB · tap to view/).first()).toBeVisible();
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  expect(rowsOf(await devState(), id)).toHaveLength(1);

  // Freed on the phone: no survey record, no photo bytes, only the marker.
  const onPhone = () =>
    page.evaluate(
      (id) =>
        new Promise<{ survey: boolean; photos: number; sent: boolean }>((resolve) => {
          const open = indexedDB.open('mqi-v2');
          open.onsuccess = () => {
            const tx = open.result.transaction(['surveys', 'photos', 'sent']);
            const s = tx.objectStore('surveys').get(id);
            const p = tx.objectStore('photos').count();
            const m = tx.objectStore('sent').get(id);
            tx.oncomplete = () => resolve({ survey: Boolean(s.result), photos: p.result, sent: Boolean(m.result) });
          };
        }),
      id,
    );
  await expect.poll(onPhone, { timeout: 15_000 }).toEqual({ survey: false, photos: 0, sent: true });

  await page.goto('/');
  await page.getByRole('tab', { name: 'My assessments' }).click();
  await page.getByRole('link', { name: /OGS Trust Campus/ }).first().click();
  await expect(page.getByText('Submitted · read only')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Roof · Roof 1/)).toBeVisible();
  await page.getByRole('button', { name: /^Show photo:/ }).first().click();
  await expect(page.locator('img[src^="data:image/"]')).toBeVisible({ timeout: 20_000 });
  // Read only: no inputs.
  await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
});
