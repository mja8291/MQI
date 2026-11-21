import { describe, expect, it } from 'vitest';
import type { CapturedSchool } from './api';
import { campusBreakup, parsePlan } from './campus-plan';
import { foundSurveyFromRows, unsafeItemsInRow } from './read-models';
import { buildReportModel, reportSourceFromFound, type ReportSource } from './report/model';
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from './report/fixture-01a1911f';
import { RUBRIC_GROUPS } from './rubric/items';
import { RUBRIC_VERSION } from './rubric/rubric-version';
import { CEILING_ITEM, unsafeItemsAt, unsafeLevel } from './safety-levels';
import { COLUMN_ITEM, type Condition } from './types';

/** W74 (2026-11-16): ceiling cracks/seepage; Critically vs Partially Unsafe. */
describe('W74 Critically / Partially Unsafe', () => {
  it('the ceiling asks cracks and/or seepage when Unsafe', () => {
    expect(RUBRIC_GROUPS.find((g) => g.name === CEILING_ITEM)!.unsafeParts).toEqual(['Cracks', 'Seepage']);
  });

  it('critical: Soundness, ceiling cracks, Column; partial: everything else; Wall alone is not unsafe', () => {
    expect(unsafeLevel(['Concrete/Plaster Soundness'])).toBe('partial'); // W85: a soundness Unsafe from before W85 (no part)
    expect(unsafeLevel(['Soundness slab'])).toBe('critical'); // W85
    expect(unsafeLevel(['Ceiling cracks'])).toBe('critical');
    expect(unsafeLevel(['Column'])).toBe('critical');
    expect(unsafeLevel([CEILING_ITEM])).toBe('critical'); // a ceiling Unsafe from before W74 (no detail)
    expect(unsafeLevel(['Ceiling seepage'])).toBe('partial');
    expect(unsafeLevel(['Roof Screeding/roof drainage', 'Window Shades (Chajja)'])).toBe('partial');
    expect(unsafeLevel(['Ceiling seepage', 'Column'])).toBe('critical');
    expect(unsafeLevel([])).toBeNull();
    const row = (cells: Record<string, string>) => ({ 'Rubric Version': RUBRIC_VERSION, ...cells });
    expect(unsafeItemsInRow(row({ [COLUMN_ITEM]: 'Wall Unsafe' }))).toEqual([]);
    expect(unsafeItemsInRow(row({ [CEILING_ITEM]: 'Cracks Unsafe, Seepage Unsafe' }))).toEqual(['Ceiling cracks', 'Ceiling seepage']);
    expect(unsafeItemsInRow(row({ [CEILING_ITEM]: 'Seepage Unsafe' }))).toEqual(['Ceiling seepage']);
    // Older rows (and phones not yet updated) store a plain Unsafe ceiling as Very Poor.
    expect(unsafeItemsInRow(row({ [CEILING_ITEM]: 'Very Poor' }))).toEqual([CEILING_ITEM]);
  });

  it('a location with ceiling seepage only lists it as such', () => {
    const loc = { scores: { [CEILING_ITEM]: 'Very Poor' as Condition }, unsafeParts: { [CEILING_ITEM]: ['Seepage'] } };
    expect(unsafeItemsAt(loc, RUBRIC_GROUPS)).toEqual(['Ceiling seepage']);
  });

  it('the report names the level and the ceiling parts', () => {
    const src = reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!);
    // The fixture's Principal Room has Column Unsafe: critical.
    expect(buildReportModel(src).safetyLevel).toBe('critical');
    // Only ceiling seepage, everything else OK: partial.
    const calm: ReportSource = {
      ...src,
      structuralConcern: 'NO',
      locations: src.locations.map((l) => ({
        ...l,
        scores: Object.fromEntries(Object.entries(l.scores).map(([k, v]) => [k, v === 'Very Poor' ? 'Good' : v])) as typeof l.scores,
        unsafeParts: {},
      })),
    };
    const kg = calm.locations.findIndex((l) => l.name === 'KG A');
    calm.locations[kg] = { ...calm.locations[kg]!, scores: { ...calm.locations[kg]!.scores, [CEILING_ITEM]: 'Very Poor' }, unsafeParts: { [CEILING_ITEM]: ['Seepage'] } };
    const m = buildReportModel(calm);
    expect(m.safetyLevel).toBe('partial');
    expect(m.alerts.some((a) => /Ceiling.*unsafe in .*KG A.*: seepage$/.test(a))).toBe(true);
  });

  it('the dashboard counts Critically Unsafe campuses', () => {
    const plan = parsePlan([
      { 'School IDs': '1', 'E Compound No': 'E1', Campus: 'A', Region: 'R', 'Survey Category': 'Survey with App', Assessment: '' },
      { 'School IDs': '2', 'E Compound No': 'E2', Campus: 'B', Region: 'R', 'Survey Category': 'Survey with App', Assessment: '' },
    ]);
    const c = (id: string, name: string, unsafeItems: string[]) => ({ schoolId: id, surveyId: id, name, region: 'R', area: 'X', date: '2026-11-16', overall: 70, band: 'Good', major: 70, minor: 70, criticalItems: {}, unsafeItems }) as CapturedSchool;
    const b = campusBreakup(plan, [c('1', 'A', ['Ceiling cracks']), c('2', 'B', ['Ceiling seepage'])]);
    expect(b.withApp).toMatchObject({ surveyedUnsafe: 2, surveyedCritical: 1 });
  });
});
