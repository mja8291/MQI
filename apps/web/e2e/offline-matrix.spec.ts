import { expect, test } from '@playwright/test';
import {
  API,
  PASSWORD,
  PHOTO,
  addRoof,
  devState,
  faults,
  installAndSignIn,
  lastSurveyId,
  photoRowsOf,
  reopen,
  reviewAndSubmit,
  rowsOf,
  scoreEverything,
  startSurvey,
} from './helpers';

/**
 * Offline assurance (2026-10-29): the app must work with no signal from the moment it has been
 * opened once online, and every submitted survey must reach the sheet exactly once — through
 * reloads, kills, dropped connections, lost answers, expired sessions and a second open tab.
 * Production build, service worker on, dev API with injectable faults.
 */

test.describe.configure({ mode: 'serial' });
test.afterEach(async () => {
  await faults({});
});

test('1. cold start with no signal: every screen works, then the survey syncs exactly once', async ({ context, page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installAndSignIn(page);
  await page.close();

  // --- no signal from here; the app is opened from cold ---
  await context.setOffline(true);
  let p = await reopen(context, errors);
  await expect(p.getByText(/Signed in as Dev Surveyor/)).toBeVisible();
  await expect(p.getByText(/Ready to work offline/)).toBeVisible();

  // Find school from the saved list; details; levels — all offline.
  await p.getByRole('link', { name: 'Start new survey' }).click();
  await expect(p.getByText('Offline — showing the last saved campus list.')).toBeVisible({ timeout: 20_000 });
  await p.getByPlaceholder('Start typing a campus name').fill('OGS');
  await p.getByRole('button', { name: /^OGS Trust Campus II/ }).click();
  await expect(p.getByText(/Gadap Compound/)).toBeVisible(); // campus card from the saved list
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByPlaceholder('Your name')).toHaveValue('Dev Surveyor');
  await p.getByRole('button', { name: /Start survey/ }).click();
  await p.getByRole('button', { name: 'Continue' }).click();

  // Roof with photo + drilling.
  await addRoof(p);

  // Ground → Girls Toilet: Column + Wall Unsafe, photo, view, delete, attach again.
  await p.getByRole('button', { name: /^Ground/ }).click();
  await p.getByRole('button', { name: /Toilet/ }).click();
  await p.locator('select').first().selectOption('Girls Toilet');
  await p.getByRole('button', { name: 'Continue' }).click();
  await scoreEverything(p);
  const wall = p.locator('div.py-2\\.5', { hasText: 'Wall/Column Condition' });
  if ((await wall.getByRole('button', { name: 'Column Unsafe' }).count()) === 0) {
    await p.getByRole('button', { name: /^Safety/ }).click();
  }
  await wall.getByRole('button', { name: 'Column Unsafe' }).click();
  await wall.getByRole('button', { name: 'Wall Unsafe' }).click();
  await expect(wall.getByText(/Marked Unsafe/)).toBeVisible();
  await wall.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await wall.getByRole('button', { name: /^View / }).click();
  await p.getByRole('button', { name: 'Delete photo' }).click();
  await p.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(wall.getByText(/Marked Unsafe/)).toBeVisible();
  await wall.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(wall.getByText(/Marked Unsafe/)).toHaveCount(0);

  // W41: Column Unsafe → crack > 3 mm → Schmidt Hammer available → reading + photo, all required.
  await p.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(p.getByText('Answer whether the column crack is wider than 3 mm.').last()).toBeVisible();
  await p.getByLabel('Is the crack width more than 3 mm?').selectOption('YES');
  await p.getByLabel('Is a Schmidt Hammer available?').selectOption('YES');
  await p.getByLabel('Schmidt Hammer reading').fill('32');
  await p.locator('#photo_camera_Schmidt_Hammer_Test').setInputFiles(PHOTO);
  await expect(p.getByText(/KB · tap to view/)).toHaveCount(2); // wall + Schmidt on this page

  // Reload in the middle of scoring (offline): the location comes back intact.
  await p.waitForTimeout(2500);
  await p.reload();
  await expect(p.getByText(/Ground — Toilet — Girls Toilet/)).toBeVisible();
  await p.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(p.getByText('Ground floor')).toBeVisible();

  // Leaving a floor with < 2 locations asks first (W26).
  await p.getByRole('button', { name: 'Back' }).click();
  await p.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(p.getByRole('button', { name: 'Review and submit' })).toBeVisible();

  // Kill and reopen offline: lands back in the survey.
  await p.waitForTimeout(2500);
  await p.close();
  p = await reopen(context, errors);
  await expect(p).toHaveURL(/\/survey\/locations$/);

  // Review offline: draft Excel and PDF downloads work with no signal.
  await p.getByRole('button', { name: 'Review and submit' }).click();
  await p.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(p.getByText(/Items covered/)).toBeVisible();
  const excel = p.waitForEvent('download');
  await p.getByRole('button', { name: /Excel/ }).first().click();
  expect((await excel).suggestedFilename()).toMatch(/\.xlsx$/);
  const pdf = p.waitForEvent('download');
  await p.getByRole('button', { name: /PDF/ }).first().click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  await p.reload(); // a reload on Review keeps the answers so far
  await expect(p.getByText(/Items covered/)).toBeVisible();

  const before = await devState();
  const s = p.locator('select');
  await s.nth(0).selectOption('Solar');
  await s.nth(1).selectOption('NO');
  await s.nth(2).selectOption('RCC');
  await s.nth(3).selectOption('YES');
  await s.nth(4).selectOption('Ladder');
  await s.nth(5).selectOption('Provided');
  await s.nth(6).selectOption('Yes');
  await s.nth(7).selectOption('Yes');
  await p.locator('input[type=checkbox]').last().check();
  await p.getByRole('button', { name: 'Submit survey' }).click();
  await expect(p).toHaveURL(/tab=sync/);
  await expect(p.getByText('Not uploaded yet — weak or no connection')).toBeVisible();
  const id = await lastSurveyId(p);

  // Kill again while waiting; reopen offline: the reminder and the badge are there.
  await p.close();
  p = await reopen(context, errors);
  await expect(p.getByText(/1 submitted survey still to upload/)).toBeVisible();
  expect((await devState()).responses.length).toBe(before.responses.length);

  // Signal back: it goes by itself, exactly once.
  await context.setOffline(false);
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(3);
  const after = await devState();
  expect(rowsOf(after, id)).toHaveLength(2);
  expect(rowsOf(after, id).find((r) => r['Location Name'] === 'Girls Toilet')?.['Wall/Column Condition i.e. cracks']).toBe('Column Unsafe, Wall Unsafe');
  expect(after.files).toBe(before.files + 3);
  const toilet = rowsOf(after, id).find((r) => r['Location Name'] === 'Girls Toilet')!;
  expect([toilet['Column Crack > 3 mm'], toilet['Schmidt Hammer Available'], String(toilet['Schmidt Hammer Reading'])]).toEqual(['YES', 'YES', '32']);
  expect(photoRowsOf(after, id).map((r) => r['Item Name'])).toContain('Schmidt Hammer Test');
  await p.reload();
  await p.getByRole('tab', { name: /Sync Pending/ }).click();
  await expect(p.getByText('Nothing waiting to sync')).toBeVisible({ timeout: 30_000 });
  const again = await devState();
  expect(again.responses.length).toBe(after.responses.length);
  expect(again.files).toBe(after.files);
  expect(errors).toEqual([]);
});

