import type { CampusBreakup, CampusBreakupCount, CampusBreakupRegion, CapturedSchool } from './api';
import type { School } from './types';

/**
 * v2 (W63, 2026-11-09): the campus survey plan — every campus in the R&M master sheet with its
 * survey category — and the dashboard breakup built from it. The plan lives in the "Campus Survey
 * Plan" tab of the responses spreadsheet (one row per campus, copied from the master sheet), so the
 * department can change a category or a Safe/Unsafe assessment there without a new app version.
 *
 * Categories (they add up to the total, as in the master sheet):
 *   - PSSP/PSRP Deduction    separate budget, not surveyed
 *   - Done without App       checked before the app (100-list); Safe or Unsafe from that check
 *   - Last 5 Year Exemption  built in the last five years, not surveyed
 *   - Survey with App        to be surveyed with this app; progress and Safe/Unsafe come from the app
 */
export const PLAN_TAB = 'Campus Survey Plan';
export const PLAN_HEADER = ['School IDs', 'E Compound No', 'Campus', 'Region', 'Survey Category', 'Assessment'] as const;

export const PLAN_CATEGORIES = ['PSSP/PSRP Deduction', 'Done without App', 'Last 5 Year Exemption', 'Survey with App'] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

export interface PlanCampus {
  ids: string[];
  eCompoundNo: string;
  name: string;
  region: string;
  category: PlanCategory | '';
  /** Done without App only: "Safe" or "Unsafe". */
  assessment: string;
}

export const splitIds = (s: string | undefined): string[] =>
  String(s ?? '')
    .split(/[|,;/\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Campus names compared without case, punctuation or the word "campus". */
export const normName = (s: string | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/campus/g, '')
    .replace(/[^a-z0-9]/g, '');

export function parsePlan(rows: readonly Record<string, string>[]): PlanCampus[] {
  return rows
    .map((r) => {
      const category = (PLAN_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === (r['Survey Category'] ?? '').trim().toLowerCase());
      return {
        ids: splitIds(r['School IDs']),
        eCompoundNo: (r['E Compound No'] ?? '').trim(),
        name: (r['Campus'] ?? '').trim(),
        region: (r['Region'] ?? '').trim(),
        category: (category ?? '') as PlanCategory | '',
        assessment: (r['Assessment'] ?? '').trim(),
      };
    })
    .filter((c) => c.name || c.ids.length);
}

/** Finds the plan campus for an app campus: a shared School ID, else the same name. */
export function planIndex(plan: readonly PlanCampus[]): (school: { schoolId: string; name: string }) => PlanCampus | undefined {
  const byId = new Map<string, PlanCampus>();
  const byName = new Map<string, PlanCampus>();
  for (const c of plan) {
    for (const id of c.ids) if (!byId.has(id)) byId.set(id, c);
    const n = normName(c.name);
    if (n && !byName.has(n)) byName.set(n, c);
  }
  return (school) => {
    for (const id of splitIds(school.schoolId)) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    return byName.get(normName(school.name));
  };
}

const count = (campuses: number, eCompounds: number): CampusBreakupCount => ({ campuses, eCompounds });

/**
 * The breakup, in the master sheet's numbers. E-compounds follow the master's own rule: an
 * e-compound drops out at the first step that leaves it with no campus still in scope, so the
 * e-compound column adds up to the total too.
 */
export function campusBreakup(plan: readonly PlanCampus[], captured: readonly CapturedSchool[], appSchools: readonly School[] = []): CampusBreakup {
  const find = planIndex(plan);
  const ecosWith = (cats: readonly PlanCategory[]) => new Set(plan.filter((c) => c.eCompoundNo && cats.includes(c.category as PlanCategory)).map((c) => c.eCompoundNo));
  const allEcos = new Set(plan.map((c) => c.eCompoundNo).filter(Boolean)).size;
  const inDone = ecosWith(['Done without App', 'Last 5 Year Exemption', 'Survey with App']).size;
  const inLast5 = ecosWith(['Last 5 Year Exemption', 'Survey with App']).size;
  const inApp = ecosWith(['Survey with App']).size;
  const of = (cat: PlanCategory) => plan.filter((c) => c.category === cat);
  const isSafe = (c: PlanCampus) => /^safe$/i.test(c.assessment);
  const isUnsafe = (c: PlanCampus) => /^unsafe$/i.test(c.assessment);

  // Surveyed with the app: the dashboard's campuses (latest real survey each), matched to the plan.
  const surveyed = new Map<PlanCampus, CapturedSchool>();
  let outsidePlan = 0;
  for (const s of captured) {
    const c = find({ schoolId: s.schoolId, name: s.name });
    if (c && c.category === 'Survey with App') {
      if (!surveyed.has(c)) surveyed.set(c, s);
    } else outsidePlan++;
  }
  const appUnsafe = (c: PlanCampus) => Boolean(surveyed.get(c)?.unsafeItems?.length);
  const withApp = of('Survey with App');
  const surveyedList = withApp.filter((c) => surveyed.has(c));

  // Campuses to survey that the app's campus list doesn't have (they can't be picked yet).
  const appFind = planIndex(
    appSchools.map((s) => ({ ids: splitIds(s.schoolId), eCompoundNo: '', name: s.name, region: '', category: '' as const, assessment: '' })),
  );
  const notInAppList = appSchools.length ? withApp.filter((c) => !c.ids.some((id) => appFind({ schoolId: id, name: '' })) && !appFind({ schoolId: '', name: c.name })) : [];

  const regions = [...new Set(plan.map((c) => c.region).filter(Boolean))].sort();
  const byRegion: CampusBreakupRegion[] = regions.map((region) => {
    const r = plan.filter((c) => c.region === region);
    const app = r.filter((c) => c.category === 'Survey with App');
    const done = r.filter((c) => c.category === 'Done without App');
    const sv = app.filter((c) => surveyed.has(c));
    return {
      region,
      total: r.length,
      pssp: r.filter((c) => c.category === 'PSSP/PSRP Deduction').length,
      doneWithoutApp: done.length,
      safe: done.filter(isSafe).length,
      unsafe: done.filter(isUnsafe).length,
      last5: r.filter((c) => c.category === 'Last 5 Year Exemption').length,
      withApp: app.length,
      surveyed: sv.length,
      surveyedUnsafe: sv.filter(appUnsafe).length,
      remaining: app.length - sv.length,
    };
  });

  const done = of('Done without App');
  return {
    total: count(plan.length, allEcos),
    pssp: count(of('PSSP/PSRP Deduction').length, allEcos - inDone),
    doneWithoutApp: { ...count(done.length, inDone - inLast5), safe: done.filter(isSafe).length, unsafe: done.filter(isUnsafe).length },
    last5: count(of('Last 5 Year Exemption').length, inLast5 - inApp),
    withApp: {
      ...count(withApp.length, inApp),
      surveyed: surveyedList.length,
      surveyedUnsafe: surveyedList.filter(appUnsafe).length,
      surveyedSafe: surveyedList.filter((c) => !appUnsafe(c)).length,
      remaining: withApp.length - surveyedList.length,
      eCompoundsVisited: new Set(surveyedList.map((c) => c.eCompoundNo).filter(Boolean)).size,
      notInAppList: notInAppList.length,
    },
    surveyedOutsidePlan: outsidePlan,
    byRegion,
  };
}
