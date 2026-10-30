import { describe, expect, test } from 'vitest';
import {
  CATEGORIES,
  KNOWN_RUBRIC_VERSIONS,
  RUBRIC_GROUPS,
  RESPONSES_HEADER,
  RUBRIC_VERSION,
  can,
  canWrite,
  layoutRows,
  rubricGroupsFor,
  responseRows,
  missingColumns,
  noteRows,
  scoreSurvey,
  scoreSurveyFor,
  submissionIssues,
  submittedSurveySchema,
  applicableLevels,
  cellCondition,
  itemsCovered,
  oathText,
  rubricGroupsForLocation,
  NUMERIC_COLUMNS,
  joinStaff,
  splitStaff,
  toCell,
  uuidv7,
  COLUMN_ITEM,
  SCHMIDT_PHOTO,
  columnCheckApplies,
  columnCheckIssues,
  columnCheckLine,
  emptyColumnCheck,
  sheetOrder,
} from './index';
import type { SurveyLocation, SubmittedSurvey } from './index';

const rnd = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);

function loc(type: SurveyLocation['type'], name: string, scores: SurveyLocation['scores']): SurveyLocation {
  return { id: name, floorLevel: 'Ground', type, name, scores, photos: {}, notes: {} };
}

describe('rubric data', () => {
  test.each(KNOWN_RUBRIC_VERSIONS.filter(Boolean).map((v) => [v]))('rubric %s: every division sums to 100', (v) => {
    const groups = rubricGroupsFor(v);
    for (const c of CATEGORIES) {
      expect(groups.filter((g) => g.category === c).reduce((s, g) => s + g.weight, 0)).toBe(100);
    }
  });

  test('current list matches TRD Appendix A (31 groups: Safety 9, Functionality 15, Aesthetics 7)', () => {
    expect(RUBRIC_GROUPS).toHaveLength(31);
    expect(RUBRIC_GROUPS.filter((g) => g.category === 'Safety')).toHaveLength(9);
    expect(RUBRIC_GROUPS.filter((g) => g.category === 'Functionality')).toHaveLength(15);
    expect(RUBRIC_GROUPS.filter((g) => g.category === 'Aesthetics')).toHaveLength(7);
    expect(RUBRIC_GROUPS.every((g) => (g.category === 'Safety') === (g.aggregation === 'worst'))).toBe(true);
  });

  test('version lookup: blank reads the legacy list, unknown reads current', () => {
    expect(rubricGroupsFor('')).not.toBe(RUBRIC_GROUPS);
    expect(rubricGroupsFor(RUBRIC_VERSION)).toBe(RUBRIC_GROUPS);
    expect(rubricGroupsFor('2099-01-01')).toBe(RUBRIC_GROUPS);
  });
});

describe('scoring (unchanged v1 formulas)', () => {
  test('Safety takes the worst location, others the average', () => {
    const r = scoreSurvey([
      loc('Toilet', 'Girls Toilet', { 'Concrete/Plaster Soundness': 'Good', Paint: 'Good' }),
      loc('Toilet', 'Boys Toilet', { 'Concrete/Plaster Soundness': 'Very Poor', Paint: 'Poor' }),
    ]);
    expect(r.categories.Safety.score).toBe(25);
    expect(r.categories.Aesthetics.score).toBe(75);
  });

  test('N/A drops out and the rest renormalise', () => {
    const a = scoreSurvey([loc('Toilet', 'T', { Paint: 'Good', Plaster: 'N/A' })]);
    expect(a.categories.Aesthetics.score).toBe(100);
    expect(a.categories.Aesthetics.answeredWeight).toBe(35);
  });

  test('overall is the full-set weighted average, not a blend of division scores', () => {
    const r = scoreSurvey([loc('Roof', 'Roof 1', { 'Access to roof area /tanks': 'Good', Plaster: 'Poor' })]);
    // (25×10×100 + 30×8×50) / (25×10 + 30×8)
    expect(r.overall).toBeCloseTo((25 * 10 * 100 + 30 * 8 * 50) / (25 * 10 + 30 * 8), 10);
  });

  test('nothing scored gives null, not 0', () => {
    expect(scoreSurvey([]).overall).toBeNull();
  });

  test('the three Ceiling-filed watchlist entries share one value', () => {
    const r = scoreSurveyFor([loc('Classroom', 'KG A', { 'Ceiling Condition i.e. cracks & seepage': 'Very Poor' })], RUBRIC_VERSION);
    expect(r.criticalItems['Cracks visibility in roof']).toBe(25);
    expect(r.criticalItems['Roof leakage/seepage']).toBe(25);
    expect(r.criticalItems['Visibility of dampness']).toBe(25);
  });
});

