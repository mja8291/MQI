import { describe, expect, test } from 'vitest';
import {
  DERIVED_ITEMS,
  FLOOR_LOCATION_TYPES,
  LOCATION_CARDS,
  OVERFLOW_ITEM,
  RUBRIC_GROUPS,
  RUBRIC_GROUPS_20261028,
  RUBRIC_VERSION,
  SLAB_ASSESSMENT_ITEM,
  buildDashboard,
  derivedScores,
  emptyDrillingCheck,
  emptySiteChecks,
  isLocationComplete,
  rubricGroupsFor,
  rubricGroupsForLocation,
  scoreSurveyFor,
  unsafeItemsInRow,
  withDerivedScores,
} from './index';
import type { SurveyLocation } from './index';

/** W56 (2026-11-07): rubric sheet re-weighted Safety with two new Roof items; Guardroom/Canteen & UGWT; dashboard Unsafe. */
describe('W56 rubric', () => {
  test('Safety weights follow the 2026-11-07 sheet and every division sums to 100', () => {
    const safety = Object.fromEntries(RUBRIC_GROUPS.filter((g) => g.category === 'Safety').map((g) => [g.name, g.weight]));
    expect(safety).toEqual({
      'Boundary wall': 7,
      'Main Gate': 7,
      'Access to roof area /tanks': 10,
      'Concrete/Plaster Soundness': 12,
      'Ceiling Condition i.e. cracks & seepage': 16,
      'Wall/Column Condition i.e. cracks': 10,
      'Roof Screeding/roof drainage': 10,
      'Window Shades': 7,
      [SLAB_ASSESSMENT_ITEM]: 10,
      [OVERFLOW_ITEM]: 4,
      'Distribution Board': 7,
    });
    for (const c of ['Safety', 'Functionality', 'Aesthetics'] as const)
      expect(RUBRIC_GROUPS.filter((g) => g.category === c).reduce((a, g) => a + g.weight, 0)).toBe(100);
  });

  test('2026-10-28 surveys keep their own frozen list', () => {
    expect(RUBRIC_VERSION >= '2026-11-07').toBe(true); // W68 moved on to 2026-11-11
    expect(rubricGroupsFor('2026-10-28')).toBe(RUBRIC_GROUPS_20261028);
    expect(RUBRIC_GROUPS_20261028).toHaveLength(31);
    expect(RUBRIC_GROUPS_20261028.find((g) => g.name === 'Ceiling Condition i.e. cracks & seepage')!.weight).toBe(20);
  });

  test('the derived items are not picked at the Roof location, so it is complete without them', () => {
    expect(DERIVED_ITEMS).toEqual([SLAB_ASSESSMENT_ITEM, OVERFLOW_ITEM]);
    const roofItems = rubricGroupsForLocation('Roof').map((g) => g.name);
    expect(roofItems).not.toContain(SLAB_ASSESSMENT_ITEM);
    expect(isLocationComplete({ type: 'Roof', scores: Object.fromEntries(roofItems.map((n) => [n, 'Good'])) })).toBe(true);
  });

  test('scored from the drilling card (worst hole) and the overflow answer; nothing when not answered', () => {
    const site = { ...emptySiteChecks(), overflowDisposal: 'Provided' as const };
    expect(derivedScores({ ...emptyDrillingCheck(), done: 'YES', slabAssessment: 'Ok' }, site)).toEqual({ [SLAB_ASSESSMENT_ITEM]: 'Good', [OVERFLOW_ITEM]: 'Good' });
    const holes = { ...emptyDrillingCheck(), done: 'YES' as const, slabAssessment: 'Ok' as const, extraHoles: [{ slabThicknessMm: '1', screedThicknessMm: '1', slabAssessment: 'Unsafe' as const }] };
    expect(derivedScores(holes, { ...site, overflowDisposal: 'Not provided' })).toEqual({ [SLAB_ASSESSMENT_ITEM]: 'Very Poor', [OVERFLOW_ITEM]: 'Very Poor' });
    expect(derivedScores({ ...emptyDrillingCheck(), done: 'NO' }, emptySiteChecks())).toEqual({});
  });

  test('only Roof locations carry them, and they change the Safety score', () => {
    const roof: SurveyLocation = { id: 'r', floorLevel: 'Roof', type: 'Roof', name: 'Roof 1', scores: { 'Roof Screeding/roof drainage': 'Good' }, photos: {}, notes: {} };
    const room: SurveyLocation = { ...roof, id: 'k', floorLevel: 'Ground', type: 'Classroom', name: 'KG A', scores: { 'Ceiling Condition i.e. cracks & seepage': 'Good' } };
    const drilling = { ...emptyDrillingCheck(), done: 'YES' as const, slabAssessment: 'Unsafe' as const };
    const out = withDerivedScores([roof, room], drilling, { ...emptySiteChecks(), overflowDisposal: 'Provided' });
    expect(out[0]!.scores[SLAB_ASSESSMENT_ITEM]).toBe('Very Poor');
    expect(out[1]!.scores[SLAB_ASSESSMENT_ITEM]).toBeUndefined();
    // Safety: Screeding 100 (w10), Ceiling 100 (w16), Slab 25 (w10), Overflow 100 (w4) → (1000+1600+250+400)/40
    expect(scoreSurveyFor(out, RUBRIC_VERSION).categories.Safety.score).toBeCloseTo(3250 / 40, 6);
  });
});