test('2. flaky connection: dropped requests and lost answers never duplicate or lose data', async ({ page }) => {
  test.setTimeout(240_000);
  await installAndSignIn(page);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  const before = await devState();
  // The first push never arrives; the second is saved but its answer is lost; the photo upload
  // is dropped twice and its first success loses its answer too.
  await faults({ fail: 1, dropAfterWrite: 1, actions: ['sync.push'] });
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 90_000 }).toBe(1);
  await faults({ fail: 2, dropAfterWrite: 1, actions: ['files.upload'] });
  await page.goto('/?tab=sync');
  for (let i = 0; i < 6 && photoRowsOf(await devState(), id).length === 0; i++) {
    await page.getByRole('button', { name: /Sync now/ }).click().catch(() => undefined);
    await page.waitForTimeout(3000);
  }
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 90_000 }).toBe(1);
  await expect(page.getByText('Nothing waiting to sync')).toBeVisible({ timeout: 60_000 });
  const after = await devState();
  expect(rowsOf(after, id)).toHaveLength(1);
  expect(after.files).toBe(before.files + 1);
});

test('3. killed the instant Submit is tapped: the survey is either still a draft or queued — never lost, never both', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page, false);
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const s = page.locator('select');
  for (const [i, v] of ['Solar', 'NO', 'RCC', 'YES', 'Ladder', 'Provided', 'Yes', 'Yes'].entries()) await s.nth(i).selectOption(v);
  await page.locator('input[type=checkbox]').last().check();
  await page.getByRole('button', { name: 'Submit survey' }).click({ noWaitAfter: true });
  await page.close({ runBeforeUnload: false });
  const p = await reopen(context, errors, '/?tab=incomplete');
  const counts = await p.evaluate(
    () =>
      new Promise<{ drafts: number; queued: number }>((resolve) => {
        const open = indexedDB.open('mqi-v2');
        open.onsuccess = () => {
          const tx = open.result.transaction(['drafts', 'surveys'], 'readonly');
          const d = tx.objectStore('drafts').count();
          const q = tx.objectStore('surveys').count();
          tx.oncomplete = () => resolve({ drafts: d.result, queued: q.result });
        };
      }),
  );
  expect(counts.drafts + counts.queued).toBe(1);
  const before = await devState();
  await context.setOffline(false);
  if (counts.queued === 1) {
    const id = await lastSurveyId(p);
    await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
  } else {
    expect((await devState()).responses.length).toBe(before.responses.length); // a draft is never sent
  }
});

