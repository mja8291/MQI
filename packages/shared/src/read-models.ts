import type { CapturedSchool, DashboardData, FoundSurvey } from './api';
import { CRITICAL_ITEMS, aggregateLocations, ratingBand } from './scoring';
import { criticalColumn } from './sheets';
import { rubricGroupsFor } from './rubric/versions';
import { cellCondition } from './rubric/items';
import type { Condition, DrillingCheck, SurveyLocation, RatingBand, School, SiteChecks } from './types';

/**
 * Pure read-side logic ported from v1 (src/lib/sheets/{schools,dashboard}.ts,
 * src/lib/export/find-survey.ts, src/lib/sheets/drive.ts). The server feeds it sheet rows;
 * keeping it here lets Node tests pin v1's behaviour.
 */

export type SheetRow = Record<string, string>;

// ---- schools (v1 getSchools) ----

type Grid = readonly (readonly unknown[])[];

function columns(header: readonly unknown[]) {
  const names = header.map((h) => String(h).trim().toLowerCase());
  return (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = names.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  };
}

/** E-Compound Spreadsheet → name by Campus ID and by eCompound No (v2, Find school details). */
function eCompoundNames(grid: Grid): { byCampus: Map<string, string>; byCode: Map<string, string> } {
  const byCampus = new Map<string, string>();
  const byCode = new Map<string, string>();
  if (grid.length < 2) return { byCampus, byCode };
  const col = columns(grid[0]!);
  const campusCol = col('campus id');
  const nameCol = col('e-compound', 'ecompound', 'e-compound name');
  const codeCol = col('ecompoundno', 'ecompound no', 'e-compound no');
  if (nameCol === -1) return { byCampus, byCode };
  for (const row of grid.slice(1)) {
    const cell = (i: number) => (i === -1 ? '' : String(row[i] ?? '').trim());
    const name = cell(nameCol);
    if (!name) continue;
    if (cell(campusCol) && !byCampus.has(cell(campusCol))) byCampus.set(cell(campusCol), name);
    if (cell(codeCol) && !byCode.has(cell(codeCol))) byCode.set(cell(codeCol), name);
  }
  return { byCampus, byCode };
}

/**
 * v1 getSchools: active units, one entry per Campus ID. v2 adds the campus details Find school
 * shows (location, coordinates, e-compound and its name from the optional E-Compound grid).
 */
export function parseSchools(grid: Grid, eCompoundGrid: Grid = []): School[] {
  if (grid.length < 2) return [];
  const col = columns(grid[0]!);
  const regionCol = col('region');
  const areaCol = col('area');
  const nameCol = col('campus', 'school', 'school name', 'campus name');
  const idCol = col('campus id', 'school id', 'schoolid');
  const statusCol = col('unit status', 'status');
  if (regionCol === -1 || areaCol === -1 || nameCol === -1 || idCol === -1) return [];
  const townCol = col('town');
  const cityCol = col('city');
  const addressCol = col('address');
  const latCol = col('latitude');
  const lngCol = col('longitude');
  const codeCol = col('ecompound no', 'ecompoundno', 'e-compound no');
  const names = eCompoundNames(eCompoundGrid);

  const byId = new Map<string, School>();
  for (const row of grid.slice(1)) {
    const cell = (i: number) => (i === -1 ? '' : String(row[i] ?? '').trim());
    if (statusCol !== -1 && cell(statusCol) && cell(statusCol).toLowerCase() !== 'active') continue;
    const schoolId = cell(idCol);
    const name = cell(nameCol);
    if (!schoolId || !name) continue;
    const details: Partial<School> = {
      town: cell(townCol),
      city: cell(cityCol),
      address: cell(addressCol),
      latitude: cell(latCol),
      longitude: cell(lngCol),
      eCompoundNo: cell(codeCol),
    };
    const existing = byId.get(schoolId);
    if (existing) {
      // A campus has one row per unit: fill any detail the first unit row left blank.
      for (const [k, v] of Object.entries(details) as [keyof School, string][]) if (v && !existing[k]) existing[k] = v;
      continue;
    }
    const school: School = { schoolId, name, region: cell(regionCol), area: cell(areaCol) };
    for (const [k, v] of Object.entries(details) as [keyof School, string][]) if (v) school[k] = v;
    byId.set(schoolId, school);
  }
  for (const school of byId.values()) {
    const ecName = names.byCampus.get(school.schoolId) ?? (school.eCompoundNo ? names.byCode.get(school.eCompoundNo) : undefined);
    if (ecName) school.eCompoundName = ecName;
  }
  return [...byId.values()];
}

