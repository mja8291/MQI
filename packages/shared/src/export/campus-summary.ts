import type { FoundSurvey } from '../api';
import type { PlanCampus } from '../campus-plan';
import { planIndex, unitSchoolIds } from '../campus-plan';
import { foundSurveyFromRows, unsafeItemsInRow } from '../read-models';
import type { SheetRow } from '../read-models';
import { isTrainingPurposeText } from '../rubric/content';
import { RUBRIC_GROUPS } from '../rubric/items';
import { CRITICAL_ITEMS, ratingBand } from '../scoring';
import { UNSAFE_LEVEL_LABEL, unsafeLevel } from '../safety-levels';
import type { RatingBand, School } from '../types';

/**
 * W84 (2026-11-21): the exported workbook's Tracker and Detail sheets. One row per campus: its latest
 * real App survey (training surveys left out, as on the dashboard), or, for campuses assessed without
 * the App, the plan's Safe/Unsafe mark. Pure: the web app writes these into Excel.
 */

/** Region → zone, as in the R&M structural survey tracker. */
export const REGION_ZONE: Record<string, string> = {
  South: 'Southern',
  'South West': 'Southern',
  'Lower Sindh': 'Southern',
  'Upper Sindh': 'Southern',
  North: 'Northern',
  'North West': 'Northern',
  'South Punjab': 'Northern',
};
export const zoneOf = (region: string): string => REGION_ZONE[region.trim()] ?? '';

export type DetailSource = 'MQI App' | 'Done without App';

export interface CampusDetailRow {
  source: DetailSource;
  campusId: string;
  campus: string;
  region: string;
  zone: string;
  area: string;
  cluster: string;
  schoolIds: string;
  unitIds: string;
  eCompoundNo: string;
  eCompound: string;
  schoolType: string;
  programme: string;
  buildDonor: string;
  established: string;
  /** Plan category of the campus ("Survey with App", …) when it is in the Campus Survey Plan. */
  planCategory: string;
  surveyId: string;
  surveyDate: string;
  surveyedBy: string;
  rubricVersion: string;
  overall: number | null;
  band: RatingBand | '';
  functionality: number | null;
  safety: number | null;
  aesthetics: number | null;
  major: number | null;
  minor: number | null;
  /** "Critically Unsafe", "Partially Unsafe", "Safe" (App), or the plan's "Safe"/"Unsafe" (without App). */
  safetyStatus: string;
  unsafeItems: string;
  critical: Record<string, number | null>;
  structuralConcern: string;
  suggestedStructure: string;
  structureType: string;
  centerBeam: string;
  drillingDone: string;
  slabAssessment: string;
  roofAccess: string;
  overflowDisposal: string;
  roofClean: string;
  rainSpoutsClear: string;
  riskFactors: string;
  itemsCovered: number | null;
  /** Aggregated score (%) of each current rubric item group; null when not scored. */
  items: Record<string, number | null>;
}

export const DETAIL_ITEM_GROUPS: readonly string[] = RUBRIC_GROUPS.map((g) => g.name);

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The latest real survey of each campus (by Campus ID), from the responses tab's rows. */
export function latestSurveys(rows: readonly SheetRow[]): { found: FoundSurvey; rows: SheetRow[] }[] {
  const bySurvey = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const id = r['Survey ID'];
    if (!id || isTrainingPurposeText(r['Survey Purpose'])) continue;
    const list = bySurvey.get(id) ?? [];
    list.push(r);
    bySurvey.set(id, list);
  }
  const latest = new Map<string, { found: FoundSurvey; rows: SheetRow[] }>();
  for (const [id, list] of bySurvey) {
    const found = foundSurveyFromRows(id, list);
    if (!found) continue;
    const key = found.schoolId || found.campusName;
    const prev = latest.get(key);
    if (!prev || found.submittedAt > prev.found.submittedAt) latest.set(key, { found, rows: list });
  }
  return [...latest.values()];
}

function base(school: School | undefined, region: string): Omit<CampusDetailRow, 'source' | 'campusId' | 'campus' | 'region' | 'zone' | 'area' | 'planCategory' | 'surveyId' | 'surveyDate' | 'surveyedBy' | 'rubricVersion' | 'overall' | 'band' | 'functionality' | 'safety' | 'aesthetics' | 'major' | 'minor' | 'safetyStatus' | 'unsafeItems' | 'critical' | 'structuralConcern' | 'suggestedStructure' | 'structureType' | 'centerBeam' | 'drillingDone' | 'slabAssessment' | 'roofAccess' | 'overflowDisposal' | 'roofClean' | 'rainSpoutsClear' | 'riskFactors' | 'itemsCovered' | 'items'> {
  void region;
  return {
    cluster: school?.cluster ?? '',
    schoolIds: (school?.schoolIds ?? []).join(', '),
    unitIds: (school?.unitIds ?? []).join(', '),
    eCompoundNo: school?.eCompoundNo ?? '',
    eCompound: school?.eCompoundName ?? '',
    schoolType: (school?.schoolTypes ?? []).join(', '),
    programme: [school?.program, school?.subProgram].filter(Boolean).join(' · '),
    buildDonor: school?.buildDonor ?? '',
    established: school?.establishedYear ?? '',
  };
}

