import { describe, expect, test } from 'vitest';
import { markRmPlanned, rmPlanIds } from './index';

/** W64 (2026-11-09): campuses in the R&M Plan 2026-27 are marked so the app reminds about the BOQ. */
describe('W64 R&M Plan 2026-27', () => {
  test('a campus is marked when any of its School IDs is in the plan', () => {
    const ids = rmPlanIds([{ 'School ID': '1664' }, { 'School ID': '1784 | 2211' }, { 'School ID': '' }]);
    expect([...ids].sort()).toEqual(['1664', '1784', '2211']);
    const marked = markRmPlanned([{ schoolId: '1664' }, { schoolId: '2211 | 9999' }, { schoolId: '42' }], ids);
    expect(marked.map((s) => Boolean(s.rmPlanned))).toEqual([true, true, false]);
  });
  test('no plan, nothing marked', () => {
    expect(markRmPlanned([{ schoolId: '1' }], new Set()).every((s) => !('rmPlanned' in s))).toBe(true);
  });
});
