import { describe, expect, it } from 'vitest';
import { applyCampusAdditions, campusMatches } from './campus-additions';
import { campusBreakup, parsePlan } from './campus-plan';
import type { School } from './types';

/** W73 (2026-11-16): renames, other names and added campuses on top of v1's (read-only) school list. */
const list: School[] = [
  { schoolId: '1413', name: 'Sherazi TBD Campus', region: 'North', area: 'Sheikhupura', eCompoundNo: 'N/187/24', schoolIds: ['2074', '2292'] },
  { schoolId: '1152', name: 'GGES Bachal Pusia (C)', region: 'Upper Sindh', area: 'Naushero Feroz', eCompoundNo: 'PSS/20/2019' },
];
const rows: Record<string, string>[] = [
  { Action: 'Rename', 'Campus ID': '1413', Name: 'Syed Mohammad Hussain Memorial Campus', 'Other Names': 'Syed Mohammad Hussain Memorial Unit Campus' },
  { Action: 'Other name', 'Campus ID': '1152', 'Other Names': 'GGES Bachal Pusia' },
  { Action: 'Add', 'Campus ID': '683', Name: 'GGPS Ali Garh', Region: 'North West', Area: 'Nowshera', 'E Compound No': 'GK/01/16', 'School IDs': '1036' },
  { Action: 'Add', 'Campus ID': '999', Name: 'No Region Campus' }, // incomplete: ignored
  { Action: 'Other name', 'Campus ID': '12345', 'Other Names': 'Ghost' }, // unknown campus: ignored
];

describe('W73 campus list additions', () => {
  const out = applyCampusAdditions(list, rows);

  it('renames, keeping the old name findable', () => {
    expect(out[0]).toMatchObject({ schoolId: '1413', name: 'Syed Mohammad Hussain Memorial Campus', otherNames: ['Sherazi TBD Campus', 'Syed Mohammad Hussain Memorial Unit Campus'] });
    expect(list[0]!.name).toBe('Sherazi TBD Campus'); // the input is not changed
  });

  it('adds other names and new campuses; ignores incomplete or unknown rows', () => {
    expect(out[1]!.otherNames).toEqual(['GGES Bachal Pusia']);
    expect(out.find((s) => s.schoolId === '683')).toEqual({ schoolId: '683', name: 'GGPS Ali Garh', region: 'North West', area: 'Nowshera', eCompoundNo: 'GK/01/16', schoolIds: ['1036'] });
    expect(out).toHaveLength(3);
  });

  it('Find school matches the name, other names, e-compound number and Campus ID', () => {
    const smh = out[0]!;
    for (const q of ['syed mohammad', 'sherazi', 'n/187/24', '1413', 'Unit Campus']) expect(campusMatches(smh, q)).toBe(true);
    expect(campusMatches(smh, 'karachi')).toBe(false);
    expect(campusMatches(smh, '141')).toBe(false); // a Campus ID must be typed in full
  });

  it('the dashboard finds a plan campus by an other name', () => {
    const plan = parsePlan([{ 'School IDs': '', 'E Compound No': 'PSS/20/2019', Campus: 'GGES Bachal Pusia', Region: 'Upper Sindh', 'Survey Category': 'Survey with App', Assessment: '' }]);
    expect(campusBreakup(plan, [], out).withApp.notInAppList).toBe(0);
    expect(campusBreakup(plan, [], list).withApp.notInAppList).toBe(1);
  });
});
