import { describe, expect, it } from 'vitest';
import { cloneScenarioConfig, compareScenarios, listAssumptions, rateFor, runBudget } from './engine';
import { defaultScenarioConfig, financialYear, groupCampusMaster, joinCampusSurveys } from './source';
import type { BudgetCampus, BudgetCategory, ScenarioConfig } from './types';
import type { CapturedSchool } from '../api';
import { ratingBand } from '../scoring';

let n = 0;
function campus(p: Partial<BudgetCampus> & { score: number | null }): BudgetCampus {
  n++;
  return {
    campusId: p.campusId ?? `C${n}`,
    name: p.name ?? `Campus ${n}`,
    region: p.region ?? 'South',
    area: '',
    eCompoundNo: p.eCompoundNo ?? '',
    score: p.score,
    band: p.band !== undefined ? p.band : ratingBand(p.score),
    unsafe: p.unsafe ?? null,
  };
}

function config(categories: BudgetCategory[], extra: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return { inflationPct: 0, categories, assumptions: {}, ...extra };
}

const CRIT: BudgetCategory = { id: 'critical', name: 'Critically unsafe', kind: 'campus', rule: { type: 'unsafe', level: 'critical' }, lastYearRate: 6 };
const POOR: BudgetCategory = { id: 'poor', name: 'Poor', kind: 'campus', rule: { type: 'band', bands: ['Poor'] }, lastYearRate: 2 };
const AVG: BudgetCategory = { id: 'average', name: 'Average', kind: 'campus', rule: { type: 'band', bands: ['Average'] }, lastYearRate: 1.5 };
const cat = (r: ReturnType<typeof runBudget>, id: string) => r.categories.find((c) => c.category.id === id)!;
const ids = (list: { campus: BudgetCampus }[]) => list.map((p) => p.campus.campusId);

