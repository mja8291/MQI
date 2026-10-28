import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Phase 4 exit: a full survey completed offline with photos, the page reloaded, the app killed
 * and reopened, then synced exactly once — no duplicate rows (checked on the dev API's fake sheet).
 * Runs on the production build with the service worker on.
 */

const API = 'http://localhost:8787';
const PHOTO = fileURLToPath(new URL('../public/icons/icon-192.png', import.meta.url));

interface DevState {
  responses: Record<string, string | number>[];
  attachments: Record<string, string | number>[];
  files: number;
}
const devState = async (): Promise<DevState> => (await (await fetch(`${API}/__dev/state`)).json()) as DevState;

async function scoreEverything(page: Page) {
  // The scoring page is a lazy route: wait for it before looking for its sections.
  await expect(page.getByRole('button', { name: 'Save Selection and Return' })).toBeVisible();
  for (const section of ['Safety', 'Functionality', 'Aesthetics']) {
    const header = page.getByRole('button', { name: new RegExp(`^${section}`) });
    const box = page.locator('div.rounded-2xl', { has: header });
    const pills = box.getByRole('button', { name: /^(Good|OK|Roof Access Available)$/ });
    if ((await pills.count()) === 0) await header.click();
    await expect(pills.first()).toBeVisible();
    const n = await pills.count();
    for (let i = 0; i < n; i++) await pills.nth(i).click();
    await expect(header).toContainText(/(\d+) of \1 scored/);
  }
}

test('offline survey with photos survives reload and kill, then syncs exactly once', async ({ context, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- online: sign in, let the service worker install, cache the school list ---
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill('surveyor@tcf.test');
  await page.getByPlaceholder('Your password').fill('mqi-dev-pass-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Start new survey' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload(); // page now controlled by the service worker
  await page.getByRole('link', { name: 'Start new survey' }).click();
  await expect(page.getByRole('combobox').first()).toContainText('South West');
  const before = await devState();

  // --- offline from here on ---
  await context.setOffline(true);
  await page.getByPlaceholder('Start typing a campus name').fill('OGS');
  await page.getByRole('button', { name: /^OGS Trust Campus South West/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // W11: the surveyor's own name is filled in as the first engineering staff member.
  await expect(page.getByPlaceholder('Your name')).toHaveValue('Dev Surveyor');
  await page.getByRole('button', { name: '+ Add accompanying staff' }).click();
  await page.getByPlaceholder('Name of accompanying staff').fill('APM Two');
  await page.getByPlaceholder('Admin and support manager').fill('ASM One');
  await page.getByPlaceholder("School principal's name").fill('Principal One');
  await page.getByRole('button', { name: /Start survey/ }).click();

  // W24: applicable levels — External always, Ground/First/Roof by default; untick First.
  await expect(page.getByRole('checkbox', { name: /External/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('checkbox', { name: /First/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'First', exact: true })).toHaveCount(0);

  // Location 1: Roof, with a photo on one item, and the drilling check (W27) answered here.
  await page.getByRole('button', { name: 'Roof', exact: true }).click();
  await scoreEverything(page);
  await page.locator('input[type=file][capture]').first().setInputFiles(PHOTO);
  await expect(page.getByText(/\d+ KB · tap to view/)).toBeVisible();
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByText('Complete Drilling & observation (thicknesses must be positive numbers).')).toBeVisible();
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByText('Locations recorded (1)', { exact: false })).toBeVisible();

  // A reload offline must bring the survey back (FR-OFF-6).
  await page.reload();
  await expect(page.getByText(/Roof — Roof 1/)).toBeVisible();

  // Location 2: External → Exterior Facade.
  await page.getByRole('button', { name: 'External', exact: true }).click();
  await page.getByRole('button', { name: /Exterior Facade/ }).click();
  await scoreEverything(page);
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  // v1: a saved location on a non-roof floor returns to that floor's location types, with counts.
  await expect(page.getByRole('button', { name: '1 Exterior Facade' })).toBeVisible();

  // "Kill" the app and reopen it at Home: it must land back in the survey (FR-OFF-5).
  await page.waitForTimeout(2500); // past the 2 s autosave debounce
  await page.close();
  const reopened = await context.newPage();
  reopened.on('pageerror', (e) => errors.push(e.message));
  await reopened.goto('/');
  await expect(reopened).toHaveURL(/\/survey\/locations$/);
  await expect(reopened.getByText(/Exterior Facade 1/)).toBeVisible();

  // Review: every Appendix C question; roof not clean → a photo is required.
  await reopened.getByRole('button', { name: 'Review and submit' }).click();
  // W25: fewer than 15 locations asks first.
  await reopened.getByRole('button', { name: 'Proceed anyway' }).click();
  const s = reopened.locator('select');
  await s.nth(0).selectOption('Solar');
  await s.nth(1).selectOption('NO');
  await s.nth(2).selectOption('Unknown'); // W17: new option; the repeated type-of-structure question is gone
  await s.nth(3).selectOption('Somewhere present, somewhere absent'); // W20
  await s.nth(4).selectOption('Ladder');
  await s.nth(5).selectOption('Provided');
  await s.nth(6).selectOption('No');
  await s.nth(7).selectOption('Yes');
  await expect(s).toHaveCount(8); // W27: the drilling check is on the Roof screen now
  await reopened.locator('input[type=file][capture]').first().setInputFiles(PHOTO);
  await reopened.locator('input[type=checkbox]').last().check();
  await reopened.getByRole('button', { name: 'Submit survey' }).click();
  // W29: no connection → straight to Sync Pending, with what to do.
  await expect(reopened).toHaveURL(/tab=sync/);
  await expect(reopened.getByText('Not uploaded yet — weak or no connection')).toBeVisible();
  await expect(reopened.getByText(/Waiting to sync \(1\)/)).toBeVisible();
  expect((await devState()).responses.length).toBe(before.responses.length); // nothing reached the server

  // --- back online: it syncs by itself (online event) ---
  await context.setOffline(false);
  await expect.poll(async () => (await devState()).files, { timeout: 60_000 }).toBe(before.files + 2);
  const after = await devState();
  const rows = after.responses.slice(before.responses.length);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r['Survey ID'])).size).toBe(1);
  expect(rows.map((r) => r['Location Name']).sort()).toEqual(['Exterior Facade 1', 'Roof 1']);
  expect(rows.every((r) => r['Submitter Email'] === 'surveyor@tcf.test' && r['Source App'] === 'v2')).toBe(true);
  expect(rows.every((r) => r['Accompanying Engineering Staff'] === 'Dev Surveyor; APM Two' && r['Suggested Structural Type'] === 'Unknown')).toBe(true);
  expect(rows.every((r) => r['Applicable Levels'] === 'External, Ground, Roof' && Number(r['Items Covered (%)']) > 0)).toBe(true);
  const photoRows = after.attachments.slice(before.attachments.length).filter((r) => r['Photo URL']);
  expect(photoRows).toHaveLength(2);

  // Sync again: nothing more is written.
  await reopened.reload();
  await expect(reopened.getByText('Nothing waiting to sync')).toBeVisible({ timeout: 30_000 });
  const again = await devState();
  expect(again.responses.length).toBe(after.responses.length);
  expect(again.attachments.length).toBe(after.attachments.length);
  expect(again.files).toBe(after.files);
  expect(errors).toEqual([]);
});
