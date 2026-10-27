/**
 * Builds the golden fixtures (tools/fixtures/data/*.json) from production data, read-only.
 *
 *   npm run export -w @mqi/fixtures -- --xlsx tools/fixtures/raw/MQI-Analysis.xlsx
 *       a copy of the production responses spreadsheet downloaded as .xlsx (File → Download)
 *   npm run export -w @mqi/fixtures -- --api <exec url> --session <token>
 *       the export.rows action of a deployed API (Reviewer or Admin session)
 *
 * Neither path writes anything to Google.
 */
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_VERSION, METHOD1_TAB, METHOD2_TAB } from '@mqi/shared';
import type { ExportRowsResult } from '@mqi/shared';
import { method1Fixtures, method2Fixtures, rowsFromGrid } from './convert';

const OUT = resolve(import.meta.dirname, '../data');

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

async function gridFromApi(url: string, session: string, tab: string): Promise<string[][]> {
  const grid: string[][] = [];
  for (let offset = 0; ; ) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'export.rows', apiVersion: API_VERSION, auth: { session }, payload: { tab, offset, limit: 1000 } }),
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
  const grid = (tab: string) =>
    xlsx ? gridFromXlsx(resolve(xlsx), tab) : api && session ? gridFromApi(api, session, tab) : Promise.reject(new Error('Pass --xlsx <file> or --api <url> --session <token>'));

  const m2 = method2Fixtures(rowsFromGrid(await grid(METHOD2_TAB)));
  const m1 = method1Fixtures(rowsFromGrid(await grid(METHOD1_TAB)));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'method2.json'), JSON.stringify(m2, null, 1) + '\n');
  writeFileSync(resolve(OUT, 'method1.json'), JSON.stringify(m1, null, 1) + '\n');
  const versions = (xs: { rubricVersion: string }[]) =>
    Object.entries(xs.reduce<Record<string, number>>((a, x) => ({ ...a, [x.rubricVersion || '(blank)']: (a[x.rubricVersion || '(blank)'] ?? 0) + 1 }), {}));
  console.log(`Method 2: ${m2.length} surveys`, versions(m2));
  console.log(`Method 1: ${m1.length} surveys`, versions(m1));
}

await main();
