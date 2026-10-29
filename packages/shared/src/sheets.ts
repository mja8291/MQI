import { CRITICAL_ITEMS, ratingBand } from './scoring';
import { RUBRIC_GROUPS, unsafePartsText } from './rubric/items';
import { itemsCovered } from './rubric/versions';
import type { AttachmentMeta, SubmittedSurvey } from './survey';
import { drillHolesText } from './types';

/**
 * Port of v1 src/lib/sheets/responses.ts: same header names, same values. The responses tab is
 * v1's responses tab renamed (parity-notes D15); its header is unchanged.
 *
 * v1 wrote every value as a string with valueInputOption USER_ENTERED, so Sheets turned
 * numeric strings ("85") into numbers. v2 writes RAW (no formula injection), so it must send
 * those columns as real numbers to keep the cells, and every downstream pivot, identical.
 * NUMERIC_COLUMNS is that list; tests/fixtures check it against the live tab's cell types.
 */

export const RESPONSES_TAB = 'MQI Survey Responses';
export const ATTACHMENTS_TAB = 'MQI Survey Attachments';

export type Cell = string | number;

export function criticalColumn(itemName: string): string {
  return `Critical: ${itemName}`;
}

const COMMON_HEADER = [
  'Survey ID',
  'Timestamp',
  'Campus Name',
  'School ID',
  'Region',
  'Area',
  'Responding ASM',
  // v2 (W11): v1's "Accompanying APM", renamed in place; several names are joined with "; ".
  'Accompanying Engineering Staff',
  'School Principal',
  'Power Supply',
  'Location Name',
  'Major Complaints',
  'Overall Score',
  'Functionality Score',
  'Safety Score',
  'Aesthetics Score',
  'Rating Band',
  'Oath',
];

const TRAILING_HEADER = [
  'Major Score',
  'Minor Score',
  'Start Time',
  'End Time',
  'Time Taken (seconds)',
  ...CRITICAL_ITEMS.map(criticalColumn),
  'Paused Duration (seconds)',
  'Structural Concern Observed',
  'Suggested Structural Type',
  'Type of Structure (Visual Inspection)',
  'Center Beam in Classrooms',
  'Drilling Check Done',
  'Drilling Point Marked',
  'Slab Thickness (mm)',
  'Roof Screeding Thickness (mm)',
  'Drilled Hole Repaired (Grout/Epoxy)',
  'Slab Thickness Assessment',
  'Roof Access Type',
  'Overflow Disposal System',
  'Roof Clean of Dirt and Vegetation',
  'Rain Spouts Clear',
  'Building Risk Factors',
  'Risk Factor (Other)',
  'Submitted By',
  'Submitter Email',
  'Rubric Version',
  // v2 only (cutover plan): blank on every v1 row, "v2" on every row this app writes.
  'Source App',
  // v2 (W22): rubric item groups scored at least once in the survey, as a percentage.
  'Items Covered (%)',
  // v2 (W24): levels confirmed for the campus, e.g. "External, Ground, First, Roof".
  'Applicable Levels',
  // v2 (W36): drill holes after the first, e.g. "Hole 2: slab 120 mm, screed 40 mm, Ok".
  'Additional Drill Holes',
];

export const RESPONSES_HEADER = [
  ...COMMON_HEADER,
  'Floor Level',
  'Location Type',
  'Classroom Grade',
  'Classroom Section',
  ...RUBRIC_GROUPS.map((g) => g.name),
  ...TRAILING_HEADER,
];

export const ATTACHMENTS_HEADER = ['Survey ID', 'Item Name', 'Location Name', 'Photo URL', 'Note'];

/** Columns v1 wrote as numeric strings (so USER_ENTERED stored numbers). */
export const NUMERIC_COLUMNS: ReadonlySet<string> = new Set([
  'Items Covered (%)',
  'Overall Score',
  'Functionality Score',
  'Safety Score',
  'Aesthetics Score',
  'Major Score',
  'Minor Score',
  'Time Taken (seconds)',
  'Paused Duration (seconds)',
  'Slab Thickness (mm)',
  'Roof Screeding Thickness (mm)',
  ...CRITICAL_ITEMS.map(criticalColumn),
]);

const STRICT_NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** The value USER_ENTERED would have stored for a numeric column; anything else stays text. */
export function toCell(column: string, value: string): Cell {
  const v = value.trim();
  if (NUMERIC_COLUMNS.has(column) && v !== '' && STRICT_NUMBER.test(v)) return Number(v);
  return value;
}

export interface Submitter {
  name: string;
  email: string;
}

const rounded = (n: number | null) => (n === null ? '' : String(Math.round(n)));