// ---- dashboard (v1 getDashboardData / summarize) ----

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** The only columns buildDashboard reads, so the server can fetch these instead of whole rows. */
export const DASHBOARD_COLUMNS: readonly string[] = [
  'Survey ID',
  'School ID',
  'Campus Name',
  'Region',
  'Area',
  'Timestamp',
  'Overall Score',
  'Rating Band',
  'Major Score',
  'Minor Score',
  ...CRITICAL_ITEMS.map(criticalColumn),
];

function rowToCaptured(r: SheetRow): CapturedSchool | null {
  const overallRaw = r['Overall Score'];
  const overall = overallRaw ? Number(overallRaw) : NaN;
  if (!r['School ID'] || Number.isNaN(overall)) return null;
  const criticalItems: Record<string, number | null> = {};
  for (const name of CRITICAL_ITEMS) criticalItems[name] = num(r[criticalColumn(name)]);
  return {
    schoolId: r['School ID'],
    surveyId: r['Survey ID'] || '',
    name: r['Campus Name'] || r['School ID'],
    region: r['Region'] || '',
    area: r['Area'] || '',
    date: r['Timestamp'] || '',
    overall,
    band: (r['Rating Band'] as RatingBand) || ratingBand(overall) || 'Poor',
    major: num(r['Major Score']),
    minor: num(r['Minor Score']),
    criticalItems,
  };
}

function averageOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export function buildDashboard(totalSchools: number, rows: readonly SheetRow[]): DashboardData {
  // Every location row repeats the campus scores: one row per Survey ID is the rollup.
  const seenSurveyIds = new Set<string>();
  const surveys: CapturedSchool[] = [];
  for (const r of rows) {
    const surveyId = r['Survey ID'];
    if (surveyId && seenSurveyIds.has(surveyId)) continue;
    if (surveyId) seenSurveyIds.add(surveyId);
    const s = rowToCaptured(r);
    if (s) surveys.push(s);
  }
  // Latest submission per school (FR-DASH-2).
  const byKey = new Map<string, CapturedSchool>();
  for (const s of surveys) {
    const existing = byKey.get(s.schoolId);
    if (!existing || s.date > existing.date) byKey.set(s.schoolId, s);
  }
  const captured = [...byKey.values()];

  const distribution: Record<RatingBand, number> = { Excellent: 0, Good: 0, Average: 0, Poor: 0 };
  for (const s of captured) distribution[s.band]++;
  const averageScore = captured.length ? captured.reduce((sum, s) => sum + s.overall, 0) / captured.length : null;
  const criticalItemAverages: Record<string, number | null> = {};
  for (const name of CRITICAL_ITEMS) criticalItemAverages[name] = averageOf(captured.map((s) => s.criticalItems[name] ?? null));
  const regionMap = new Map<string, { total: number; count: number }>();
  for (const s of captured) {
    const entry = regionMap.get(s.region) ?? { total: 0, count: 0 };
    entry.total += s.overall;
    entry.count += 1;
    regionMap.set(s.region, entry);
  }
  const byRegion = [...regionMap.entries()]
    .map(([region, { total, count }]) => ({ region, average: total / count, count }))
    .sort((a, b) => a.region.localeCompare(b.region));
  const uniqueSchoolsCaptured = new Set(captured.map((s) => s.schoolId)).size;
  const inScope = Math.max(totalSchools, uniqueSchoolsCaptured);
  return {
    totalSchools: inScope,
    captured: uniqueSchoolsCaptured,
    pending: inScope - uniqueSchoolsCaptured,
    averageScore,
    overallBand: ratingBand(averageScore),
    averageMajorScore: averageOf(captured.map((s) => s.major)),
    averageMinorScore: averageOf(captured.map((s) => s.minor)),
    criticalItemAverages,
    distribution,
    byRegion,
    schools: [...captured].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

// ---- one survey (v1 findSurvey) ----

function drillingCheckFromRow(row: SheetRow): DrillingCheck {
  return {
    done: (row['Drilling Check Done'] ?? '') as DrillingCheck['done'],
    pointMarked: (row['Drilling Point Marked'] ?? '') as DrillingCheck['pointMarked'],
    slabAssessment: (row['Slab Thickness Assessment'] ?? '') as DrillingCheck['slabAssessment'],
    slabThicknessMm: row['Slab Thickness (mm)'] ?? '',
    screedThicknessMm: row['Roof Screeding Thickness (mm)'] ?? '',
    holeRepaired: (row['Drilled Hole Repaired (Grout/Epoxy)'] ?? '') as DrillingCheck['holeRepaired'],
  };
}

function siteChecksFromRow(row: SheetRow): SiteChecks {
  const factors = (row['Building Risk Factors'] ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  return {
    roofAccessType: (row['Roof Access Type'] ?? '') as SiteChecks['roofAccessType'],
    overflowDisposal: (row['Overflow Disposal System'] ?? '') as SiteChecks['overflowDisposal'],
    roofClean: (row['Roof Clean of Dirt and Vegetation'] ?? '') as SiteChecks['roofClean'],
    rainSpoutsClear: (row['Rain Spouts Clear'] ?? '') as SiteChecks['rainSpoutsClear'],
    riskFactors: factors,
    riskFactorOther: row['Risk Factor (Other)'] ?? '',
  };
}

function common(surveyId: string, first: SheetRow): Omit<FoundSurvey, 'rubricVersion' | 'conditions' | 'items'> {
  const overall = num(first['Overall Score']);
  return {
    surveyId,
    campusName: first['Campus Name'] ?? '',
    region: first['Region'] ?? '',
    area: first['Area'] ?? '',
    submittedAt: first['Timestamp'] ?? '',
    apm: first['Accompanying Engineering Staff'] ?? first['Accompanying APM'] ?? '',
    asm: first['Responding ASM'] ?? '',
    principal: first['School Principal'] ?? '',
    powerSupply: first['Power Supply'] ?? '',
    structuralConcern: first['Structural Concern Observed'] ?? '',
    buildingStructure: first['Suggested Structural Type'] ?? '',
    typeOfStructure: first['Type of Structure (Visual Inspection)'] ?? '',
    centerBeam: first['Center Beam in Classrooms'] ?? '',
    drillingCheck: drillingCheckFromRow(first),
    siteChecks: siteChecksFromRow(first),
    complaints: first['Major Complaints'] ?? '',
    overall,
    functionality: num(first['Functionality Score']),
    safety: num(first['Safety Score']),
    aesthetics: num(first['Aesthetics Score']),
    ratingBandLabel: first['Rating Band'] || ratingBand(overall) || '',
    startTime: first['Start Time'] ?? '',
    endTime: first['End Time'] || first['Timestamp'] || '',
    timeTakenSeconds: num(first['Time Taken (seconds)']),
    itemsCoveredPercent: num(first['Items Covered (%)']),
    additionalDrillHoles: first['Additional Drill Holes'] ?? '',
  };
}

/** Rows are the location rows of one Survey ID. */
export function foundSurveyFromRows(surveyId: string, rows: readonly SheetRow[]): FoundSurvey | null {
  const first = rows[0];
  if (!first) return null;
  const version = first['Rubric Version'] ?? '';
  const groups = rubricGroupsFor(version);
  const locations: SurveyLocation[] = rows.map((row, i) => {
    const scores: Record<string, Condition> = {};
    for (const group of groups) {
      const value = cellCondition(row[group.name] ?? '');
      if (value) scores[group.name] = value;
    }
    return {
      id: String(i),
      floorLevel: (row['Floor Level'] || 'Ground') as SurveyLocation['floorLevel'],
      type: (row['Location Type'] || 'Classroom') as SurveyLocation['type'],
      name: row['Location Name'] ?? '',
      scores,
      photos: {},
      notes: {},
    };
  });
  return {
    ...common(surveyId, first),
    rubricVersion: version,
    conditions: {},
    aggregatedScores: aggregateLocations(locations, groups),
    items: groups,
    locations: locations.map((l, i) => ({
      floorLevel: l.floorLevel,
      type: l.type,
      name: l.name,
      scores: l.scores,
      columnCrackOver3mm: rows[i]?.['Column Crack > 3 mm'] ?? '',
      schmidtAvailable: rows[i]?.['Schmidt Hammer Available'] ?? '',
      schmidtReading: rows[i]?.['Schmidt Hammer Reading'] ?? '',
    })),
  };
}

// ---- Drive naming (v1 drive.ts) ----

/** Drive for Desktop maps names onto a filesystem: drop the rubric "*" and keep "/" from splitting folders. */
export function sanitizeName(name: string): string {
  return name.replace(/\*/g, '').replace(/[/\\]/g, '-').replace(/\s+/g, ' ').trim();
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * {Region}/{Campus}/{YYYY-MM-DD} MQI Survey - {id8}/[{Floor} - {Type} - {Name}/] and the file name,
 * exactly as v1 lays photos out. The date is the survey's start (UTC), as v1 used at attach time.
 */
export function photoLocation(p: {
  region: string;
  campusName: string;
  surveyId: string;
  date: string;
  itemName: string;
  mimeType: string;
  location?: { floorLevel: string; type: string; name: string };
}): { folders: string[]; fileName: string } {
  const folders = [
    sanitizeName(p.region || 'Unspecified Region'),
    sanitizeName(p.campusName || 'Unspecified Campus'),
    `${p.date.slice(0, 10)} MQI Survey - ${p.surveyId.split('-')[0]}`,
  ];
  if (p.location) folders.push(sanitizeName(`${p.location.floorLevel} - ${p.location.type} - ${p.location.name}`));
  return { folders, fileName: `${sanitizeName(p.itemName) || 'Photo'}.${EXT[p.mimeType] ?? 'jpg'}` };
}