describe('budgetEngine', () => {
  it('W96: no-category siblings split by MQI band, unknown-MQI siblings by survey plan category; a line rate overrides its group rate', () => {
    const mk = (id: string, score: number | null, ec: string, extra: Partial<BudgetCampus> = {}) => ({ ...campus({ campusId: id, score, eCompoundNo: ec }), rmPlanned: true, ...extra });
    const list = [
      mk('E1', 95, 'A'),
      mk('G1', 80, 'A'),
      mk('U1', null, 'A', { planCategory: 'Done without App', planAssessment: 'Unsafe' }),
      mk('S1', null, 'B', { planCategory: 'Done without App', planAssessment: 'Safe' }),
      mk('P1', null, 'B', { planCategory: 'PSSP/PSRP Deduction' }),
      mk('W1', null, 'B', { planCategory: 'Survey with App' }),
      mk('N1', null, 'B'),
    ];
    const r = runBudget(list, config([POOR], { rmPlanSiblings: { otherLastYearRate: 1, unknownLastYearRate: 2, rates: { 'unknown:Done without App (Unsafe)': 5 } } }));
    const rows = r.categories.filter((c) => c.section === 'rmPlanSibling');
    expect(rows.map((c) => [c.category.id.replace('rmsib:', ''), ids(c.selected).join(','), c.rate])).toEqual([
      ['other:Good', 'G1', 1],
      ['other:Excellent', 'E1', 1],
      ['unknown:Done without App (Unsafe)', 'U1', 5],
      ['unknown:Done without App (Safe)', 'S1', 2],
      ['unknown:PSSP/PSRP Deduction', 'P1', 2],
      ['unknown:Survey with App (not surveyed in this cycle)', 'W1', 2],
      ['unknown:Not in the survey plan', 'N1', 2],
    ]);
    expect(r.total).toBeCloseTo(1 + 1 + 5 + 2 * 4);
  });

  it('W92: R&M Plan siblings in no category are costed by their own MQI; others by the entered rates; total includes them', () => {
    const host = campus({ campusId: 'H', score: 40, eCompoundNo: 'EC1' }); // Poor: its sibling joins it
    const hostSib = { ...campus({ campusId: 'HS', score: 95, eCompoundNo: 'EC1' }), rmPlanned: true };
    const exA = campus({ campusId: 'EA', score: 95, eCompoundNo: 'EC2' }); // Excellent, not planned
    const avgPlanned = { ...campus({ campusId: 'AP', score: 60, eCompoundNo: 'EC2' }), rmPlanned: true }; // removed from Average below
    const exPlanned = { ...campus({ campusId: 'XP', score: 90, eCompoundNo: 'EC3' }), rmPlanned: true };
    const exPartner = campus({ campusId: 'XQ', score: 92, eCompoundNo: 'EC3' });
    const noSurvey = { ...campus({ campusId: 'NS', score: null, eCompoundNo: 'EC3' }), rmPlanned: true };
    const alone = { ...campus({ campusId: 'AL', score: 91, eCompoundNo: 'EC4' }), rmPlanned: true }; // no sibling: left out
    const cfg = config([POOR, { ...AVG, excludeIds: ['AP'] }, { id: 'avg2', name: 'Average 2', kind: 'campus', rule: { type: 'band', bands: ['Average'] }, lastYearRate: 1 }], {
      rmPlanSiblings: { otherLastYearRate: 0.5, unknownLastYearRate: 0.4 },
    });
    const r = runBudget([host, hostSib, exA, avgPlanned, exPlanned, exPartner, noSurvey, alone], cfg);
    const rows = r.categories.filter((c) => c.section === 'rmPlanSibling');
    const byId = Object.fromEntries(rows.map((c) => [c.category.id, ids(c.selected)]));
    expect(byId['rmsib:avg2']).toBeUndefined(); // AP is taken by "Average 2" as a normal campus (it was only removed from Average)
    expect(ids(cat(r, 'avg2').selected)).toEqual(['AP', 'EA']); // with its e-compound sibling
    expect(byId['rmsib:other:Excellent']).toEqual(['XP']);
    expect(byId['rmsib:unknown:Not in the survey plan']).toEqual(['NS']);
    expect(ids(cat(r, 'poor').selected).sort()).toEqual(['H', 'HS']); // a shortlisted campus's sibling stays with it
    // Rows sit after the campus categories; the total includes them.
    expect(r.categories.findIndex((c) => c.section) ).toBe(3);
    expect(r.total).toBeCloseTo(2 * 2 + 2 * 1 + 0.5 + 0.4);
  });

  it('W91: blank caps are not applied; a campus removed from a list falls to the next category, an added one goes in, a removed sibling stays out', () => {
    const p1 = campus({ campusId: 'P1', score: 40, eCompoundNo: 'EC9' });
    const sib = campus({ campusId: 'S9', score: 92, eCompoundNo: 'EC9' });
    const p2 = campus({ campusId: 'P2', score: 45 });
    const a1 = campus({ campusId: 'A1', score: 60 });
    const ex = campus({ campusId: 'X1', score: 95 });
    const base = runBudget([p1, sib, p2, a1, ex], config([{ ...POOR, capCount: null, capRs: undefined }, AVG]));
    expect(cat(base, 'poor').capStatus).toBe('none');
    expect(ids(cat(base, 'poor').selected).sort()).toEqual(['P1', 'P2', 'S9']);
    // P2 removed from Poor (it scores 45, so no other category takes it); X1 (Excellent) added to Average; sibling S9 removed.
    const r = runBudget([p1, sib, p2, a1, ex], config([{ ...POOR, excludeIds: ['P2', 'S9'] }, { ...AVG, includeIds: ['X1'] }]));
    expect(ids(cat(r, 'poor').selected)).toEqual(['P1']);
    expect(ids(cat(r, 'average').selected).sort()).toEqual(['A1', 'X1']);
    expect(r.unplaced).toBe(2); // P2 and S9 are in no category now
    expect(r.total).toBeCloseTo(2 + 2 * 1.5);
  });

  it('precedence: a campus that qualifies for two categories lands in the higher one', () => {
    const a = campus({ campusId: 'A', score: 40, unsafe: 'critical' });
    const r = runBudget([a], config([CRIT, POOR]));
    expect(ids(cat(r, 'critical').selected)).toEqual(['A']);
    expect(cat(r, 'poor').selected).toEqual([]);
  });

  it('siblings: added, tagged, costed at the host category rate, counted in the host cap and locked', () => {
    const host = campus({ campusId: 'H', score: 40, eCompoundNo: 'EC1' });
    const sib = campus({ campusId: 'S', score: 90, eCompoundNo: 'EC1' });
    const other = campus({ campusId: 'O', score: 45 });
    const r = runBudget([host, sib, other], config([{ ...POOR, capCount: 2 }]));
    const poor = cat(r, 'poor');
    // The H+S unit (worst score 40) fills first and takes both places; O (45) waits.
    expect(ids(poor.selected)).toEqual(['H', 'S']);
    const s = poor.selected.find((p) => p.campus.campusId === 'S')!;
    expect(s.role).toBe('sibling');
    expect(s.tag).toBe('Poor sibling');
    expect(s.hostId).toBe('H');
    expect(s.rate).toBe(2);
    expect(poor.siblings).toBe(1);
    expect(ids(poor.waitlist)).toEqual(['O']);
    expect(poor.budget).toBe(4);
  });

  it('a sibling never stays behind while its host is selected (the unit moves together)', () => {
    const host = campus({ campusId: 'H', score: 30, eCompoundNo: 'EC9' });
    const sib = campus({ campusId: 'S', score: 80, eCompoundNo: 'EC9' });
    const r = runBudget([host, sib], config([{ ...POOR, capCount: 1 }]));
    // The unit of two doesn't fit a cap of one: both wait, the sibling is never split off.
    expect(cat(r, 'poor').selected).toEqual([]);
    expect(ids(cat(r, 'poor').waitlist)).toEqual(['H', 'S']);
  });

  it('a sibling that qualifies for a higher category moves there as a primary', () => {
    const host = campus({ campusId: 'H', score: 40, eCompoundNo: 'EC2' });
    const sib = campus({ campusId: 'S', score: 70, eCompoundNo: 'EC2', unsafe: 'critical' });
    const r = runBudget([host, sib], config([CRIT, POOR]));
    const crit = cat(r, 'critical');
    expect(ids(crit.selected)).toEqual(['S', 'H']);
    expect(crit.selected[0]!.role).toBe('primary');
    // H is Poor on its own, but Poor is lower than its sibling's category: it goes up as a sibling.
    expect(crit.selected[1]!.tag).toBe('Critically unsafe sibling');
    expect(cat(r, 'poor').selected).toEqual([]);
  });

  it('cap filling by unit: worst MQI first, the cut-off sends that unit and every later one to the waitlist', () => {
    const a = campus({ campusId: 'A', score: 20 });
    const b1 = campus({ campusId: 'B1', score: 30, eCompoundNo: 'EB' });
    const b2 = campus({ campusId: 'B2', score: 35, eCompoundNo: 'EB' });
    const c = campus({ campusId: 'C', score: 40 });
    const r = runBudget([c, b2, a, b1], config([{ ...POOR, capCount: 2 }]));
    const poor = cat(r, 'poor');
    expect(ids(poor.selected)).toEqual(['A']);
    expect(ids(poor.waitlist)).toEqual(['B1', 'B2', 'C']);
    expect(poor.capStatus).toBe('trimmed');
  });

  it('caps in Rs as well as count', () => {
    const a = campus({ campusId: 'A', score: 20 });
    const b = campus({ campusId: 'B', score: 30 });
    const r = runBudget([a, b], config([{ ...POOR, capRs: 3 }]));
    expect(ids(cat(r, 'poor').selected)).toEqual(['A']);
    expect(ids(cat(r, 'poor').waitlist)).toEqual(['B']);
  });

  it('unsafe overrun: a warning and no trim', () => {
    const list = ['A', 'B', 'C'].map((id) => campus({ campusId: id, score: 60, unsafe: 'critical' }));
    const r = runBudget(list, config([{ ...CRIT, capCount: 2 }]));
    const crit = cat(r, 'critical');
    expect(crit.selected).toHaveLength(3);
    expect(crit.waitlist).toEqual([]);
    expect(crit.capStatus).toBe('overrun');
    expect(r.warnings.join(' ')).toMatch(/exceed the cap/);
  });

  it('TBD slots are costed at the category rate and counted in the cap', () => {
    const a = campus({ campusId: 'A', score: 20 });
    const b = campus({ campusId: 'B', score: 30 });
    const r = runBudget([a, b], config([{ ...POOR, tbdCount: 2, capCount: 3, tbdByRegion: { North: 1 } }]));
    const poor = cat(r, 'poor');
    expect(poor.tbd).toBe(2);
    expect(ids(poor.selected)).toEqual(['A']);
    expect(ids(poor.waitlist)).toEqual(['B']);
    expect(poor.budget).toBe(3 * 2);
    expect(r.regions.find((x) => x.region === 'North')).toMatchObject({ tbd: 1, budget: 2 });
    expect(r.regions.find((x) => x.region === 'Unallocated TBD')).toMatchObject({ tbd: 1, budget: 2 });
  });

  it('inflation: scenario default, overridable per category', () => {
    const cfg = config([POOR, { ...AVG, inflationPct: 20 }], { inflationPct: 10 });
    expect(rateFor(cfg.categories[0]!, cfg)).toBeCloseTo(2.2);
    expect(rateFor(cfg.categories[1]!, cfg)).toBeCloseTo(1.8);
    const r = runBudget([campus({ score: 55 })], cfg);
    expect(cat(r, 'average').budget).toBeCloseTo(1.8);
  });

  it('a scenario clone is independent of its source', () => {
    const src = defaultScenarioConfig();
    const copy = cloneScenarioConfig(src);
    copy.categories[0]!.lastYearRate = 9;
    copy.inflationPct = 12;
    copy.assumptions['inflation'] = { source: 'x', owner: 'y', date: '2026-11-18', note: '' };
    expect(src.categories[0]!.lastYearRate).toBeNull();
    expect(src.inflationPct).toBe(0);
    expect(src.assumptions).toEqual({});
  });

  it('bottom N Good: the N lowest Good campuses not already taken higher up', () => {
    const goods = [70, 72, 75, 80].map((s, i) => campus({ campusId: `G${i}`, score: s }));
    goods[0]!.unsafe = 'partial';
    const PART: BudgetCategory = { id: 'partial', name: 'Partially unsafe', kind: 'campus', rule: { type: 'unsafe', level: 'partial' }, lastYearRate: 3 };
    const BG: BudgetCategory = { id: 'bg', name: 'Bottom Good', kind: 'campus', rule: { type: 'bottomN', band: 'Good', n: 2 }, lastYearRate: 1 };
    const r = runBudget(goods, config([PART, BG]));
    expect(ids(cat(r, 'partial').selected)).toEqual(['G0']);
    expect(ids(cat(r, 'bg').selected)).toEqual(['G1', 'G2']);
  });

  it('anticipated categories, ceiling overrun and the region/zone breakdown', () => {
    const cfg = config(
      [
        POOR,
        { id: 'em', name: 'Emergencies', kind: 'anticipated', lastYearRate: 0.5, count: 4 },
        { id: 'sp', name: 'Special projects', kind: 'anticipated', lastYearRate: null, lumpSum: 20 },
      ],
      { ceilingRs: 20 },
    );
    const r = runBudget([campus({ score: 30, region: 'North' })], cfg, [{ region: 'North', zone: 'Zone N' }]);
    expect(r.total).toBeCloseTo(2 + 2 + 20);
    expect(r.ceiling).toMatchObject({ ceilingRs: 20, overrun: 4 });
    expect(r.regions[0]).toMatchObject({ region: 'North', zone: 'Zone N', campuses: 1, budget: 2 });
    expect(r.zones.find((z) => z.zone === 'Zone N')?.budget).toBe(2);
  });

  it('compare flags the rows that differ', () => {
    const list = [campus({ score: 30 }), campus({ score: 60 })];
    const a = runBudget(list, config([POOR, AVG]));
    const b = runBudget(list, config([{ ...POOR, lastYearRate: 3 }, AVG]));
    const cmp = compareScenarios([{ name: 'A', result: a }, { name: 'B', result: b }]);
    expect(cmp.totals.differs).toBe(true);
    expect(cmp.budgetByCategory.find((x) => x.label === 'Poor')!.differs).toBe(true);
    expect(cmp.budgetByCategory.find((x) => x.label === 'Average')!.differs).toBe(false);
  });

  it('the assumption register lists every rate, inflation, cap, N and TBD with its meta', () => {
    const cfg = defaultScenarioConfig();
    cfg.categories[2]!.capCount = 100;
    cfg.categories[2]!.tbdCount = 5;
    cfg.assumptions['cat:poor:capCount'] = { source: 'Ops meeting', owner: 'Cost Manager', date: '2026-11-18', note: '' };
    const rows = listAssumptions(cfg);
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(['inflation', 'cat:critical:rate', 'cat:poor:capCount', 'cat:poor:tbd', 'cat:bottomGood:n', 'cat:special:lumpSum']));
    expect(rows.find((r) => r.key === 'cat:poor:capCount')!.meta.source).toBe('Ops meeting');
  });
});

