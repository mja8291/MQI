import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addRoof, devState, installAndSignIn, lastSurveyId, reopen, reviewAndSubmit, rowsOf, scoreEverything, startSurvey } from './helpers';

/**
 * W52 (reported 2026-11-03): a surveyor picked "Female Staff Toilet" for two toilets. Names come from
 * a fixed list, nothing stopped the repeat, and Submit then refused the survey ("Two locations are
 * both named …") with no way to rename. Now the second is numbered, and surveys already saved with a
 * repeated name are repaired when they open.
 */

/** On the Ground floor's location-type page: adds a toilet with this name, scored Good/OK, and saves it. */
async function addToilet(page: Page, name: string, expectNote?: string): Promise<void> {
  await page.getByRole('button', { name: /Toilet/ }).click();
  await page.locator('select').first().selectOption(name);
  if (expectNote) await expect(page.getByText(expectNote)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByText("Tap the type of location you're scoring.")).toBeVisible();
}

test('W52: a second "Girls Toilet" is saved as "Girls Toilet 2" and the survey submits', async ({ page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await page.getByRole('button', { name: /^Ground/ }).click();
  await addToilet(page, 'Girls Toilet');
  await addToilet(page, 'Girls Toilet', '"Girls Toilet" is already in this survey, so this one will be saved as "Girls Toilet 2".');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(3);
  expect(rowsOf(await devState(), id).map((r) => r['Location Name']).sort()).toEqual(['Girls Toilet', 'Girls Toilet 2', 'Roof 1']);
});

test('W52: a survey already saved with two locations of one name is repaired when it opens, and submits', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await page.getByRole('button', { name: /^Ground/ }).click();
  await addToilet(page, 'Female Staff Toilet');
  await page.waitForTimeout(1_500); // autosave
  await page.close({ runBeforeUnload: false });

  // What the surveyor's phone held: the same name twice (as an older version allowed).
  const p = await reopen(context, [], '/?tab=incomplete');
  await p.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mqi-v2');
        open.onsuccess = () => {
          const tx = open.result.transaction('drafts', 'readwrite');
          const store = tx.objectStore('drafts');
          const req = store.getAll();
          req.onsuccess = () => {
            const d = req.result[0];
            const toilet = d.state.scoring.locations.find((l: { name: string }) => l.name === 'Female Staff Toilet');
            d.state.scoring.locations.push({ ...toilet, id: `${toilet.id}-second`, floorLevel: 'First' });
            delete d.writer;
            store.put(d);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await p.reload();
  const resume = p.getByRole('button', { name: 'Resume' }).first();
  if (await resume.isVisible().catch(() => false)) await resume.click();
  await expect(p.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  await reviewAndSubmit(p);
  await expect(p.getByText(/Two locations are both named/)).toHaveCount(0);
  const id = await lastSurveyId(p);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(3);
  expect(rowsOf(await devState(), id).map((r) => r['Location Name']).sort()).toEqual(['Female Staff Toilet', 'Female Staff Toilet 2', 'Roof 1']);
});