/** v1 commonFields(), field for field. `timestamp` is the server's write time. */
function commonFields(s: SubmittedSurvey, submitter: Submitter, timestamp: string, locationName: string): Record<string, string> {
  const d = s.drillingCheck;
  const site = s.siteChecks;
  const fields: Record<string, string> = {
    'Survey ID': s.id,
    Timestamp: timestamp,
    'Campus Name': s.school.name,
    'School ID': s.school.schoolId,
    Region: s.school.region,
    Area: s.school.area,
    'Responding ASM': s.asm,
    'Accompanying Engineering Staff': s.apm,
    'School Principal': s.principal,
    'Power Supply': s.powerSupply,
    'Structural Concern Observed': s.structuralConcern,
    'Suggested Structural Type': s.buildingStructure,
    'Type of Structure (Visual Inspection)': s.typeOfStructure,
    'Center Beam in Classrooms': s.centerBeam,
    'Drilling Check Done': d.done,
    'Drilling Point Marked': d.done === 'YES' ? d.pointMarked : '',
    'Slab Thickness (mm)': d.done === 'YES' ? d.slabThicknessMm : '',
    'Roof Screeding Thickness (mm)': d.done === 'YES' ? d.screedThicknessMm : '',
    'Drilled Hole Repaired (Grout/Epoxy)': d.done === 'YES' ? d.holeRepaired : '',
    'Slab Thickness Assessment': d.done === 'YES' ? (d.slabAssessment ?? '') : '',
    'Additional Drill Holes': d.done === 'YES' ? drillHolesText(d.extraHoles) : '',
    'Roof Access Type': site.roofAccessType,
    'Overflow Disposal System': site.overflowDisposal,
    'Roof Clean of Dirt and Vegetation': site.roofClean,
    'Rain Spouts Clear': site.rainSpoutsClear,
    'Building Risk Factors': site.riskFactors.join('; '),
    'Risk Factor (Other)': site.riskFactors.includes('Any other') ? site.riskFactorOther : '',
    'Rubric Version': s.rubricVersion,
    'Submitted By': submitter.name,
    'Submitter Email': submitter.email,
    'Location Name': locationName,
    'Major Complaints': s.complaints,
    'Overall Score': rounded(s.scores.overall),
    'Functionality Score': rounded(s.scores.functionality),
    'Safety Score': rounded(s.scores.safety),
    'Aesthetics Score': rounded(s.scores.aesthetics),
    'Rating Band': ratingBand(s.scores.overall) ?? '',
    Oath: 'Affirm',
    'Major Score': rounded(s.scores.major),
    'Minor Score': rounded(s.scores.minor),
    'Start Time': s.startTime ?? '',
    'End Time': s.endTime,
    'Time Taken (seconds)': s.timeTakenSeconds === null ? '' : String(s.timeTakenSeconds),
    'Paused Duration (seconds)': String(s.pausedSeconds),
    'Source App': 'v2',
    'Items Covered (%)': String(Math.round(itemsCovered(s.locations, s.rubricVersion).percent)),
    'Applicable Levels': s.levels ? s.levels.join(', ') : '',
  };
  for (const [name, score] of Object.entries(s.scores.criticalItems)) {
    fields[criticalColumn(name)] = rounded(score);
  }
  return fields;
}

/** One row per location (v1 responses.ts), header name → value. */
export function responseRows(s: SubmittedSurvey, submitter: Submitter, timestamp: string): Record<string, string>[] {
  return s.locations.map((loc) => {
    const fields: Record<string, string> = {
      ...commonFields(s, submitter, timestamp, loc.name),
      'Floor Level': loc.floorLevel,
      'Location Type': loc.type,
      'Classroom Grade': loc.classroomGrade ?? '',
      'Classroom Section': loc.classroomSection ?? '',
    };
    for (const [itemName, condition] of Object.entries(loc.scores)) {
      const parts = loc.unsafeParts?.[itemName];
      fields[itemName] = parts?.length ? unsafePartsText(parts) : condition;
    }
    return fields;
  });
}

/** Note-only attachment rows, written with the survey (v1 wrote notes in the same batch). */
export function noteRows(s: SubmittedSurvey): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const loc of s.locations) {
    for (const [itemName, note] of Object.entries(loc.notes)) {
      if (note.trim()) rows.push({ 'Survey ID': s.id, 'Item Name': itemName, 'Location Name': loc.name, 'Photo URL': '', Note: note });
    }
  }
  return rows;
}

/** The attachment row for one uploaded photo. */
export function photoRow(a: AttachmentMeta, photoUrl: string): Record<string, string> {
  return { 'Survey ID': a.surveyId, 'Item Name': a.itemName, 'Location Name': a.locationName, 'Photo URL': photoUrl, Note: '' };
}

/**
 * Lays header-keyed rows out against a tab's real header, matched case-insensitively (v1
 * appendRowsByHeader), typing numeric columns. Unknown header columns get ''.
 */
export function layoutRows(header: readonly string[], rows: readonly Record<string, string>[]): Cell[][] {
  const lower = header.map((h) => h.trim().toLowerCase());
  return rows.map((fields) => {
    const byLower = new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v] as const));
    return lower.map((h, i) => {
      const v = byLower.get(h);
      return v === undefined ? '' : toCell(header[i]!.trim(), v);
    });
  });
}

/** Columns the rows need that the tab lacks, in desired-header order (v1 addMissingColumns). */
export function missingColumns(existing: readonly string[], desired: readonly string[]): string[] {
  const have = new Set(existing.map((h) => h.trim().toLowerCase()));
  return [...new Set(desired)].filter((c) => !have.has(c.toLowerCase()));
}