const EMPTY_SURVEY = {
  surveyId: '',
  surveyDate: '',
  surveyedBy: '',
  rubricVersion: '',
  overall: null,
  band: '' as const,
  functionality: null,
  safety: null,
  aesthetics: null,
  major: null,
  minor: null,
  unsafeItems: '',
  critical: {},
  structuralConcern: '',
  suggestedStructure: '',
  structureType: '',
  centerBeam: '',
  drillingDone: '',
  slabAssessment: '',
  roofAccess: '',
  overflowDisposal: '',
  roofClean: '',
  rainSpoutsClear: '',
  riskFactors: '',
  itemsCovered: null,
  items: {},
};

/** One row per campus: App surveys first (worst score first), then campuses done without the App. */
export function campusDetail(rows: readonly SheetRow[], plan: readonly PlanCampus[], schools: readonly School[]): CampusDetailRow[] {
  const byId = new Map(schools.map((s) => [s.schoolId, s]));
  const findPlan = planIndex(plan);
  const planOf = (s: School | undefined, id: string, name: string) => findPlan({ schoolId: s ? unitSchoolIds(s).join(' | ') : id, name });
  const out: CampusDetailRow[] = [];
  const usedPlan = new Set<PlanCampus>();

  for (const { found, rows: list } of latestSurveys(rows)) {
    const first = list[0]!;
    const school = byId.get(found.schoolId ?? '');
    const p = planOf(school, found.schoolId ?? '', found.campusName);
    if (p) usedPlan.add(p);
    const region = p?.region || found.region;
    const unsafe = [...new Set(list.flatMap((r) => unsafeItemsInRow(r)))];
    const level = unsafeLevel(unsafe);
    const items: Record<string, number | null> = {};
    for (const name of DETAIL_ITEM_GROUPS) {
      const v = found.aggregatedScores?.[name];
      items[name] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    const critical: Record<string, number | null> = {};
    for (const c of CRITICAL_ITEMS) critical[c] = num(first[`Critical: ${c}`]);
    const sc = found.siteChecks;
    out.push({
      source: 'MQI App',
      campusId: found.schoolId ?? '',
      campus: found.campusName,
      region,
      zone: zoneOf(region),
      area: found.area,
      ...base(school, region),
      eCompoundNo: school?.eCompoundNo || p?.eCompoundNo || '',
      planCategory: p?.category ?? '',
      surveyId: found.surveyId,
      surveyDate: found.submittedAt.slice(0, 10),
      surveyedBy: first['Submitted By'] ?? '',
      rubricVersion: found.rubricVersion || 'pre-2026-10-27',
      overall: found.overall,
      band: (ratingBand(found.overall) ?? '') as RatingBand | '',
      functionality: found.functionality,
      safety: found.safety,
      aesthetics: found.aesthetics,
      major: num(first['Major Score']),
      minor: num(first['Minor Score']),
      safetyStatus: level ? UNSAFE_LEVEL_LABEL[level] : 'Safe',
      unsafeItems: unsafe.join(', '),
      critical,
      structuralConcern: found.structuralConcern,
      suggestedStructure: found.buildingStructure,
      structureType: found.typeOfStructure,
      centerBeam: found.centerBeam,
      drillingDone: found.drillingCheck.done ?? '',
      slabAssessment: found.drillingCheck.slabAssessment ?? '',
      roofAccess: sc.roofAccessType ?? '',
      overflowDisposal: sc.overflowDisposal ?? '',
      roofClean: sc.roofClean ?? '',
      rainSpoutsClear: sc.rainSpoutsClear ?? '',
      riskFactors: [...(sc.riskFactors ?? []), sc.riskFactorOther ?? ''].filter(Boolean).join(', '),
      itemsCovered: found.itemsCoveredPercent,
      items,
    });
  }
  out.sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999) || a.campus.localeCompare(b.campus));

  // Campuses assessed without the App: the plan's Safe/Unsafe mark.
  const noApp = plan.filter((c) => c.category === 'Done without App' && !usedPlan.has(c));
  const schoolByUnit = new Map<string, School>();
  for (const s of schools) for (const id of unitSchoolIds(s)) schoolByUnit.set(id, s);
  for (const c of [...noApp].sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name))) {
    const school = c.ids.map((id) => schoolByUnit.get(id)).find(Boolean);
    out.push({
      source: 'Done without App',
      campusId: school?.schoolId ?? '',
      campus: c.name || school?.name || '',
      region: c.region,
      zone: zoneOf(c.region),
      area: school?.area ?? '',
      ...base(school, c.region),
      schoolIds: c.ids.join(', '),
      eCompoundNo: c.eCompoundNo || school?.eCompoundNo || '',
      planCategory: c.category,
      ...EMPTY_SURVEY,
      safetyStatus: c.assessment || 'Not recorded',
    });
  }
  return out;
}

