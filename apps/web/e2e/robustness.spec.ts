import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PHOTO, addRoof, devState, installAndSignIn, lastSurveyId, photoRowsOf, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/**
 * Robustness (W51): the ways a surveyor can trip the app while photos are being saved or text is
 * typed, each run on the production build. Every case must end with nothing lost, nothing attached
 * to the wrong place, and nothing the server would refuse.
 */

/** The saved draft's photos per location (from IndexedDB), plus the open location's. */
async function draftPhotos(page: Page): Promise<{ saved: Record<string, number>; current: number | null }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('mqi-v2');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('drafts').objectStore('drafts').getAll();
          req.onsuccess = () => {
            const state = req.result[0]?.state;
            const count = (photos: Record<string, unknown[]>) => Object.values(photos ?? {}).reduce((n, l) => n + l.length, 0);
            const saved: Record<string, number> = {};
            for (const l of state?.scoring?.locations ?? []) saved[l.name] = count(l.photos);
            resolve({ saved, current: state?.scoring?.current ? count(state.scoring.current.photos) : null });
          };
        };
      }),
  );
}

/** Puts a large camera-sized JPEG (slow to compress) on the item row's camera input, then runs `then` at once. */
async function attachLargeThen(page: Page, then: 'save' | 'second'): Promise<void> {
  await page.evaluate(async (then) => {
    const c = document.createElement('canvas');
    c.width = 6000;
    c.height = 4500;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360},40%,${25 + (i % 60)}%)`;
      g.fillRect((i * 97) % 6000, (i * 61) % 4500, 140, 90);
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.95));
    const row = [...document.querySelectorAll('div.py-2\\.5')].find((d) => d.querySelector('input[type=file]'))!;
    const input = row.querySelector('input[type=file]') as HTMLInputElement;
    const put = (name: string) => {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    put('IMG_big_1.jpg');
    if (then === 'second') put('IMG_big_2.jpg');
    else {
      // The Save button is disabled while a photo saves; Back is not — it must wait for the photo.
      const save = [...document.querySelectorAll('button')].find((b) => /^(Save Selection and Return|Saving photo…)$/.test(b.textContent?.trim() ?? ''))!;
      if (!save.disabled) throw new Error('Save should be disabled while a photo is saving');
      (document.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    }
  }, then);
}

test('1. leaving a location while its photo is still being saved: the photo stays with that location', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await page.locator('select').first().selectOption('NO');
  await attachLargeThen(page, 'save');
  // Either Save waits for the photo, or it is refused until the photo is in: both end on the Roof.
  await page.waitForTimeout(15_000);
  if (await page.getByRole('button', { name: 'Save Selection and Return' }).isVisible()) {
    await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  }
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500); // autosave
  const d = await draftPhotos(page);
  expect(d.current).toBeNull();
  expect(Object.values(d.saved).reduce((a, b) => a + b, 0)).toBe(1);
});

test('2. two photos picked back to back on one item: both are kept', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  await attachLargeThen(page, 'second');
  await expect(page.getByText(/KB · tap to view/)).toHaveCount(2, { timeout: 60_000 });
});

test('3. an item takes at most 20 photos, and long text is cut at what the server accepts', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  const row = page.locator('div.py-2\\.5').filter({ has: page.locator('input[type=file]') }).first();
  for (let i = 0; i < 20; i++) {
    await row.locator('input[type=file][capture]').setInputFiles(PHOTO);
    await expect(row.getByText(/KB · tap to view/)).toHaveCount(i + 1);
  }
  await expect(row.getByRole('button', { name: 'Take photo' })).toBeDisabled();
  await expect(row.getByText('20 photos is the most for one item.')).toBeVisible();

  await row.getByRole('button', { name: 'Add note' }).click();
  await row.getByPlaceholder('Note on this item').fill('x'.repeat(2500));
  await expect(row.getByPlaceholder('Note on this item')).toHaveValue('x'.repeat(2000));
});

test('4. remove a photo, Save & exit, resume, submit: only the kept photo is sent', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  const row = page.locator('div.py-2\\.5').filter({ has: page.locator('input[type=file]') }).first();
  await row.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await row.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(row.getByText(/KB · tap to view/)).toHaveCount(2);
  await row.getByRole('button', { name: /^Remove / }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row.getByText(/KB · tap to view/)).toHaveCount(1);
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await page.getByRole('button', { name: 'Save and exit to Incomplete surveys' }).click();
  await page.getByRole('button', { name: 'Resume' }).first().click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  const before = await devState();
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  expect((await devState()).files).toBe(before.files + 1);
  // The removed photo's bytes were dropped when the survey was queued.
  const left = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('mqi-v2');
        open.onsuccess = () => {
          const req = open.result.transaction('photos').objectStore('photos').count();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );
  expect(left).toBe(1);
});

test('5. Submit tapped twice: the survey is written once', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const s = page.locator('select');
  for (const [i, v] of ['Solar', 'NO', 'RCC', 'YES', 'Ladder', 'Provided', 'Yes', 'Yes'].entries()) await s.nth(i).selectOption(v);
  await page.locator('input[type=checkbox]').last().check();
  await page.getByRole('button', { name: 'Submit survey' }).dblclick();
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  await page.waitForTimeout(3_000);
  expect(rowsOf(await devState(), id)).toHaveLength(1);
});

// 6. Killed the instant Submit is tapped (repeated: the race only shows now and then). Before W51 the
// draft left behind could be seconds old — in the probe it had lost the Roof location.
for (let run = 1; run <= 6; run++)
  test(`6.${run} leaving the instant Submit is tapped: the survey is queued or kept as a draft, complete either way`, async ({ context, page }) => {
    test.setTimeout(120_000);
    await installAndSignIn(page);
    await context.setOffline(true);
    await startSurvey(page, /^OGS Trust Campus South West/);
    await addRoof(page);
    await reviewAndSubmit(page);
    await page.goto('/?tab=sync'); // at once, as a kill would
    const found = await page.evaluate(
      () =>
        new Promise<{ drafts: number[]; queued: number[] }>((resolve) => {
          const open = indexedDB.open('mqi-v2');
          open.onsuccess = () => {
            const tx = open.result.transaction(['drafts', 'surveys'], 'readonly');
            const d = tx.objectStore('drafts').getAll();
            const q = tx.objectStore('surveys').getAll();
            tx.oncomplete = () =>
              resolve({
                drafts: d.result.map((x: { state: { scoring: { locations: unknown[] } } }) => x.state.scoring.locations.length),
                queued: q.result.map((x: { survey: { locations: unknown[] } }) => x.survey.locations.length),
              });
          };
        }),
    );
    expect([...found.drafts, ...found.queued]).toEqual([1]);
  });
