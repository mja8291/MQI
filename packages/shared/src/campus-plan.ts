import type { CampusBreakup, CampusBreakupCore, CampusBreakupCount, CampusBreakupRegion, CapturedSchool, OutsideScopeCampus } from './api';
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

/**
 * v2 (W64, 2026-11-09): campuses in the R&M Plan 2026-27 — "Planned in this year" in the
 * Structural Condition Assessment sheet. Surveying one of them comes with a second activity:
 * preparing its BOQ. The tab holds School ID, Campus, E-Compound and Region only.
 */
export const RM_PLAN_TAB = 'R&M Plan 2026-27';
export const RM_PLAN_HEADER = ['School ID', 'Campus', 'E-Compound', 'Region'] as const;
export const RM_PLAN_REMINDER = 'This campus is in the R&M Plan 2026-27. Remember to prepare its BOQ as well (a separate activity).';

/** School IDs of the planned campuses (each cell may list several, e.g. "1784 | 2211"). */
export function rmPlanIds(rows: readonly Record<string, string>[]): Set<string> {
  return new Set(rows.flatMap((r) => splitIds(r['School ID'])));
}

/** Marks the schools whose School ID is in the plan. */
export function markRmPlanned<S extends { schoolId: string }>(schools: readonly S[], ids: ReadonlySet<string>): (S & { rmPlanned?: boolean })[] {
  if (!ids.size) return [...schools];
  return schools.map((s) => (splitIds(s.schoolId).some((id) => ids.has(id)) ? { ...s, rmPlanned: true } : s));
}

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
 * v2 (W65): the same breakup for each region (the dashboard's region filter), and the campuses
 * behind the two notes (not in the app's list; surveyed outside the Survey with App list).
 */
export function campusBreakup(plan: readonly PlanCampus[], captured: readonly CapturedSchool[], appSchools: readonly School[] = []): CampusBreakup {
  const find = planIndex(plan);
  const regionOf = (s: CapturedSchool) => find({ schoolId: s.schoolId, name: s.name })?.region || s.region;
  const regions = [...new Set(plan.map((c) => c.region).filter(Boolean))].sort();
  const core = breakupCore(plan, captured, appSchools);
  const perRegion: Record<string, CampusBreakupCore> = {};
  for (const region of regions)
    perRegion[region] = breakupCore(
      plan.filter((c) => c.region === region),
      captured.filter((s) => regionOf(s) === region),
      appSchools,
    );
  const byRegion: CampusBreakupRegion[] = regions.map((region) => {
    const r = perRegion[region]!;
    return {
      region,
      total: r.total.campuses,
      pssp: r.pssp.campuses,
      doneWithoutApp: r.doneWithoutApp.campuses,
      safe: r.doneWithoutApp.safe,
      unsafe: r.doneWithoutApp.unsafe,
      last5: r.last5.campuses,
      withApp: r.withApp.campuses,
      surveyed: r.withApp.surveyed,
      surveyedUnsafe: r.withApp.surveyedUnsafe,
      remaining: r.withApp.remaining,
    };
  });
  return { ...core, byRegion, regions: perRegion };
}

function breakupCore(plan: readonly PlanCampus[], captured: readonly CapturedSchool[], appSchools: readonly School[]): CampusBreakupCore {
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
  const outside: OutsideScopeCampus[] = [];
  for (const s of captured) {
    const c = find({ schoolId: s.schoolId, name: s.name });
    if (c && c.category === 'Survey with App') {
      if (!surveyed.has(c)) surveyed.set(c, s);
    } else outside.push({ name: s.name, schoolId: s.schoolId, region: c?.region || s.region, category: c?.category || 'Not in the plan' });
  }
  const appUnsafe = (c: PlanCampus) => Boolean(surveyed.get(c)?.unsafeItems?.length);
  const withApp = of('Survey with App');
  const surveyedList = withApp.filter((c) => surveyed.has(c));

  // Campuses to survey that the app's campus list doesn't have (they can't be picked yet).
  const appFind = planIndex(
    appSchools.map((s) => ({ ids: splitIds(s.schoolId), eCompoundNo: '', name: s.name, region: '', category: '' as const, assessment: '' })),
  );
  const notInAppList = appSchools.length ? withApp.filter((c) => !c.ids.some((id) => appFind({ schoolId: id, name: '' })) && !appFind({ schoolId: '', name: c.name })) : [];

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
      notInAppListCampuses: notInAppList.map((c) => ({ name: c.name, region: c.region, eCompoundNo: c.eCompoundNo })),
    },
    surveyedOutsidePlan: outside.length,
    outsidePlanCampuses: outside,
  };
}

/**
 * v2 (W65): the dashboard's hierarchy, by the owner's rules:
 *   Total = Exempted (PSSP/PSRP + Last 5 yr) + In scope (Done without App + Survey with App)
 *   In scope = Assessed (Done without App + captured from the list) + Pending (list, not yet surveyed)
 *   Assessed = Safe + Unsafe, each Without App / With App.
 * Surveys outside the Survey with App list are in no total. `checks` names any rule that fails.
 */
export interface BreakupView {
  total: number;
  totalEco: number;
  exempted: number;
  exemptedEco: number;
  scope: number;
  assessed: number;
  assessedWithout: number;
  assessedWith: number;
  pending: number;
  pendingVisits: number;
  safe: { without: number; with: number; total: number };
  unsafe: { without: number; with: number; total: number };
  failed: string[];
}

export function breakupView(b: CampusBreakupCore): BreakupView {
  const exempted = b.pssp.campuses + b.last5.campuses;
  const scope = b.doneWithoutApp.campuses + b.withApp.campuses;
  const assessed = b.doneWithoutApp.campuses + b.withApp.surveyed;
  const pending = b.withApp.remaining;
  const safe = { without: b.doneWithoutApp.safe, with: b.withApp.surveyedSafe, total: b.doneWithoutApp.safe + b.withApp.surveyedSafe };
  const unsafe = { without: b.doneWithoutApp.unsafe, with: b.withApp.surveyedUnsafe, total: b.doneWithoutApp.unsafe + b.withApp.surveyedUnsafe };
  const failed: string[] = [];
  if (exempted + scope !== b.total.campuses) failed.push('Exempted + In scope ≠ Total');
  if (assessed + pending !== scope) failed.push('Assessed + Pending ≠ In scope');
  if (safe.total + unsafe.total !== assessed) failed.push('Safe + Unsafe ≠ Assessed');
  return {
    total: b.total.campuses,
    totalEco: b.total.eCompounds,
    exempted,
    exemptedEco: b.pssp.eCompounds + b.last5.eCompounds,
    scope,
    assessed,
    assessedWithout: b.doneWithoutApp.campuses,
    assessedWith: b.withApp.surveyed,
    pending,
    pendingVisits: b.withApp.eCompounds - b.withApp.eCompoundsVisited,
    safe,
    unsafe,
    failed,
  };
}
