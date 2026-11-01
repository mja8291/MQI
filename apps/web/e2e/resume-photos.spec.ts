import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PHOTO, addRoof, devState, installAndSignIn, lastSurveyId, photoRowsOf, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/** Ground → Girls Toilet with Wall Unsafe and its photo, saved. Back on the Floor level page. */
async function addUnsafeToilet(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Ground/ }).click();
  await page.getByRole('button', { name: /Toilet/ }).click();
  await page.locator('select').first().selectOption('Girls Toilet');
  await page.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(page);
  await attachWallPhoto(page, true);
}

/** On the Girls Toilet scoring page: (optionally) mark Wall Unsafe, attach its photo, save the location. */
async function attachWallPhoto(page: Page, markUnsafe: boolean): Promise<void> {
  const wall = page.locator('div.py-2\\.5', { hasText: 'Wall/Column Condition' });
  if ((await wall.getByRole('button', { name: 'Wall Unsafe' }).count()) === 0) await page.getByRole('button', { name: /^Safety/ }).click();
  if (markUnsafe) await wall.getByRole('button', { name: 'Wall Unsafe' }).click();
  await wall.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(wall.getByText(/Marked Unsafe/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByText("Tap the type of location you're scoring.")).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click(); // Ground floor → the Floor level page
  await page.getByRole('button', { name: 'Proceed anyway' }).click(); // only one location on this floor (W26)
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
}

const photoCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('mqi-v2');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('photos').objectStore('photos').count();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );

test('W46: Save & exit, then Resume, keeps every photo; the survey with an Unsafe item submits', async ({ page }) => {
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await addUnsafeToilet(page);
  expect(await photoCount(page)).toBe(2);

  await page.getByRole('button', { name: 'Save and exit to Incomplete surveys' }).click();
  await page.getByRole('button', { name: 'Resume' }).first().click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  expect(await photoCount(page)).toBe(2); // the old version had 0 here

  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(2);
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(2);
});

test('W46/W47: a survey whose photos were already lost (surveyor has left the site) submits without retaking; the items are noted', async ({ page }) => {
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await addUnsafeToilet(page);

  // What the old version did on Resume: the photo bytes are deleted, the survey still lists them.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mqi-v2');
        open.onsuccess = () => {
          const tx = open.result.transaction('photos', 'readwrite');
          tx.objectStore('photos').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload(); // the user reopens the app on the fixed version
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // No retake: the Unsafe wall stays without a photo, and the survey still submits.
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(2);
  const notes = (await devState()).attachments.filter((r) => r['Survey ID'] === id && String(r['Note']).includes('Photo lost on the phone'));
  expect(notes).toHaveLength(2); // the roof photo and the toilet wall photo were both lost
  expect(notes.some((r) => r['Item Name'] === 'Wall/Column Condition i.e. cracks' && r['Location Name'] === 'Girls Toilet')).toBe(true);
});
