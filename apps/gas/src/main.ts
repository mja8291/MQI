/// <reference types="google-apps-script" />
import { z } from 'zod';
import { API_VERSION, RUBRIC_VERSION } from '@mqi/shared';
import { createGasEnv, gasCrypto, gasProps } from './adapters/gas';
import { hashPassword } from './core/auth';
import { PROP } from './core/context';
import type { Env } from './core/ports';
import { handleRequest } from './core/router';
import { SCHEMA_VERSION, setupCore, upgradeIfNeeded } from './core/setup';

// Apps Script's V8 may disallow dynamic code generation; use Zod's interpreter path.
z.config({ jitless: true });

/** The v2 Drive root given by the product owner (docs/migration-plan.md §7a). */
const DEFAULT_V2_ROOT = '1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm';

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/** All API calls: POST, Content-Type text/plain, JSON body (no CORS preflight). Always HTTP 200. */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  if (!gasProps.get(PROP.SYSTEM_SPREADSHEET_ID) || !gasProps.get(PROP.RESPONSES_SPREADSHEET_ID)) {
    return json({ ok: false, error: { code: 'INTERNAL', message: 'The server is not set up yet. Run setup() in the Apps Script editor.' }, serverTime: new Date().toISOString(), rubricVersion: RUBRIC_VERSION, requestId: '' });
  }
  const env = createGasEnv();
  upgradeIfNeeded(env);
  return json(handleRequest(env, e?.postData?.contents ?? ''));
}

/** Health check (no data). */
export function doGet(): GoogleAppsScript.Content.TextOutput {
  return json({
    ok: true,
    service: 'tcf-mqi-api',
    env: gasProps.get(PROP.ENV_NAME),
    apiVersion: API_VERSION,
    rubricVersion: RUBRIC_VERSION,
    schemaVersion: gasProps.get(PROP.SCHEMA_VERSION),
    deployedSchema: SCHEMA_VERSION,
    time: new Date().toISOString(),
  });
}

function folderIn(parent: GoogleAppsScript.Drive.Folder, name: string): GoogleAppsScript.Drive.Folder {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * Run once from the Apps Script editor as tcfengineeringdepartment@gmail.com, after setting
 * ENV_NAME (staging | production), SCHOOLS_SPREADSHEET_ID and ADMIN_EMAIL / ADMIN_NAME, plus
 * RESPONSES_SPREADSHEET_ID for production (staging copies it, see below). Safe to re-run.
 *
 *   <v2 root>/01 Production | 02 Staging / MQI v2 System, Survey Photos/
 *   <v2 root>/03 Backups, 04 Exports
 *
 * Staging: if RESPONSES_SPREADSHEET_ID is unset and SOURCE_RESPONSES_SPREADSHEET_ID is set, the
 * production responses spreadsheet is copied (read) into 02 Staging and used from then on.
 */
export function setup(): void {
  const p = gasProps;
  const envName = p.get(PROP.ENV_NAME);
  if (envName !== 'staging' && envName !== 'production') throw new Error('Set the script property ENV_NAME to "staging" or "production" first.');
  if (!p.get(PROP.SCHOOLS_SPREADSHEET_ID)) throw new Error('Set the script property SCHOOLS_SPREADSHEET_ID first.');
  if (!p.get(PROP.V2_ROOT_FOLDER_ID)) p.set(PROP.V2_ROOT_FOLDER_ID, DEFAULT_V2_ROOT);
  const root = DriveApp.getFolderById(p.get(PROP.V2_ROOT_FOLDER_ID)!);
  const envFolder = folderIn(root, envName === 'production' ? '01 Production' : '02 Staging');
  folderIn(root, '03 Backups');
  folderIn(root, '04 Exports');
  const suffix = envName === 'production' ? '' : ' (STAGING)';

  if (!p.get(PROP.RESPONSES_SPREADSHEET_ID)) {
    const source = p.get('SOURCE_RESPONSES_SPREADSHEET_ID');
    if (envName !== 'staging' || !source) throw new Error('Set RESPONSES_SPREADSHEET_ID (production) or SOURCE_RESPONSES_SPREADSHEET_ID (staging) first.');
    const copy = DriveApp.getFileById(source).makeCopy(`MQI Responses${suffix}`, envFolder);
    p.set(PROP.RESPONSES_SPREADSHEET_ID, copy.getId());
    console.log(`Copied the responses spreadsheet for staging: ${copy.getUrl()}`);
  }
  if (!p.get(PROP.SYSTEM_SPREADSHEET_ID)) {
    const ss = SpreadsheetApp.create(`MQI v2 System${suffix}`);
    ss.setSpreadsheetTimeZone('Asia/Karachi');
    DriveApp.getFileById(ss.getId()).moveTo(envFolder);
    p.set(PROP.SYSTEM_SPREADSHEET_ID, ss.getId());
    console.log(`Created ${ss.getUrl()}`);
  }
  if (!p.get(PROP.PHOTOS_FOLDER_ID)) {
    const photos = folderIn(envFolder, 'Survey Photos');
    p.set(PROP.PHOTOS_FOLDER_ID, photos.getId());
    console.log(`Photos folder ${photos.getUrl()}`);
  }
  for (const line of setupCore(createGasEnv())) console.log(line);
}

/**
 * Run from the editor: times PBKDF2 at increasing iteration counts and stores the highest that
 * keeps the hashing part of auth.login under ~2.2 s (leaving room for the sheet reads within
 * ~3 s). Record the printed table in the README.
 */
export function benchmarkPasswordHash(): void {
  const env = { crypto: gasCrypto, props: gasProps } as unknown as Env;
  const salt = gasCrypto.randomBytes(16);
  let best = 1000;
  for (const n of [1000, 1500, 2000, 2500, 3000, 4000, 5000]) {
    const t0 = Date.now();
    hashPassword(env, 'benchmark-password', salt, n);
    const ms = Date.now() - t0;
    console.log(`${n} iterations: ${ms} ms`);
    if (ms <= 2200) best = n;
    else break;
  }
  gasProps.set(PROP.PBKDF2_ITERATIONS, String(best));
  console.log(`PBKDF2_ITERATIONS set to ${best}. Existing passwords keep their own count until next changed.`);
}
