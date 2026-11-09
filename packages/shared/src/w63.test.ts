import { describe, expect, test } from 'vitest';
import { breakupView, campusBreakup, parsePlan } from './index';
import type { CapturedSchool, School } from './index';

/** W63 (2026-11-09): the campus breakup follows the R&M master sheet. */
const row = (ids: string, eco: string, name: string, region: string, cat: string, assessment = '') => ({
  'School IDs': ids,
  'E Compound No': eco,
  Campus: name,
  Region: region,
  'Survey Category': cat,
  Assessment: assessment,
});
const plan = parsePlan([
  row('1', 'E1', 'Alpha Campus', 'South', 'Survey with App'),
  row('2 | 3', 'E1', 'Beta Campus', 'South', 'Last 5 Year Exemption'),
  row('4', 'E2', 'Gamma Campus', 'South', 'Done without App', 'Safe'),
  row('5', 'E2', 'Delta Campus', 'North', 'Done without App', 'Unsafe'),
  row('6', 'E3', 'Eps Campus', 'North', 'PSSP/PSRP Deduction'),
  row('', 'E4', 'Zeta Campus', 'North', 'Survey with App'),
  row('7', 'E5', 'Eta Campus', 'North', 'Last 5 Year Exemption'),
]);
const captured = (schoolId: string, name: string, unsafe = false) => ({ schoolId, name, ...(unsafe ? { unsafeItems: ['Column'] } : {}) }) as CapturedSchool;

describe('W63 campus breakup', () => {
  test('categories add up; e-compounds drop out at the first step with nothing left in scope', () => {
    const b = campusBreakup(plan, []);
    expect(b.total).toEqual({ campuses: 7, eCompounds: 5 });
    expect(b.withApp.campuses).toBe(2);
    expect(b.withApp.eCompounds).toBe(2); // E1, E4
    expect(b.last5).toEqual({ campuses: 2, eCompounds: 1 }); // E5 (E1 stays for the app)
    expect(b.doneWithoutApp).toEqual({ campuses: 2, eCompounds: 1, safe: 1, unsafe: 1 }); // E2
    expect(b.pssp).toEqual({ campuses: 1, eCompounds: 1 }); // E3
    const e = b.total.eCompounds;
    expect(b.pssp.eCompounds + b.doneWithoutApp.eCompounds + b.last5.eCompounds + b.withApp.eCompounds).toBe(e);
  });

  test('app surveys match by School ID, else by name; Safe/Unsafe from the app; others are outside the plan', () => {
    const b = campusBreakup(plan, [captured('1', 'Alpha', true), captured('99', 'Zeta Campus'), captured('2', 'Beta Campus'), captured('42', 'Unknown')]);
    expect(b.withApp).toMatchObject({ surveyed: 2, surveyedUnsafe: 1, surveyedSafe: 1, remaining: 0, eCompoundsVisited: 2 });
    expect(b.surveyedOutsidePlan).toBe(2); // Beta is exempt, Unknown is not in the plan
    const south = b.byRegion.find((r) => r.region === 'South')!;
    expect(south).toMatchObject({ total: 3, withApp: 1, surveyed: 1, surveyedUnsafe: 1, remaining: 0, doneWithoutApp: 1, safe: 1, unsafe: 0, last5: 1 });
  });

  test('campuses to survey that the app list lacks are counted', () => {
    const app = [{ schoolId: '1', name: 'Alpha Campus', region: 'South', area: '' }] as School[];
    expect(campusBreakup(plan, [], app).withApp.notInAppList).toBe(1); // Zeta
  });

  test('a category written differently still counts; unknown categories are ignored', () => {
    const p = parsePlan([row('1', 'E1', 'A', 'S', 'survey WITH app'), row('2', 'E1', 'B', 'S', 'Something else')]);
    expect(campusBreakup(p, []).withApp.campuses).toBe(1);
    expect(campusBreakup(p, []).total.campuses).toBe(2);
  });
});

/** W65 (2026-11-09): the dashboard hierarchy and its checks. */
describe('W65 breakup view', () => {
  test('Total = Exempted + In scope; In scope = Assessed + Pending; Assessed = Safe + Unsafe', () => {
    const b = campusBreakup(plan, [captured('1', 'Alpha', true), captured('42', 'Elsewhere')]);
    const v = breakupView(b);
    expect(v).toMatchObject({ total: 7, exempted: 3, scope: 4, assessed: 3, assessedWithout: 2, assessedWith: 1, pending: 1 });
    expect(v.safe).toEqual({ without: 1, with: 0, total: 1 });
    expect(v.unsafe).toEqual({ without: 1, with: 1, total: 2 });
    expect(v.failed).toEqual([]);
    // Outside the list: in no total, listed separately.
    expect(b.outsidePlanCampuses).toEqual([{ name: 'Elsewhere', schoolId: '42', region: undefined, category: 'Not in the plan' }]);
  });

  test('a Done without App campus with no Safe/Unsafe result fails the check', () => {
    const p = parsePlan([row('1', 'E1', 'A', 'S', 'Done without App', '')]);
    expect(breakupView(campusBreakup(p, [])).failed).toEqual(['Safe + Unsafe ≠ Assessed']);
  });

  test('each region has its own breakup, adding up to the whole', () => {
    const b = campusBreakup(plan, [captured('1', 'Alpha')]);
    const regions = Object.values(b.regions ?? {});
    expect(Object.keys(b.regions ?? {}).sort()).toEqual(['North', 'South']);
    expect(regions.reduce((a, r) => a + r.total.campuses, 0)).toBe(b.total.campuses);
    expect(b.regions!.South!.withApp.surveyed).toBe(1);
    expect(b.regions!.North!.withApp.surveyed).toBe(0);
  });
});
