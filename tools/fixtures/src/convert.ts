import { CRITICAL_ITEMS, criticalColumn, rubricGroupsFor } from '@mqi/shared';
import type { Condition, SurveyLocation } from '@mqi/shared';

/**
 * Turns response-tab rows (header-keyed, formatted strings exactly as the Sheets API returns
 * them) into golden fixtures. Only what scoring needs is kept: no names, emails or remarks,
 * so the fixtures can be committed.
 */

export type Row = Record<string, string>;

export interface StoredScores {
  overall: number | null;
  functionality: number | null;
  safety: number | null;
  aesthetics: number | null;
  major: number | null;
  minor: number | null;
  ratingBand: string;
  criticalItems: Record<string, number | null>;
}

export interface SurveyFixture {
  surveyId: string;
  rubricVersion: string;
  timestamp: string;
  locations: Pick<SurveyLocation, 'id' | 'floorLevel' | 'type' | 'name' | 'scores'>[];
  stored: StoredScores;
}

const CONDITIONS = new Set(['Good', 'Ok', 'Poor', 'Very Poor', 'N/A']);

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function stored(r: Row): StoredScores {
  const criticalItems: Record<string, number | null> = {};
  for (const name of CRITICAL_ITEMS) criticalItems[name] = num(r[criticalColumn(name)]);
  return {
    overall: num(r['Overall Score']),
    functionality: num(r['Functionality Score']),
    safety: num(r['Safety Score']),
    aesthetics: num(r['Aesthetics Score']),
    major: num(r['Major Score']),
    minor: num(r['Minor Score']),
    ratingBand: r['Rating Band'] ?? '',
    criticalItems,
  };
}

export function rowsFromGrid(grid: readonly (readonly unknown[])[]): Row[] {
  const [head, ...body] = grid;
  if (!head) return [];
  const header = head.map((h) => String(h ?? '').trim());
  return body
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '')])));
}

export function surveyFixtures(rows: readonly Row[]): SurveyFixture[] {
  const bySurvey = new Map<string, Row[]>();
  for (const r of rows) {
    const id = r['Survey ID'];
    if (!id) continue;
    bySurvey.set(id, [...(bySurvey.get(id) ?? []), r]);
  }
  return [...bySurvey.entries()].map(([surveyId, locationRows]) => {
    const first = locationRows[0]!;
    const version = first['Rubric Version'] ?? '';
    const groups = rubricGroupsFor(version);
    return {
      surveyId,
      rubricVersion: version,
      timestamp: first['Timestamp'] ?? '',
      locations: locationRows.map((row, i) => {
        const scores: Record<string, Condition> = {};
        for (const g of groups) {
          const v = row[g.name];
          if (v && CONDITIONS.has(v)) scores[g.name] = v as Condition;
        }
        return {
          id: String(i),
          floorLevel: (row['Floor Level'] || 'Ground') as SurveyLocation['floorLevel'],
          type: (row['Location Type'] || 'Classroom') as SurveyLocation['type'],
          name: row['Location Name'] ?? '',
          scores,
        };
      }),
      stored: stored(first),
    };
  });
}