// ---- Tracker ----

export interface TrackerLine {
  name: string;
  zone: string;
  /** Campuses in the Campus Survey Plan. */
  planned: number;
  /** "Survey with App" in the plan: the App's target. */
  target: number;
  surveyedApp: number;
  withoutApp: number;
  exempt: number;
  pending: number;
  percentDone: number;
  critical: number;
  partial: number;
  unsafeWithoutApp: number;
  bands: Record<RatingBand, number>;
  averageMqi: number | null;
}

export interface Tracker {
  totals: TrackerLine;
  regions: TrackerLine[];
  zones: TrackerLine[];
  surveyors: { name: string; surveys: number; averageMqi: number | null; critical: number; partial: number }[];
  weeks: { week: string; surveys: number }[];
}

const BANDS: RatingBand[] = ['Excellent', 'Good', 'Average', 'Poor'];

function line(name: string, zone: string, plan: readonly PlanCampus[], detail: readonly CampusDetailRow[]): TrackerLine {
  const app = detail.filter((d) => d.source === 'MQI App');
  const noApp = detail.filter((d) => d.source === 'Done without App');
  const target = plan.filter((c) => c.category === 'Survey with App').length;
  const exempt = plan.filter((c) => c.category === 'Last 5 Year Exemption' || c.category === 'PSSP/PSRP Deduction').length;
  const withoutApp = plan.filter((c) => c.category === 'Done without App').length;
  const surveyedTarget = app.filter((d) => d.planCategory === 'Survey with App').length;
  const scores = app.map((d) => d.overall).filter((v): v is number => v !== null);
  const bands = Object.fromEntries(BANDS.map((b) => [b, app.filter((d) => d.band === b).length])) as Record<RatingBand, number>;
  return {
    name,
    zone,
    planned: plan.length,
    target,
    surveyedApp: app.length,
    withoutApp: Math.max(withoutApp, noApp.length),
    exempt,
    pending: Math.max(0, target - surveyedTarget),
    percentDone: target ? (100 * surveyedTarget) / target : 0,
    critical: app.filter((d) => d.safetyStatus === UNSAFE_LEVEL_LABEL.critical).length,
    partial: app.filter((d) => d.safetyStatus === UNSAFE_LEVEL_LABEL.partial).length,
    unsafeWithoutApp: noApp.filter((d) => /unsafe/i.test(d.safetyStatus)).length,
    bands,
    averageMqi: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  };
}

/** ISO week label (yyyy-Www) of a yyyy-mm-dd date. */
function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function campusTracker(detail: readonly CampusDetailRow[], plan: readonly PlanCampus[]): Tracker {
  const regions = [...new Set([...plan.map((c) => c.region), ...detail.map((d) => d.region)].filter(Boolean))].sort(
    (a, b) => (zoneOf(a) || 'z').localeCompare(zoneOf(b) || 'z') || a.localeCompare(b),
  );
  const zones = [...new Set(regions.map((r) => zoneOf(r) || 'Other'))];
  const app = detail.filter((d) => d.source === 'MQI App');
  const bySurveyor = new Map<string, CampusDetailRow[]>();
  for (const d of app) bySurveyor.set(d.surveyedBy || '—', [...(bySurveyor.get(d.surveyedBy || '—') ?? []), d]);
  const byWeek = new Map<string, number>();
  for (const d of app) {
    const w = isoWeek(d.surveyDate);
    if (w) byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
  }
  return {
    totals: line('Total', '', plan, detail),
    regions: regions.map((r) => line(r, zoneOf(r), plan.filter((c) => c.region === r), detail.filter((d) => d.region === r))),
    zones: zones.map((z) =>
      line(
        z,
        z,
        plan.filter((c) => (zoneOf(c.region) || 'Other') === z),
        detail.filter((d) => (d.zone || 'Other') === z),
      ),
    ),
    surveyors: [...bySurveyor.entries()]
      .map(([name, list]) => {
        const scores = list.map((d) => d.overall).filter((v): v is number => v !== null);
        return {
          name,
          surveys: list.length,
          averageMqi: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
          critical: list.filter((d) => d.safetyStatus === UNSAFE_LEVEL_LABEL.critical).length,
          partial: list.filter((d) => d.safetyStatus === UNSAFE_LEVEL_LABEL.partial).length,
        };
      })
      .sort((a, b) => b.surveys - a.surveys || a.name.localeCompare(b.name)),
    weeks: [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, surveys]) => ({ week, surveys })),
  };
}