describe('campus master and surveys', () => {
  it('groups SMS unit rows by Campus ID and joins the latest survey in the financial year', () => {
    const master = groupCampusMaster([
      { 'School ID': '1', 'Campus Name': 'Alpha', 'Campus ID': '10', 'Unit ID': '100', eCompoundNo: 'S/1', 'School Type': 'PR', Region: 'South' },
      { 'School ID': '2', 'Campus Name': 'Alpha', 'Campus ID': '10', 'Unit ID': '101', eCompoundNo: 'S/1', 'School Type': 'SC', Region: 'South' },
      { 'School ID': '3', 'Campus Name': 'Beta', 'Campus ID': '11', 'Unit ID': '102', eCompoundNo: '', Region: 'North' },
    ]);
    expect(master).toHaveLength(2);
    expect(master[0]).toMatchObject({ campusId: '10', schoolIds: ['1', '2'], schoolType: 'PR, SC' });
    const fy = financialYear(2026);
    expect(fy).toEqual({ name: 'FY 2026-27', from: '2026-07-01', to: '2027-06-30' });
    const captured = [
      {
        schoolId: '10',
        surveyId: 's-new',
        name: 'Alpha',
        region: 'South',
        area: '',
        date: '2027-08-01T09:00:00.000Z',
        overall: 90,
        band: 'Excellent',
        major: null,
        minor: null,
        criticalItems: {},
        earlier: [{ surveyId: 's-in', date: '2026-11-01T09:00:00.000Z', overall: 45, band: 'Poor', submittedBy: '', unsafeItems: ['Column'] }],
      },
    ] as CapturedSchool[];
    const { campuses, summary } = joinCampusSurveys(master, captured, fy);
    expect(campuses[0]).toMatchObject({ campusId: '10', score: 45, band: 'Poor', unsafe: 'critical', surveyId: 's-in', surveyDate: '2026-11-01' });
    expect(campuses[1]).toMatchObject({ campusId: '11', score: null, unsafe: null });
    expect(summary).toEqual({ campuses: 2, noECompound: 1, noSurvey: 1, surveyedNotInMaster: 0 });
  });
});
