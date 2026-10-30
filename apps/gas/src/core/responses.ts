import { layoutRows, missingColumns } from '@mqi/shared';
import type { SheetRow } from '@mqi/shared';
import type { Env } from './ports';

/**
 * Header-driven access to v1's response tabs (v1 responses.ts): rows are laid out against the
 * tab's real header (case-insensitive), a missing column is added at the end of the header,
 * and nothing is ever renamed, moved or removed.
 */

export function ensureHeader(env: Env, tab: string, desired: readonly string[]): string[] {
  const header = env.responses.header(tab);
  if (header === null || header.length === 0) {
    env.responses.createTab(tab, [...desired]);
    return [...desired];
  }
  const missing = missingColumns(header, desired);
  if (missing.length) {
    env.responses.addColumns(tab, missing);
    return [...header, ...missing];
  }
  return header;
}

/** One atomic RAW append of header-keyed rows. */
export function appendByHeader(env: Env, tab: string, desired: readonly string[], rows: readonly Record<string, string>[]): void {
  if (!rows.length) return;
  const header = ensureHeader(env, tab, [...desired, ...rows.flatMap((r) => Object.keys(r))]);
  env.responses.appendRaw(tab, layoutRows(header, rows));
}

function colIndex(header: readonly string[], name: string): number {
  const lower = name.toLowerCase();
  return header.findIndex((h) => h.trim().toLowerCase() === lower);
}

/** 1-based sheet rows whose `column` equals one of `values`. */
export function findRows(env: Env, tab: string, column: string, values: ReadonlySet<string>): number[] {
  const header = env.responses.header(tab);
  if (!header) return [];
  const c = colIndex(header, column);
  const last = env.responses.lastRow(tab);
  if (c < 0 || last < 2) return [];
  return env.responses
    .readColumn(tab, c + 1, 2, last - 1)
    .map((v, i) => (values.has(v.trim()) ? i + 2 : -1))
    .filter((r) => r > 0);
}

/** Header-keyed objects for the given 1-based rows (formatted values, as v1 read them). */
export function rowsAt(env: Env, tab: string, rowNumbers: readonly number[]): SheetRow[] {
  const header = env.responses.header(tab);
  if (!header || !rowNumbers.length) return [];
  // One read per contiguous run, so a school's surveys a year apart don't pull every row between.
  const sorted = [...new Set(rowNumbers)].sort((a, b) => a - b);
  const out: SheetRow[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    for (const r of env.responses.readRows(tab, sorted[i]!, sorted[j]! - sorted[i]! + 1)) out.push(toRow(header, r));
    i = j + 1;
  }
  return out;
}

export function toRow(header: readonly string[], cells: readonly string[]): SheetRow {
  const o: SheetRow = {};
  header.forEach((h, i) => (o[h.trim()] = String(cells[i] ?? '')));
  return o;
}

/**
 * Every data row, but only the named columns (one column read each): what the dashboard needs
 * without loading all ~90 columns of every location row.
 */
export function columnRows(env: Env, tab: string, columns: readonly string[]): SheetRow[] {
  const header = env.responses.header(tab);
  const last = env.responses.lastRow(tab);
  if (!header || last < 2) return [];
  const cols = columns.map((name) => ({ name, values: colIndex(header, name) < 0 ? [] : env.responses.readColumn(tab, colIndex(header, name) + 1, 2, last - 1) }));
  const rows: SheetRow[] = [];
  for (let i = 0; i < last - 1; i++) {
    const o: SheetRow = {};
    for (const c of cols) o[c.name] = c.values[i] ?? '';
    if (Object.values(o).some((v) => v !== '')) rows.push(o);
  }
  return rows;
}
