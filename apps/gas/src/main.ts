/// <reference types="google-apps-script" />
import { API_VERSION } from '@mqi/shared';

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

export function doPost(): GoogleAppsScript.Content.TextOutput {
  return json({ ok: false, error: { code: 'INTERNAL', message: 'Not implemented yet.' }, serverTime: new Date().toISOString() });
}

export function doGet(): GoogleAppsScript.Content.TextOutput {
  return json({ ok: true, service: 'tcf-mqi-api', apiVersion: API_VERSION, time: new Date().toISOString() });
}

export function setup(): void {}

export function benchmarkPasswordHash(): void {}