describe('W56 Guardroom / Canteen & UGWT', () => {
  test('on External behind one card; Guardroom has Toilet items; the W56 type "Canteen & UGWT" (kept for its surveys) has Other Room items', () => {
    expect(FLOOR_LOCATION_TYPES.External).toEqual(expect.arrayContaining(['Guardroom', 'Canteen', 'UGWT']));
    expect(FLOOR_LOCATION_TYPES.External).not.toContain('Canteen & UGWT');
    expect(LOCATION_CARDS[0]).toEqual({ label: 'Guardroom/Canteen & UGWT', names: { Guardroom: 'Guardroom', Canteen: 'Canteen', UGWT: 'UGWT' }, legacy: ['Canteen & UGWT'] });
    const names = (t: Parameters<typeof rubricGroupsForLocation>[0]) => rubricGroupsForLocation(t).map((g) => g.name);
    // W59: plus Distribution Board.
    expect(names('Guardroom')).toEqual(names('Toilet').concat('Distribution Board').sort((a, b) => names('Guardroom').indexOf(a) - names('Guardroom').indexOf(b)));
    // W70: a named Other Room (Pantry alone adds a basin and a drain).
    expect(names('Canteen & UGWT')).toEqual(rubricGroupsForLocation('Other Room (Staff, Principal, Admin, Store etc.)', 'Staff room').map((g) => g.name));
  });
});

describe('W56 dashboard Unsafe', () => {
  const row = (surveyId: string, cells: Record<string, string>) => ({
    'Survey ID': surveyId,
    'School ID': '947',
    'Campus Name': 'OGS',
    Timestamp: `2026-11-0${surveyId === 'a' ? 7 : 6}T10:00:00Z`,
    'Overall Score': '80',
    'Rubric Version': RUBRIC_VERSION,
    ...cells,
  });

  test('any Unsafe item flags the survey; Wall Unsafe alone does not, Column Unsafe does', () => {
    expect(unsafeItemsInRow(row('a', { 'Wall/Column Condition i.e. cracks': 'Wall Unsafe' }))).toEqual([]);
    expect(unsafeItemsInRow(row('a', { 'Wall/Column Condition i.e. cracks': 'Column Unsafe, Wall Unsafe' }))).toEqual(['Column']);
    expect(unsafeItemsInRow(row('a', { 'Ceiling Condition i.e. cracks & seepage': 'Very Poor' }))).toEqual(['Ceiling Condition i.e. cracks & seepage']);
    expect(unsafeItemsInRow(row('a', { [SLAB_ASSESSMENT_ITEM]: 'Very Poor' }))).toEqual([SLAB_ASSESSMENT_ITEM]);
    // "NO" on overflow and "Not Available" roof access are not Unsafe answers; neither is an ordinary Very Poor.
    expect(unsafeItemsInRow(row('a', { [OVERFLOW_ITEM]: 'Very Poor', 'Access to roof area /tanks': 'Very Poor', 'Main Gate': 'Very Poor' }))).toEqual([]);
  });

  test('flags gathered over every location row, on the latest and the earlier surveys', () => {
    const d = buildDashboard(1, [
      row('a', { 'Ceiling Condition i.e. cracks & seepage': 'Good' }),
      row('a', { 'Window Shades': 'Very Poor' }),
      row('b', { 'Wall/Column Condition i.e. cracks': 'Column Unsafe' }),
    ]);
    const s = d.schools[0]!;
    expect(s.surveyId).toBe('a');
    expect(s.unsafeItems).toEqual(['Window Shades (Chajja)']);
    expect(s.earlier![0]!.unsafeItems).toEqual(['Column']);
  });
});
