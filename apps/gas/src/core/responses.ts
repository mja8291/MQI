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
  const min = Math.min(...rowNumbers);
  const max = Math.max(...rowNumbers);
  const block = env.responses.readRows(tab, min, max - min + 1);
  const wanted = new Set(rowNumbers);
  return block.filter((_, i) => wanted.has(min + i)).map((r) => toRow(header, r));
}

export function toRow(header: readonly string[], cells: readonly string[]): SheetRow {
  const o: SheetRow = {};
  header.forEach((h, i) => (o[h.trim()] = String(cells[i] ?? '')));
  return o;
}

export function allRows(env: Env, tab: string): SheetRow[] {
  const header = env.responses.header(tab);
  const last = env.responses.lastRow(tab);
  if (!header || last < 2) return [];
  return env.responses.readRows(tab, 2, last - 1).map((r) => toRow(header, r)).filter((r) => Object.values(r).some((v) => v !== ''));
}