function survey(overrides: Partial<SubmittedSurvey> = {}): SubmittedSurvey {
  const locations = [
    loc('Roof', 'Roof 1', {
      'Access to roof area /tanks': 'Good',
      'Roof Screeding/roof drainage': 'Good',
      'Water Storage (Overhead Tank)': 'Ok',
      'External Plumbing': 'Good',
      'Grill Gate': 'N/A',
      'Solar Panels/Inverter/Batteries': 'Good',
      Plaster: 'Poor',
      Masonry: 'Good',
    }),
  ];
  const r = scoreSurveyFor(locations, RUBRIC_VERSION);
  return {
    id: uuidv7(rnd, Date.UTC(2026, 9, 28)),
    rubricVersion: RUBRIC_VERSION,
    school: { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap West I' },
    asm: 'A',
    apm: 'B',
    principal: 'C',
    powerSupply: 'Solar',
    structuralConcern: 'NO',
    buildingStructure: 'RCC',
    typeOfStructure: 'RCC (Frame)',
    centerBeam: 'YES',
    drillingCheck: { done: 'YES', pointMarked: 'Ok', slabAssessment: 'Ok', slabThicknessMm: '125', screedThicknessMm: '50.5', holeRepaired: 'YES' },
    siteChecks: { roofAccessType: 'Ladder', overflowDisposal: 'Provided', roofClean: 'Yes', rainSpoutsClear: 'Yes', riskFactors: [], riskFactorOther: '' },
    complaints: '=HYPERLINK("http://x")',
    declaration: true,
    locations: locations as SubmittedSurvey['locations'],
    reviewPhotos: {},
    startTime: '2026-10-28T04:00:00.000Z',
    endTime: '2026-10-28T05:00:00.000Z',
    timeTakenSeconds: 3500,
    pausedSeconds: 100,
    scores: {
      overall: r.overall,
      functionality: r.categories.Functionality.score,
      safety: r.categories.Safety.score,
      aesthetics: r.categories.Aesthetics.score,
      major: r.major,
      minor: r.minor,
      criticalItems: r.criticalItems,
    },
    createdAt: '2026-10-28T04:00:00.000Z',
    updatedAt: '2026-10-28T05:00:00.000Z',
    ...overrides,
  };
}

describe('sheet rows (v1 responses.ts parity)', () => {
  const s = survey();
  const rows = responseRows(s, { name: 'Sam', email: 'sam@tcf.org.pk' }, '2026-10-28T05:00:01.000Z');

  test('one row per location with v1 field names and rounded scores', () => {
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row['Overall Score']).toBe(String(Math.round(s.scores.overall!)));
    expect(row['Rating Band']).toBeTruthy();
    expect(row['Oath']).toBe('Affirm');
    expect(row['Source App']).toBe('v2');
    expect(row['Submitter Email']).toBe('sam@tcf.org.pk');
    expect(row['Roof Screeding/roof drainage']).toBe('Good');
  });

  test('every written field is in the desired header', () => {
    for (const key of Object.keys(rows[0]!)) expect(RESPONSES_HEADER).toContain(key);
  });

  test('RAW typing: numeric columns become numbers, text (even formula-like) stays text', () => {
    expect(toCell('Overall Score', '85')).toBe(85);
    expect(toCell('Slab Thickness (mm)', '50.5')).toBe(50.5);
    expect(toCell('School ID', '0947')).toBe('0947');
    expect(toCell('Major Complaints', '=HYPERLINK("http://x")')).toBe('=HYPERLINK("http://x")');
    expect(toCell('Overall Score', '')).toBe('');
  });

  test('layout follows the live header, case-insensitively, blank for unknown columns', () => {
    const header = ['survey id', 'Old column', 'Overall Score', 'Major Complaints'];
    const [row] = layoutRows(header, rows);
    expect(row).toEqual([s.id, '', Math.round(s.scores.overall!), s.complaints]);
  });

  test('missing columns are appended in desired order, never renamed', () => {
    expect(missingColumns(['Survey ID', 'timestamp'], ['Survey ID', 'Timestamp', 'Source App'])).toEqual(['Source App']);
  });

  test('notes become note-only attachment rows', () => {
    const withNote = survey({ locations: [{ ...s.locations[0]!, notes: { Plaster: 'cracked', Masonry: '  ' } }] });
    expect(noteRows(withNote)).toEqual([{ 'Survey ID': withNote.id, 'Item Name': 'Plaster', 'Location Name': 'Roof 1', 'Photo URL': '', Note: 'cracked' }]);
  });
});