test('4. big survey offline: 40 locations and 60 photos sync exactly once', async ({ context, page }) => {
  test.setTimeout(900_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page, false);
  let photos = 0;
  const started = Date.now();
  for (let n = 1; n < 40; n++) {
    const floor = n % 2 ? 'Ground' : 'First';
    // The floor button ("Ground", or "Ground 3 locations recorded"), not a recorded location.
    await page.getByRole('button', { name: new RegExp(`^${floor}( \\d+ locations? recorded)?$`) }).click();
    // The location-type card ("3 Corridor & Stairs"), not a recorded corridor.
    await page.getByRole('button', { name: /^\d+ Corridor & Stairs$/ }).click();
    await scoreEverything(page);
    const want = n <= 21 ? 2 : 1; // 39 corridors: 21×2 + 18×1 = 60 photos
    const inputs = page.locator('input[type=file][capture]');
    for (let k = 0; k < want; k++) {
      await inputs.nth(k).setInputFiles(PHOTO);
      photos++;
    }
    await expect(page.getByText(/KB · tap to view/)).toHaveCount(want);
    await page.getByRole('button', { name: 'Save Selection and Return' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    const leave = page.getByRole('button', { name: 'Proceed anyway' });
    if (await leave.isVisible().catch(() => false)) await leave.click();
    await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
  }
  const perLocationMs = (Date.now() - started) / 40;
  await expect(page.getByText(/Locations recorded \(40\)/)).toBeVisible();
  expect(photos).toBe(60);

  const before = await devState();
  await reviewAndSubmit(page, { expectFewConfirm: false });
  await expect(page).toHaveURL(/tab=sync/);
  const id = await lastSurveyId(page);
  await context.setOffline(false);
  const t0 = Date.now();
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 120_000 }).toBe(40);
  const dataMs = Date.now() - t0;
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 600_000, intervals: [2000] }).toBe(60);
  const allMs = Date.now() - t0;
  const after = await devState();
  expect(after.files).toBe(before.files + 60);
  console.log(`big survey: ${Math.round(perLocationMs)} ms per location (test clicks), data synced in ${dataMs} ms, all 60 photos in ${allMs} ms`);
});

test('5. session expired while surveys wait: nothing lost; it sends after signing in again', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page, false);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  // Meanwhile the user is signed out everywhere (another phone: "Sign out everywhere").
  const login = (await (await fetch(`${API}/api`, { method: 'POST', body: JSON.stringify({ action: 'auth.login', apiVersion: 1, payload: { email: 'surveyor@tcf.test', password: PASSWORD } }) })).json()) as {
    data: { sessionToken: string };
  };
  await fetch(`${API}/api`, { method: 'POST', body: JSON.stringify({ action: 'auth.logoutAll', apiVersion: 1, auth: { session: login.data.sessionToken }, payload: {} }) });
  await context.setOffline(false);
  await expect(page).toHaveURL(/signin/, { timeout: 60_000 });
  expect(rowsOf(await devState(), id)).toHaveLength(0);
  await page.getByPlaceholder('you@example.com').fill('surveyor@tcf.test');
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(async () => rowsOf(await devState(), id).length, { timeout: 60_000 }).toBe(1);
});

test('6. two tabs open when the signal returns: each survey is written once', async ({ context, page }) => {
  test.setTimeout(180_000);
  await installAndSignIn(page);
  await context.setOffline(true);
  await startSurvey(page, /^OGS Trust Campus South West/);
  await addRoof(page);
  await reviewAndSubmit(page);
  const id = await lastSurveyId(page);
  const second = await context.newPage();
  await second.goto('/?tab=sync');
  await faults({ delayMs: 1500 });
  await context.setOffline(false); // both tabs get the online event at once
  await expect.poll(async () => photoRowsOf(await devState(), id).length, { timeout: 90_000 }).toBe(1);
  await second.waitForTimeout(5000);
  const s = await devState();
  expect(rowsOf(s, id)).toHaveLength(1);
  expect(photoRowsOf(s, id)).toHaveLength(1);
});

test('7. dashboard opened offline shows the last figures instead of an error', async ({ context, page }) => {
  await installAndSignIn(page);
  await page.getByRole('link', { name: 'View dashboard' }).click();
  await expect(page.getByText(/Schools in scope|captured|Captured/i).first()).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Schools in scope|captured|Captured/i).first()).toBeVisible({ timeout: 20_000 });
});
