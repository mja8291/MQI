/**
 * Builds the golden fixtures (tools/fixtures/data/*.json) from production data, read-only.
 *
 *   npm run export -w @mqi/fixtures -- --xlsx tools/fixtures/raw/MQI-Analysis.xlsx
 *       v1's responses spreadsheet (MQI Analysis) downloaded as .xlsx (File → Download)
 *   npm run export -w @mqi/fixtures -- --api <exec url> --session <token>
 *       the export.rows action of a deployed API (Reviewer or Admin session)
 *
 * Neither path writes anything to Google.
 */
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_VERSION, RESPONSES_TAB } from '@mqi/shared';
import type { ExportRowsResult } from '@mqi/shared';
import { surveyFixtures, rowsFromGrid } from './convert';

const OUT = resolve(import.meta.dirname, '../data');
/** The responses tab's name in v1's spreadsheet (MQI Analysis); v2's own spreadsheet calls it RESPONSES_TAB. */
const V1_RESPONSES_TAB = 'Method 2 Responses';

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
  }
  return String(v);
}

async function gridFromXlsx(path: string, tab: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(tab);
  if (!ws) return [];
  const grid: string[][] = [];
  const width = ws.columnCount;
  ws.eachRow({ includeEmpty: false }, (row) => {
    grid.push(Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value)));
  });
  return grid;
}

async function gridFromApi(url: string, session: string): Promise<string[][]> {
  const grid: string[][] = [];
  for (let offset = 0; ; ) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'export.rows', apiVersion: API_VERSION, auth: { session }, payload: { offset, limit: 1000 } }),
    });
    const body = (await res.json()) as { ok: boolean; data: ExportRowsResult; error?: { message: string } };
    if (!body.ok) throw new Error(body.error?.message ?? 'export.rows failed');
    if (offset === 0) grid.push(body.data.header);
    grid.push(...body.data.rows.map((r) => r.map(String)));
    if (!body.data.hasMore) break;
    offset += body.data.rows.length;
  }
  return grid;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const xlsx = opt('--xlsx');
  const api = opt('--api');
  const session = opt('--session');
  // An .xlsx of v1's spreadsheet has the v1 tab name; one of v2's has RESPONSES_TAB.
  const fromXlsx = async (path: string) => {
    const v1 = await gridFromXlsx(path, V1_RESPONSES_TAB);
    return v1.length ? v1 : gridFromXlsx(path, RESPONSES_TAB);
  };
  const grid = xlsx
    ? await fromXlsx(resolve(xlsx))
    : api && session
      ? await gridFromApi(api, session)
      : await Promise.reject(new Error('Pass --xlsx <file> or --api <url> --session <token>'));

  const surveys = surveyFixtures(rowsFromGrid(grid));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'surveys.json'), JSON.stringify(surveys, null, 1) + '\n');
  const versions = (xs: { rubricVersion: string }[]) =>
    Object.entries(xs.reduce<Record<string, number>>((a, x) => ({ ...a, [x.rubricVersion || '(blank)']: (a[x.rubricVersion || '(blank)'] ?? 0) + 1 }), {}));
  console.log(`${surveys.length} surveys`, versions(surveys));
}

await main();