describe('submission rules (Appendix C)', () => {
  test('a complete survey passes schema and rules', () => {
    const s = survey();
    expect(submittedSurveySchema.safeParse(s).success).toBe(true);
    expect(submissionIssues(s)).toEqual([]);
  });

  test('W13: an item marked Unsafe needs a photo', () => {
    const s = survey();
    const roof = s.locations[0]!;
    const unsafe = survey({ locations: [{ ...roof, scores: { ...roof.scores, 'Roof Screeding/roof drainage': 'Very Poor' } }] });
    expect(submissionIssues(unsafe).map((i) => i.message)).toEqual(['Attach a photo of "Roof Screeding/roof drainage" at Roof 1: it is marked Unsafe.']);
    const withPhoto = survey({ locations: [{ ...unsafe.locations[0]!, photos: { 'Roof Screeding/roof drainage': [uuidv7(rnd)] } }] });
    expect(submissionIssues(withPhoto)).toEqual([]);
    // Very Poor on a four-level item is not "Unsafe": no photo needed.
    const veryPoor = survey({ locations: [{ ...roof, scores: { ...roof.scores, Plaster: 'Very Poor' } }] });
    expect(submissionIssues(veryPoor)).toEqual([]);
  });

  test('W11: engineering staff required, ASM and Principal optional', () => {
    expect(submissionIssues(survey({ asm: '', principal: '' }))).toEqual([]);
    expect(submissionIssues(survey({ apm: ' ; ' })).map((i) => i.path)).toEqual(['apm']);
    expect(joinStaff([' Ali Khan ', '', 'Sara Ahmed'])).toBe('Ali Khan; Sara Ahmed');
    expect(splitStaff('Ali Khan; Sara Ahmed;')).toEqual(['Ali Khan', 'Sara Ahmed']);
  });

  test('W21: Column/Wall unsafe parts score as Unsafe, need a photo, and read back from the sheet text', () => {
    const s = survey();
    const roof = s.locations[0]!;
    const room = { ...roof, id: 'KG', type: 'Classroom' as const, floorLevel: 'Ground' as const, name: 'KG A', scores: Object.fromEntries(rubricGroupsForLocation('Classroom').map((g) => [g.name, 'Good'])) };
    const parts = { ...room, scores: { ...room.scores, 'Wall/Column Condition i.e. cracks': 'Very Poor' as const }, unsafeParts: { 'Wall/Column Condition i.e. cracks': ['Column', 'Wall'] } };
    const withParts = survey({ locations: [roof, parts as SubmittedSurvey['locations'][number]] });
    expect(submittedSurveySchema.safeParse(withParts).success).toBe(true);
    expect(submissionIssues(withParts).map((i) => i.message)).toEqual([
      'KG A: Answer whether the column crack is wider than 3 mm.',
      'Attach a photo of "Wall/Column Condition i.e. cracks" at KG A: it is marked Unsafe.',
    ]);
    const row = responseRows(withParts, { name: 'S', email: 's@tcf.test' }, '2026-10-28T05:00:00.000Z').find((r) => r['Location Name'] === 'KG A')!;
    expect(row['Wall/Column Condition i.e. cracks']).toBe('Column Unsafe, Wall Unsafe');
    expect(cellCondition('Column Unsafe, Wall Unsafe')).toBe('Very Poor');
    expect(cellCondition('Wall Unsafe')).toBe('Very Poor');
    expect(cellCondition('Good')).toBe('Good');
  });

  test('W41: Column Unsafe asks crack > 3 mm, then Schmidt Hammer reading and photo, and writes them to the row', () => {
    const s = survey();
    const roof = s.locations[0]!;
    const room = { ...roof, id: 'KG', type: 'Classroom' as const, floorLevel: 'Ground' as const, name: 'KG A', scores: Object.fromEntries(rubricGroupsForLocation('Classroom').map((g) => [g.name, 'Good'])) };
    const photo = { fileId: 'f1', mime: 'image/jpeg', bytes: 1000 };
    const base = { ...room, unsafeParts: { [COLUMN_ITEM]: ['Wall'] } };
    expect(columnCheckApplies(base)).toBe(false);
    expect(columnCheckIssues(base)).toEqual([]);
    const col = { ...room, unsafeParts: { [COLUMN_ITEM]: ['Column'] } };
    const check = (c: Partial<ReturnType<typeof emptyColumnCheck>>, photos: Record<string, unknown[]> = {}) =>
      columnCheckIssues({ ...col, columnCheck: { ...emptyColumnCheck(), ...c }, photos });
    expect(check({})).toEqual(['Answer whether the column crack is wider than 3 mm.']);
    expect(check({ crackOver3mm: 'NO' })).toEqual([]);
    expect(check({ crackOver3mm: 'YES' })).toEqual(['Answer whether a Schmidt Hammer is available.']);
    expect(check({ crackOver3mm: 'YES', hammerAvailable: 'NO' })).toEqual([]);
    expect(check({ crackOver3mm: 'YES', hammerAvailable: 'YES', reading: '-1' })).toHaveLength(2);
    expect(check({ crackOver3mm: 'YES', hammerAvailable: 'YES', reading: '32' }, { [SCHMIDT_PHOTO]: [photo] })).toEqual([]);
    const done = { ...col, columnCheck: { crackOver3mm: 'YES' as const, hammerAvailable: 'YES' as const, reading: ' 32 ' } };
    const row = responseRows(survey({ locations: [roof, done as SubmittedSurvey['locations'][number]] }), { name: 'S', email: 's@tcf.test' }, 'x').find((r) => r['Location Name'] === 'KG A')!;
    expect([row['Column Crack > 3 mm'], row['Schmidt Hammer Available'], row['Schmidt Hammer Reading']]).toEqual(['YES', 'YES', '32']);
    expect(NUMERIC_COLUMNS.has('Schmidt Hammer Reading')).toBe(true);
    expect(columnCheckLine('KG A', 'NO', '', '')).toBe('KG A: crack up to 3 mm');
  });

  test('sheet order: floor, then location type, then name with numbers in order', () => {
    const l = (floorLevel: string, type: string, name: string) => ({ floorLevel, type, name });
    const recorded = [l('Roof', 'Roof', 'Roof'), l('Ground', 'Toilet', 'Girls Toilet'), l('First', 'Classroom', 'Class 10'), l('Ground', 'Classroom', 'Class 10'), l('Ground', 'Classroom', 'Class 2'), l('External', 'External Development', 'External Development')];
    expect(sheetOrder(recorded).map((x) => `${x.floorLevel} ${x.name}`)).toEqual(['External External Development', 'Ground Class 2', 'Ground Class 10', 'Ground Girls Toilet', 'First Class 10', 'Roof Roof']);
  });

  test('W22: items covered = groups scored (not N/A) at least once / all groups', () => {
    const s = survey();
    const c = itemsCovered(s.locations, RUBRIC_VERSION);
    expect(c.total).toBe(31);
    expect(c.covered).toBe(Object.values(s.locations[0]!.scores).filter((v) => v !== 'N/A').length);
    const row = responseRows(s, { name: 'S', email: 's@tcf.test' }, '2026-10-28T05:00:00.000Z')[0]!;
    expect(row['Items Covered (%)']).toBe(String(Math.round(c.percent)));
    expect(NUMERIC_COLUMNS.has('Items Covered (%)')).toBe(true);
  });

  test('W24/W27: applicable levels are written; drilling is required only with a Roof location', () => {
    const s = survey({ levels: ['External', 'Ground', 'Roof'] });
    expect(responseRows(s, { name: 'S', email: 's@tcf.test' }, 'x')[0]!['Applicable Levels']).toBe('External, Ground, Roof');
    expect(applicableLevels(['Roof', 'Ground'])).toEqual(['External', 'Ground', 'Roof']);
    const blankDrilling = { done: '', pointMarked: '', slabAssessment: '', slabThicknessMm: '', screedThicknessMm: '', holeRepaired: '' } as const;
    expect(submissionIssues(survey({ drillingCheck: blankDrilling })).map((i) => i.path)).toContain('drillingCheck');
    const room = { ...s.locations[0]!, id: 'KG', type: 'Classroom' as const, floorLevel: 'Ground' as const, name: 'KG A', scores: Object.fromEntries(rubricGroupsForLocation('Classroom').map((g) => [g.name, 'Good'])) };
    expect(submissionIssues(survey({ drillingCheck: blankDrilling, locations: [room as SubmittedSurvey['locations'][number]] })).map((i) => i.path)).not.toContain('drillingCheck');
  });

  test('W35/W36: drilling point YES/NO; additional drill holes are checked and written', () => {
    const drill = { done: 'YES', pointMarked: 'YES', slabAssessment: 'Ok', slabThicknessMm: '125', screedThicknessMm: '50', holeRepaired: 'YES' } as const;
    const holes = [
      { slabThicknessMm: '120', screedThicknessMm: '40', slabAssessment: 'Ok' },
      { slabThicknessMm: '95', screedThicknessMm: '35', slabAssessment: 'Unsafe' },
    ] as const;
    const s = survey({ drillingCheck: { ...drill, extraHoles: [...holes] } });
    expect(submittedSurveySchema.safeParse(s).success).toBe(true);
    expect(submissionIssues(s)).toEqual([]);
    const row = responseRows(s, { name: 'S', email: 's@tcf.test' }, 'x')[0]!;
    expect(row['Drilling Point Marked']).toBe('YES');
    expect(row['Additional Drill Holes']).toBe('Hole 2: slab 120 mm, screed 40 mm, Ok; Hole 3: slab 95 mm, screed 35 mm, Unsafe');
    const half = survey({ drillingCheck: { ...drill, extraHoles: [{ slabThicknessMm: '120', screedThicknessMm: '', slabAssessment: '' }] } });
    expect(submissionIssues(half).map((i) => i.message)).toEqual([
      'Complete the drilling check (thicknesses must be positive numbers).',
      'Drill hole 2: both thicknesses must be positive numbers.',
      'Drill hole 2: choose the slab thickness assessment.',
    ]);
    // Older surveys answered Ok / Unsafe; they stay valid.
    expect(submittedSurveySchema.safeParse(survey({ drillingCheck: { ...drill, pointMarked: 'Ok' } })).success).toBe(true);
  });

  test('W20: center beam accepts the partial answer; the oath names the signed-in staff member', () => {
    expect(submittedSurveySchema.safeParse(survey({ centerBeam: 'Somewhere present, somewhere absent' })).success).toBe(true);
    expect(oathText('Ali Khan')).toContain('I am Ali Khan, staff of Engineering Department of TCF');
  });

  test('W17: the structural type question accepts Unknown; type of structure is optional', () => {
    const s = survey({ buildingStructure: 'Unknown', typeOfStructure: '' });
    expect(submittedSurveySchema.safeParse(s).success).toBe(true);
    expect(submissionIssues(s)).toEqual([]);
  });

  test('roof not clean needs a photo', () => {
    const s = survey({ siteChecks: { ...survey().siteChecks, roofClean: 'No' } });
    expect(submissionIssues(s).map((i) => i.path)).toContain('siteChecks');
  });

  test('drilling YES needs positive thicknesses', () => {
    const s = survey({ drillingCheck: { ...survey().drillingCheck, slabThicknessMm: '-3' } });
    expect(submissionIssues(s).map((i) => i.path)).toContain('drillingCheck');
  });

  test('an unscored applicable group blocks submission', () => {
    const base = survey();
    const scores = { ...base.locations[0]!.scores };
    delete scores.Masonry;
    expect(submissionIssues(survey({ locations: [{ ...base.locations[0]!, scores }] })).length).toBeGreaterThan(0);
  });

  test('declaration must be ticked (schema)', () => {
    expect(submittedSurveySchema.safeParse({ ...survey(), declaration: false }).success).toBe(false);
  });

  test('ids must be UUID v7', () => {
    expect(submittedSurveySchema.safeParse({ ...survey(), id: '92d33d63-4b53-42bf-8c6c-689061a60b82' }).success).toBe(false);
  });
});

describe('permissions', () => {
  test('only admins manage users; every role downloads and sees the dashboard', () => {
    expect(can('ADMIN', 'users')).toBe(true);
    expect(can('SURVEYOR', 'users')).toBe(false);
    for (const r of ['SURVEYOR', 'REVIEWER', 'ADMIN'] as const) {
      expect(can(r, 'dashboard')).toBe(true);
      expect(can(r, 'surveyDownload')).toBe(true);
    }
  });

  test('surveyors write only their own surveys; reviewers none', () => {
    expect(canWrite('SURVEYOR', 'survey', 'u1', undefined)).toBe(true);
    expect(canWrite('SURVEYOR', 'survey', 'u1', 'u2')).toBe(false);
    expect(canWrite('REVIEWER', 'survey', 'u1', undefined)).toBe(false);
  });
});
