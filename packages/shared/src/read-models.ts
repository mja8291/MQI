import type { CapturedSchool, DashboardData, FoundSurvey } from './api';
import { CRITICAL_ITEMS, aggregateMethod2, ratingBand } from './scoring';
import { criticalColumn } from './sheets';
import { method1ItemsFor, method2GroupsFor } from './rubric/versions';
import type { Condition, DrillingCheck, Method2Location, RatingBand, School, SiteChecks } from './types';

/**
 * Pure read-side logic ported from v1 (src/lib/sheets/{schools,dashboard}.ts,
 * src/lib/export/find-survey.ts, src/lib/sheets/drive.ts). The server feeds it sheet rows;
 * keeping it here lets Node tests pin v1's behaviour.
 */

export type SheetRow = Record<string, string>;

// ---- schools (v1 getSchools) ----

export function parseSchools(grid: readonly (readonly unknown[])[]): School[] {
  if (grid.length < 2) return [];
  const header = grid[0]!.map((h) => String(h).trim().toLowerCase());
  const colIndex = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = header.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const regionCol = colIndex('region');
  const areaCol = colIndex('area');
  const nameCol = colIndex('campus', 'school', 'school name', 'campus name');
  const idCol = colIndex('campus id', 'school id', 'schoolid');
  const statusCol = colIndex('unit status', 'status');
  if (regionCol === -1 || areaCol === -1 || nameCol === -1 || idCol === -1) return [];

  const seen = new Set<string>();
  const schools: School[] = [];
  for (const row of grid.slice(1)) {
    const cell = (i: number) => String(row[i] ?? '').trim();
    if (statusCol !== -1 && cell(statusCol) && cell(statusCol).toLowerCase() !== 'active') continue;
    const schoolId = cell(idCol);
    const name = cell(nameCol);
    if (!schoolId || !name || seen.has(schoolId)) continue;
    seen.add(schoolId);
    schools.push({ schoolId, name, region: cell(regionCol), area: cell(areaCol) });
  }
  return schools;
}

// ---- dashboard (v1 getDashboardData / summarize) ----

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function rowToCaptured(r: SheetRow, method: 1 | 2): CapturedSchool | null {
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
    method,
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

export function buildDashboard(totalSchools: number, m1Rows: readonly SheetRow[], m2Rows: readonly SheetRow[]): DashboardData {
  const fromM1 = m1Rows.map((r) => rowToCaptured(r, 1)).filter((s): s is CapturedSchool => s !== null);
  // Method 2 repeats the campus scores on every location row: one row per Survey ID is the rollup.
  const seenSurveyIds = new Set<string>();
  const fromM2: CapturedSchool[] = [];
  for (const r of m2Rows) {
    const surveyId = r['Survey ID'];
    if (surveyId && seenSurveyIds.has(surveyId)) continue;
    if (surveyId) seenSurveyIds.add(surveyId);
    const s = rowToCaptured(r, 2);
    if (s) fromM2.push(s);
  }
  // Latest submission per (school, method); a school surveyed by both methods appears twice (FR-DASH-2).
  const byKey = new Map<string, CapturedSchool>();
  for (const s of [...fromM1, ...fromM2]) {
    const key = `${s.schoolId}::${s.method}`;
    const existing = byKey.get(key);
    if (!existing || s.date > existing.date) byKey.set(key, s);
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

function common(surveyId: string, first: SheetRow): Omit<FoundSurvey, 'method' | 'rubricVersion' | 'conditions' | 'items'> {
  const overall = num(first['Overall Score']);
  return {
    surveyId,
    campusName: first['Campus Name'] ?? '',
    region: first['Region'] ?? '',
    area: first['Area'] ?? '',
    submittedAt: first['Timestamp'] ?? '',
    apm: first['Accompanying APM'] ?? '',
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
  };
}

/** Rows are those of one Survey ID (a Method 1 row, or the Method 2 location rows). */
export function foundSurveyFromRows(surveyId: string, m1Row: SheetRow | undefined, m2Rows: readonly SheetRow[]): FoundSurvey | null {
  if (m1Row) {
    const version = m1Row['Rubric Version'] ?? '';
    const items = method1ItemsFor(version);
    const conditions: Record<string, string> = {};
    for (const item of items) conditions[item.name] = m1Row[item.name] ?? '';
    return { ...common(surveyId, m1Row), method: 1, rubricVersion: version, conditions, items };
  }
  const first = m2Rows[0];
  if (!first) return null;
  const version = first['Rubric Version'] ?? '';
  const groups = method2GroupsFor(version);
  const locations: Method2Location[] = m2Rows.map((row, i) => {
    const scores: Record<string, Condition> = {};
    for (const group of groups) {
      const value = row[group.name];
      if (value) scores[group.name] = value as Condition;
    }
    return {
      id: String(i),
      floorLevel: (row['Floor Level'] || 'Ground') as Method2Location['floorLevel'],
      type: (row['Location Type'] || 'Classroom') as Method2Location['type'],
      name: row['Location Name'] ?? '',
      scores,
      photos: {},
      notes: {},
    };
  });
  return {
    ...common(surveyId, first),
    method: 2,
    rubricVersion: version,
    conditions: {},
    aggregatedScores: aggregateMethod2(locations, groups),
    items: groups,
    locations: locations.map((l) => ({ floorLevel: l.floorLevel, type: l.type, name: l.name, scores: l.scores })),
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
