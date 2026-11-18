import { beforeEach, describe, expect, test } from 'vitest';
import { API_VERSION, RESPONSES_TAB, defaultScenarioConfig } from '@mqi/shared';
import type { ApiResponse, BudgetCampusesResult, BudgetCycle, BudgetImportResult, BudgetState, Scenario, WhoAmI } from '@mqi/shared';
import { createMemoryEnv } from '../adapters/memory';
import type { MemoryEnv } from '../adapters/memory';
import { DEV_PASSWORD, seedDevEnv } from '../dev/server';
import { handleRequest } from './router';

/** R&M Budget, Build 1: server actions. */

let env: MemoryEnv;
function call<T = unknown>(action: string, payload: unknown = {}, session?: string): ApiResponse<T> {
  return handleRequest(env, JSON.stringify({ action, apiVersion: API_VERSION, auth: session ? { session } : undefined, payload })) as ApiResponse<T>;
}
function ok<T>(r: ApiResponse<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}
const code = (r: ApiResponse<unknown>) => (r.ok ? 'ok' : r.error.code);
const login = (email: string) => ok(call<WhoAmI>('auth.login', { email, password: DEV_PASSWORD })).sessionToken;

/** One location row of a submitted survey, as the responses tab holds it. */
function surveyRow(fields: Record<string, string | number>): void {
  const header = env.responses.header(RESPONSES_TAB)!;
  env.responses.appendRaw(RESPONSES_TAB, [header.map((h) => fields[h] ?? '')]);
}

beforeEach(() => {
  env = createMemoryEnv();
  seedDevEnv(env);
});

describe('R&M Budget server', () => {
  test('only Cost Managers and Admins reach the budget actions', () => {
    for (const who of ['surveyor@tcf.test', 'reviewer@tcf.test']) expect(code(call('budget.state', {}, login(who)))).toBe('FORBIDDEN');
    expect(code(call('budget.state', {}))).toBe('UNAUTHENTICATED');
    expect(code(call('budget.state', {}, login('costs@tcf.test')))).toBe('ok');
    expect(code(call('budget.state', {}, login('admin@tcf.test')))).toBe('ok');
    // A Cost Manager can't survey.
    expect(code(call('sync.push', { items: [] }, login('costs@tcf.test')))).toBe('FORBIDDEN');
  });

  test('import, cycle, campuses with this year\'s MQI, scenario save/conflict/delete, zones', () => {
    const s = login('costs@tcf.test');
    const imp = ok(call<BudgetImportResult>('budget.import', {}, s));
    expect(imp).toMatchObject({ campuses: 5, noECompound: 1 });
    const cycle = ok(call<BudgetCycle>('budget.cycle.save', { name: 'FY 2027-28', surveyFrom: '2026-07-01', surveyTo: '2027-06-30' }, s));
    expect(code(call('budget.cycle.save', { name: 'FY 2027-28', surveyFrom: '2026-07-01', surveyTo: '2027-06-30' }, s))).toBe('CONFLICT');

    // Two surveys of 947: the one in the window counts; 948 was only surveyed before it.
    surveyRow({ 'Survey ID': 'a', Timestamp: '2026-11-01T05:00:00.000Z', 'School ID': '947', 'Campus Name': 'OGS Trust Campus', Region: 'South West', 'Overall Score': 45, 'Rating Band': 'Poor', 'Location Name': 'Roof 1', 'Survey Purpose': 'Actual assessment' });
    surveyRow({ 'Survey ID': 'b', Timestamp: '2026-03-01T05:00:00.000Z', 'School ID': '948', 'Campus Name': 'OGS Trust Campus II', Region: 'South West', 'Overall Score': 80, 'Rating Band': 'Good', 'Location Name': 'Roof 1', 'Survey Purpose': 'Actual assessment' });
    env.cache.remove('dashboard');
    const res = ok(call<BudgetCampusesResult>('budget.campuses', { cycleId: cycle.id }, s));
    expect(res.campuses.find((c) => c.campusId === '947')).toMatchObject({ score: 45, band: 'Poor', eCompoundNo: 'S/1/10', schoolIds: ['1001', '1002'] });
    expect(res.campuses.find((c) => c.campusId === '948')).toMatchObject({ score: null });
    expect(res.summary).toMatchObject({ campuses: 5, noSurvey: 4 });

    const config = defaultScenarioConfig();
    const sc = ok(call<Scenario>('budget.scenario.save', { cycleId: cycle.id, name: 'Base', config }, s));
    expect(sc.config.categories).toHaveLength(config.categories.length);
    const later = ok(call<Scenario>('budget.scenario.save', { id: sc.id, cycleId: cycle.id, name: 'Base v2', config, baseUpdatedAt: sc.updatedAt }, s));
    env.clock.now += 1000;
    // Someone saved after this copy was opened: refused.
    expect(code(call('budget.scenario.save', { id: sc.id, cycleId: cycle.id, name: 'Stale', config, baseUpdatedAt: 'old' }, s))).toBe('CONFLICT');
    expect(later.name).toBe('Base v2');

    ok(call('budget.zones.save', { rows: [{ region: 'South West', zone: 'South' }, { region: 'south west', zone: 'dup' }] }, s));
    const st = ok(call<BudgetState>('budget.state', {}, s));
    expect(st.cycles.map((c) => c.name)).toEqual(['FY 2027-28']);
    expect(st.scenarios.map((x) => x.name)).toEqual(['Base v2']);
    expect(st.regionZones).toEqual([{ region: 'South West', zone: 'South' }]);
    expect(st.master).toMatchObject({ campuses: 5, importedBy: 'Dev Cost Manager' });

    expect(ok(call('budget.scenario.delete', { id: sc.id }, s))).toEqual({ ok: true });
    expect(ok(call<BudgetState>('budget.state', {}, s)).scenarios).toEqual([]);
  });

  test('a shorter import blanks the rows a longer one left', () => {
    const s = login('costs@tcf.test');
    ok(call('budget.import', {}, s));
    const sms = env.responses.tabs.get('SMS 2026')!;
    env.responses.tabs.set('SMS 2026', sms.slice(0, 2));
    expect(ok(call<BudgetImportResult>('budget.import', {}, s)).campuses).toBe(1);
    const cycle = ok(call<BudgetCycle>('budget.cycle.save', { name: 'FY X', surveyFrom: '2026-07-01', surveyTo: '2027-06-30' }, s));
    expect(ok(call<BudgetCampusesResult>('budget.campuses', { cycleId: cycle.id }, s)).campuses).toHaveLength(1);
  });
});
