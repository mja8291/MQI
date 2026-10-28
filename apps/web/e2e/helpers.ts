import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Shared steps for the end-to-end suites (production build + the dev API's fake sheet). */

export const API = 'http://localhost:8787';
export const PHOTO = fileURLToPath(new URL('../public/icons/icon-192.png', import.meta.url));
export const PASSWORD = 'mqi-dev-pass-1';

export interface DevState {
  responses: Record<string, string | number>[];
  attachments: Record<string, string | number>[];
  files: number;
}
export const devState = async (): Promise<DevState> => (await (await fetch(`${API}/__dev/state`)).json()) as DevState;

/** Test-only network faults on the dev API (apps/gas/src/dev/server.ts). Reset with faults({}). */
export async function faults(f: { fail?: number; dropAfterWrite?: number; delayMs?: number; actions?: string[] }): Promise<void> {
  await fetch(`${API}/__dev/faults`, { method: 'POST', body: JSON.stringify(f) });
}

export const rowsOf = (s: DevState, surveyId: string) => s.responses.filter((r) => r['Survey ID'] === surveyId);
export const photoRowsOf = (s: DevState, surveyId: string) => s.attachments.filter((r) => r['Survey ID'] === surveyId && r['Photo URL']);

/** Online: sign in, let the service worker take control, and wait until the phone is ready offline. */
export async function installAndSignIn(page: Page, email = 'surveyor@tcf.test'): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Start new survey' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload(); // now controlled by the service worker
  // W31: the campus list is saved at sign-in, without opening Start new survey.
  await expect(page.getByText(/Ready to work offline/)).toBeVisible({ timeout: 20_000 });
}

/** Opens a fresh page at Home — the "kill and reopen the app" step. */
export async function reopen(context: BrowserContext, errors: string[], url = '/'): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return page;
}

export async function scoreEverything(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Save Selection and Return' })).toBeVisible();
  for (const section of ['Safety', 'Functionality', 'Aesthetics']) {
    const header = page.getByRole('button', { name: new RegExp(`^${section}`) });
    if ((await header.count()) === 0) continue;
    const box = page.locator('div.rounded-2xl', { has: header });
    const pills = box.getByRole('button', { name: /^(Good|OK|Roof Access Available)$/ });
    if ((await pills.count()) === 0) await header.click();
    await expect(pills.first()).toBeVisible();
    const n = await pills.count();
    for (let i = 0; i < n; i++) await pills.nth(i).click();
    await expect(header).toContainText(/(\d+) of \1 scored/);
  }
}

/** Find school → details → levels, landing on the Floor level page. */
export async function startSurvey(page: Page, campus: RegExp): Promise<void> {
  await page.getByRole('link', { name: 'Start new survey' }).click();
  await page.getByPlaceholder('Start typing a campus name').fill('OGS');
  await page.getByRole('button', { name: campus }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Start survey/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // Applicable levels: defaults
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
}

/** Roof location, every item OK/Good, one photo, drilling check "NO". Returns to the Floor level page. */
export async function addRoof(page: Page, withPhoto = true): Promise<void> {
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);
  if (withPhoto) {
    await page.locator('input[type=file][capture]').first().setInputFiles(PHOTO);
    await expect(page.getByText(/KB · tap to view/).first()).toBeVisible();
  }
  await page.locator('select').first().selectOption('NO');
  await page.getByRole('button', { name: 'Save Selection and Return' }).click();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeVisible();
}

/** Answers every Review question (roof clean = Yes, so no extra photo) and submits. */
export async function reviewAndSubmit(page: Page, { expectFewConfirm = true } = {}): Promise<void> {
  await page.getByRole('button', { name: 'Review and submit' }).click();
  if (expectFewConfirm) await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const s = page.locator('select');
  await s.nth(0).selectOption('Solar');
  await s.nth(1).selectOption('NO');
  await s.nth(2).selectOption('RCC');
  await s.nth(3).selectOption('YES');
  await s.nth(4).selectOption('Ladder');
  await s.nth(5).selectOption('Provided');
  await s.nth(6).selectOption('Yes');
  await s.nth(7).selectOption('Yes');
  await page.locator('input[type=checkbox]').last().check();
  await page.getByRole('button', { name: 'Submit survey' }).click();
}

/** The survey id from the Done screen's URL, or from Sync Pending if it moved on. */
export async function lastSurveyId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('mqi-v2');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('surveys').objectStore('surveys').getAll();
          req.onsuccess = () => {
            const all = (req.result as { id: string; createdAt: string }[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            resolve(all[0]?.id ?? '');
          };
        };
      }),
  );
}
