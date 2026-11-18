import type { CapturedSchool } from '../api';
import { unsafeLevel } from '../safety-levels';
import type { BudgetCampus, ScenarioConfig } from './types';

/** Interim campus master: the MQI Spreadsheet's SMS 2026 tab (one row per school unit). */
export const SMS_TAB = 'SMS 2026';

/** One campus of the master, grouped from its unit rows by Campus ID. */
export interface CampusMaster {
  campusId: string;
  name: string;
  schoolIds: string[];
  unitIds: string[];
  eCompoundNo: string;
  schoolType: string;
  programme: string;
  region: string;
  area: string;
  cluster: string;
  location: string;
  builtYear: string;
  buildDonor: string;
}

/**
 * Where the campus master comes from. Build 1 reads the SMS 2026 sheet; an OMS/SMS API can replace
 * it later by returning the same unit rows (header names as in SMS 2026).
 */
export interface CampusSource {
  readonly name: string;
  unitRows(): Record<string, string>[];
}

const get = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const v = r[n];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/** Groups unit rows by Campus ID (the App's campus key). Rows without a Campus ID are skipped. */
export function groupCampusMaster(rows: readonly Record<string, string>[]): CampusMaster[] {
  const out = new Map<string, CampusMaster>();
  const add = (list: string[], v: string) => {
    if (v && !list.includes(v)) list.push(v);
  };
  for (const r of rows) {
    const campusId = get(r, 'Campus ID');
    if (!campusId) continue;
    let m = out.get(campusId);
    if (!m) {
      m = {
        campusId,
        name: get(r, 'Campus Name'),
        schoolIds: [],
        unitIds: [],
        eCompoundNo: get(r, 'eCompoundNo', 'eCompound No', 'E Compound No'),
        schoolType: '',
        programme: get(r, 'Programme'),
        region: get(r, 'Region'),
        area: get(r, 'Area'),
        cluster: get(r, 'Cluster'),
        location: get(r, 'Location'),
        builtYear: get(r, 'Built Year'),
        buildDonor: get(r, 'Build Donor'),
      };
      out.set(campusId, m);
    }
    add(m.schoolIds, get(r, 'School ID'));
    add(m.unitIds, get(r, 'Unit ID'));
    const type = get(r, 'School Type');
    if (type && !m.schoolType.split(', ').includes(type)) m.schoolType = m.schoolType ? `${m.schoolType}, ${type}` : type;
    if (!m.eCompoundNo) m.eCompoundNo = get(r, 'eCompoundNo', 'eCompound No', 'E Compound No');
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Financial year Jul–Jun starting in `startYear`: "FY 2026-27", 2026-07-01 … 2027-06-30. */
export function financialYear(startYear: number): { name: string; from: string; to: string } {
  return { name: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`, from: `${startYear}-07-01`, to: `${startYear + 1}-06-30` };
}

/** The ISO day (yyyy-mm-dd) of a survey timestamp; '' if it can't be read. */
export function surveyDay(timestamp: string): string {
  const t = timestamp.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export interface ImportSummary {
  campuses: number;
  noECompound: number;
  noSurvey: number;
  /** Surveyed campuses (in the window) whose Campus ID isn't in the master. */
  surveyedNotInMaster: number;
}

/**
 * Joins the master with each campus's latest real survey dated inside [from, to] (training surveys are
 * already left out of the dashboard rows). Score, band and the unsafe tier are the dashboard's own.
 */
export function joinCampusSurveys(
  master: readonly CampusMaster[],
  captured: readonly CapturedSchool[],
  window: { from: string; to: string },
): { campuses: BudgetCampus[]; summary: ImportSummary } {
  const inWindow = (date: string) => {
    const d = surveyDay(date);
    return d !== '' && d >= window.from && d <= window.to;
  };
  const latest = new Map<string, { surveyId: string; date: string; overall: number; band: CapturedSchool['band']; unsafeItems?: string[] }>();
  for (const s of captured) {
    const all = [{ surveyId: s.surveyId, date: s.date, overall: s.overall, band: s.band, ...(s.unsafeItems ? { unsafeItems: s.unsafeItems } : {}) }, ...(s.earlier ?? [])];
    const pick = all.filter((x) => inWindow(x.date)).sort((a, b) => surveyDay(b.date).localeCompare(surveyDay(a.date)) || b.date.localeCompare(a.date))[0];
    if (pick) latest.set(s.schoolId, pick);
  }
  const ids = new Set(master.map((m) => m.campusId));
  const campuses: BudgetCampus[] = master.map((m) => {
    const s = latest.get(m.campusId);
    return {
      campusId: m.campusId,
      name: m.name,
      region: m.region,
      area: m.area,
      cluster: m.cluster,
      eCompoundNo: m.eCompoundNo,
      schoolIds: m.schoolIds,
      schoolType: m.schoolType,
      programme: m.programme,
      builtYear: m.builtYear,
      buildDonor: m.buildDonor,
      score: s ? s.overall : null,
      band: s ? s.band : null,
      unsafe: s ? unsafeLevel(s.unsafeItems) : null,
      ...(s ? { surveyId: s.surveyId, surveyDate: surveyDay(s.date) } : {}),
    };
  });
  return {
    campuses,
    summary: {
      campuses: campuses.length,
      noECompound: campuses.filter((c) => !c.eCompoundNo).length,
      noSurvey: campuses.filter((c) => c.score === null).length,
      surveyedNotInMaster: [...latest.keys()].filter((id) => !ids.has(id)).length,
    },
  };
}

/** FY 2026-27 budget (last year), for reference beside the new categories. Rs M. */
export const FY2026_27_BASELINE: { category: string; schools: number | null; rate: number; budget: number }[] = [
  { category: 'Average category (seepage + cracks)', schools: 177, rate: 1.8, budget: 318.6 },
  { category: 'Major rehabilitation (critical roofs)', schools: 85, rate: 6.5, budget: 552.5 },
  { category: 'MQI Good category', schools: 238, rate: 1.05, budget: 249.9 },
  { category: 'External works (walkways, walls)', schools: 100, rate: 0.5, budget: 50 },
  { category: 'Emergency – Flagship', schools: 80, rate: 0.75, budget: 60 },
  { category: 'Solar maintenance', schools: 150, rate: 0.05, budget: 7.5 },
  { category: 'Special projects (lump sum)', schools: null, rate: 20, budget: 20 },
  { category: 'GP major rehabilitation', schools: 15, rate: 5, budget: 75 },
];
export const FY2026_27_TOTAL = 1333.5;

/** A new scenario: the seeded categories in precedence order. Rates are entered by the Cost Manager. */
export function defaultScenarioConfig(): ScenarioConfig {
  return {
    inflationPct: 0,
    ceilingRs: null,
    lastYearTotal: FY2026_27_TOTAL,
    categories: [
      { id: 'critical', name: 'Critically unsafe', kind: 'campus', rule: { type: 'unsafe', level: 'critical' }, lastYearRate: null, colour: '#b42318' },
      { id: 'partial', name: 'Partially unsafe', kind: 'campus', rule: { type: 'unsafe', level: 'partial' }, lastYearRate: null, colour: '#dc6803' },
      { id: 'poor', name: 'Poor', kind: 'campus', rule: { type: 'band', bands: ['Poor'] }, lastYearRate: null, colour: '#c4320a' },
      { id: 'average', name: 'Average', kind: 'campus', rule: { type: 'band', bands: ['Average'] }, lastYearRate: null, colour: '#ca8504' },
      { id: 'bottomGood', name: 'Bottom Good', kind: 'campus', rule: { type: 'bottomN', band: 'Good', n: 50 }, lastYearRate: null, colour: '#3b7c0f' },
      { id: 'emergencies', name: 'Emergencies', kind: 'anticipated', lastYearRate: null, count: 0, colour: '#6941c6' },
      { id: 'minor', name: 'Minor maintenance', kind: 'anticipated', lastYearRate: null, count: 0, colour: '#155eef' },
      { id: 'special', name: 'Special projects', kind: 'anticipated', lastYearRate: null, lumpSum: 0, colour: '#475467' },
    ],
    assumptions: {},
  };
}
