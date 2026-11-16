import { splitIds } from './campus-plan';
import type { School } from './types';

/**
 * W73 (2026-11-16): completes the App's campus list without touching v1's school list (read only).
 * A tab in the MQI Spreadsheet, one row per change:
 *   - Rename      — Campus ID, Name: the campus shows under its real name (e.g. a "TBD" placeholder
 *                   that has since been named); the old name still finds it.
 *   - Other name  — Campus ID, Other Names: extra names Find school also searches (another spelling,
 *                   the name used in a planning sheet). Several are separated by ";".
 *   - Add         — a campus v1's list doesn't have (or has as Inactive): Campus ID, Name, Region,
 *                   Area, E Compound No, School IDs (from the E-Compound sheet).
 * Rows with an unknown action, a missing Campus ID, or (Rename/Other name) a Campus ID the list
 * doesn't have, are ignored.
 */
export const CAMPUS_ADDITIONS_TAB = 'App Campus List Additions';
export const CAMPUS_ADDITIONS_HEADER = ['Action', 'Campus ID', 'Name', 'Other Names', 'Region', 'Area', 'E Compound No', 'School IDs', 'Note'] as const;

const names = (s: string | undefined): string[] =>
  String(s ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

export function applyCampusAdditions(schools: readonly School[], rows: readonly Record<string, string>[]): School[] {
  const out = schools.map((s) => ({ ...s }));
  const byId = new Map(out.map((s) => [s.schoolId, s]));
  const addNames = (s: School, extra: readonly string[]) => {
    const all = [...(s.otherNames ?? []), ...extra].filter((n) => n && n !== s.name);
    if (all.length) s.otherNames = [...new Set(all)];
  };
  for (const r of rows) {
    const action = (r['Action'] ?? '').trim().toLowerCase();
    const id = (r['Campus ID'] ?? '').trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (action === 'rename' && existing) {
      const name = (r['Name'] ?? '').trim();
      if (name && name !== existing.name) {
        const old = existing.name;
        existing.name = name;
        addNames(existing, [old]);
      }
      addNames(existing, names(r['Other Names']));
    } else if (action === 'other name' && existing) {
      addNames(existing, names(r['Other Names']));
    } else if (action === 'add') {
      if (existing) {
        addNames(existing, names(r['Other Names']));
        continue;
      }
      const name = (r['Name'] ?? '').trim();
      const region = (r['Region'] ?? '').trim();
      const area = (r['Area'] ?? '').trim();
      if (!name || !region || !area) continue;
      const school: School = { schoolId: id, name, region, area };
      const ec = (r['E Compound No'] ?? '').trim();
      if (ec) school.eCompoundNo = ec;
      const ids = splitIds(r['School IDs']);
      if (ids.length) school.schoolIds = ids;
      addNames(school, names(r['Other Names']));
      out.push(school);
      byId.set(id, school);
    }
  }
  return out;
}

/** W73: whether a campus matches a Find school search (name, other names, e-compound no., Campus ID). */
export function campusMatches(s: Pick<School, 'name' | 'otherNames' | 'eCompoundNo' | 'schoolId'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (s.schoolId === q) return true;
  return [s.name, ...(s.otherNames ?? []), s.eCompoundNo ?? ''].some((n) => n.toLowerCase().includes(q));
}
