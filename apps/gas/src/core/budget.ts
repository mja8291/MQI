import {
  SMS_TAB,
  budgetCampusesPayload,
  budgetCycleSavePayload,
  budgetIdPayload,
  budgetScenarioSavePayload,
  budgetZonesSavePayload,
  groupCampusMaster,
  joinCampusSurveys,
  scenarioConfigSchema,
  uuidv7,
} from '@mqi/shared';
import type { BudgetCampusesResult, BudgetCycle, BudgetImportResult, BudgetState, CampusMaster, CampusSource, RegionZone, Scenario } from '@mqi/shared';
import type { Ctx } from './context';
import { fail } from './errors';
import type { Env, TablePort } from './ports';
import { dashboard } from './reads';
import { toRow } from './responses';
import { Table } from './system';
import type { Row } from './system';

/**
 * R&M Budget, Build 1: server side. Data lives in the "R&M Budget" spreadsheet (env.budget); the
 * engine runs in the budget site. Every write is recorded in the System AuditLog.
 */

export const BUDGET_TABS = {
  CYCLES: ['Cycles', ['id', 'name', 'surveyFrom', 'surveyTo', 'createdAt', 'createdBy', 'updatedAt']],
  SCENARIOS: ['Scenarios', ['id', 'cycleId', 'name', 'status', 'config', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']],
  MASTER: [
    'Campus Master',
    ['campusId', 'name', 'schoolIds', 'unitIds', 'eCompoundNo', 'schoolType', 'programme', 'region', 'area', 'cluster', 'location', 'builtYear', 'buildDonor'],
  ],
  IMPORTS: ['Imports', ['at', 'by', 'source', 'campuses', 'noECompound']],
  ZONES: ['Region Zones', ['region', 'zone']],
} as const;
type BudgetTab = keyof typeof BUDGET_TABS;

function port(env: Env, tab: BudgetTab): TablePort {
  const [name, cols] = BUDGET_TABS[tab];
  const t = env.budget.table(name);
  if (t) {
    const have = t.header();
    const missing = cols.filter((c) => !have.includes(c));
    if (missing.length) t.setHeader([...have, ...missing]);
    return t;
  }
  return env.budget.createTable(name, [...cols]);
}

const table = (env: Env, tab: BudgetTab, key: string) => new Table(port(env, tab), key);

function rowsOf(env: Env, tab: BudgetTab): Row[] {
  const t = port(env, tab);
  const header = t.header();
  const last = t.lastRow();
  return last > 1 ? t.read(2, last - 1, header.length).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))) : [];
}

/** Replaces a whole tab's rows (blanking any left over from a longer earlier write). */
function replaceRows(env: Env, tab: BudgetTab, rows: Row[]): void {
  const t = port(env, tab);
  const header = t.header();
  const old = Math.max(0, t.lastRow() - 1);
  const cells = rows.map((r) => header.map((h) => r[h] ?? ''));
  while (cells.length < old) cells.push(header.map(() => ''));
  if (cells.length) t.write(2, cells);
}

function audit(ctx: Ctx, action: string, targetId: string, detail: unknown): void {
  Table.log(ctx.env, 'AUDITLOG', {
    at: ctx.nowIso,
    requestId: ctx.requestId,
    actorId: ctx.user?.id ?? '',
    action,
    targetId,
    detail: JSON.stringify(detail).slice(0, 5000),
  });
}

// ---- campus master ----

/** Build 1's campus source: the SMS 2026 tab of the MQI Spreadsheet. */
export function smsSheetSource(env: Env): CampusSource {
  return {
    name: `MQI Spreadsheet / ${SMS_TAB}`,
    unitRows() {
      const header = env.responses.header(SMS_TAB);
      const last = env.responses.lastRow(SMS_TAB);
      if (!header) return fail('NOT_FOUND', `The "${SMS_TAB}" tab was not found in the MQI Spreadsheet.`);
      return last > 1 ? env.responses.readRows(SMS_TAB, 2, last - 1).map((cells) => toRow(header, cells)) : [];
    },
  };
}

const LIST = (v: string[]) => v.join(';');
const UNLIST = (v: string | undefined) => (v ?? '').split(';').map((x) => x.trim()).filter(Boolean);

export function importCampuses(ctx: Ctx, source: CampusSource = smsSheetSource(ctx.env)): BudgetImportResult {
  const master = groupCampusMaster(source.unitRows());
  if (!master.length) fail('VALIDATION', `No campuses with a Campus ID were found in ${source.name}.`);
  replaceRows(
    ctx.env,
    'MASTER',
    master.map((m) => ({ ...m, schoolIds: LIST(m.schoolIds), unitIds: LIST(m.unitIds) })),
  );
  const noECompound = master.filter((m) => !m.eCompoundNo).length;
  const by = ctx.user?.name ?? '';
  port(ctx.env, 'IMPORTS').append([[ctx.nowIso, by, source.name, String(master.length), String(noECompound)]]);
  audit(ctx, 'budget.import', '', { campuses: master.length, source: source.name });
  return { campuses: master.length, noECompound, importedAt: ctx.nowIso, source: source.name };
}

function readMaster(env: Env): CampusMaster[] {
  return rowsOf(env, 'MASTER')
    .filter((r) => r.campusId)
    .map((r) => ({
      campusId: r.campusId ?? '',
      name: r.name ?? '',
      schoolIds: UNLIST(r.schoolIds),
      unitIds: UNLIST(r.unitIds),
      eCompoundNo: r.eCompoundNo ?? '',
      schoolType: r.schoolType ?? '',
      programme: r.programme ?? '',
      region: r.region ?? '',
      area: r.area ?? '',
      cluster: r.cluster ?? '',
      location: r.location ?? '',
      builtYear: r.builtYear ?? '',
      buildDonor: r.buildDonor ?? '',
    }));
}

// ---- reads ----

function toCycle(r: Row): BudgetCycle {
  return { id: r.id ?? '', name: r.name ?? '', surveyFrom: r.surveyFrom ?? '', surveyTo: r.surveyTo ?? '', createdAt: r.createdAt ?? '' };
}

function toScenario(r: Row): Scenario | null {
  try {
    const config = scenarioConfigSchema.parse(JSON.parse(r.config ?? ''));
    return { id: r.id ?? '', cycleId: r.cycleId ?? '', name: r.name ?? '', status: 'Draft', config, updatedAt: r.updatedAt ?? '', updatedBy: r.updatedBy ?? '' };
  } catch {
    return null;
  }
}

export function state(ctx: Ctx): BudgetState {
  const imports = rowsOf(ctx.env, 'IMPORTS');
  const lastImport = imports[imports.length - 1];
  return {
    cycles: rowsOf(ctx.env, 'CYCLES').filter((r) => r.id).map(toCycle),
    scenarios: rowsOf(ctx.env, 'SCENARIOS')
      .filter((r) => r.id)
      .map(toScenario)
      .filter((s): s is Scenario => s !== null),
    regionZones: rowsOf(ctx.env, 'ZONES')
      .filter((r) => r.region)
      .map((r) => ({ region: r.region ?? '', zone: r.zone ?? '' })),
    master: {
      campuses: Number(lastImport?.campuses ?? 0),
      importedAt: lastImport?.at ?? '',
      importedBy: lastImport?.by ?? '',
      source: lastImport?.source ?? '',
      regions: [...new Set(rowsOf(ctx.env, 'MASTER').map((r) => (r.region ?? '').trim()).filter(Boolean))].sort(),
    },
  };
}

/** The imported master joined with each campus's latest MQI survey in the cycle's window (the dashboard's figures). */
export function campuses(ctx: Ctx, raw: unknown): BudgetCampusesResult {
  const { cycleId } = budgetCampusesPayload.parse(raw);
  const row = table(ctx.env, 'CYCLES', 'id').get(cycleId);
  if (!row) return fail('NOT_FOUND', 'Budget cycle not found.');
  const cycle = toCycle(row);
  const d = dashboard(ctx);
  const { campuses: list, summary } = joinCampusSurveys(readMaster(ctx.env), d.schools, { from: cycle.surveyFrom, to: cycle.surveyTo });
  return { campuses: list, summary, generatedAt: d.generatedAt ?? ctx.nowIso };
}

// ---- writes ----

export function saveCycle(ctx: Ctx, raw: unknown): BudgetCycle {
  const p = budgetCycleSavePayload.parse(raw);
  if (p.surveyFrom > p.surveyTo) fail('VALIDATION', 'The survey window ends before it starts.');
  const t = table(ctx.env, 'CYCLES', 'id');
  if (t.all().some((r) => r.name === p.name && r.id !== p.id)) fail('CONFLICT', `A cycle named ${p.name} already exists.`);
  const fields = { name: p.name, surveyFrom: p.surveyFrom, surveyTo: p.surveyTo, updatedAt: ctx.nowIso };
  let out: Row;
  if (p.id) {
    if (!t.get(p.id)) fail('NOT_FOUND', 'Budget cycle not found.');
    out = t.update(p.id, fields);
  } else {
    out = { id: uuidv7(ctx.env.crypto.randomBytes, ctx.nowMs), ...fields, createdAt: ctx.nowIso, createdBy: ctx.user?.name ?? '' };
    t.insert(out);
  }
  audit(ctx, 'budget.cycle.save', out.id ?? '', fields);
  return toCycle(out);
}

export function saveScenario(ctx: Ctx, raw: unknown): Scenario {
  const p = budgetScenarioSavePayload.parse(raw);
  if (!table(ctx.env, 'CYCLES', 'id').get(p.cycleId)) fail('NOT_FOUND', 'Budget cycle not found.');
  const t = table(ctx.env, 'SCENARIOS', 'id');
  const config = JSON.stringify(p.config);
  if (config.length > 45_000) fail('VALIDATION', 'This scenario is too large to save (shorten manual campus lists).');
  const fields = { cycleId: p.cycleId, name: p.name, status: 'Draft', config, updatedAt: ctx.nowIso, updatedBy: ctx.user?.name ?? '' };
  let out: Row;
  if (p.id && t.get(p.id)) {
    const current = t.get(p.id)!;
    if (p.baseUpdatedAt && current.updatedAt && current.updatedAt !== p.baseUpdatedAt) {
      fail('CONFLICT', `${current.updatedBy || 'Someone'} saved this scenario after you opened it. Reload to see their changes.`);
    }
    out = t.update(p.id, fields);
  } else {
    out = { id: p.id || uuidv7(ctx.env.crypto.randomBytes, ctx.nowMs), ...fields, createdAt: ctx.nowIso, createdBy: ctx.user?.name ?? '' };
    t.insert(out);
  }
  audit(ctx, 'budget.scenario.save', out.id ?? '', { name: p.name, cycleId: p.cycleId });
  return toScenario(out)!;
}

export function deleteScenario(ctx: Ctx, raw: unknown): { ok: true } {
  const { id } = budgetIdPayload.parse(raw);
  const t = table(ctx.env, 'SCENARIOS', 'id');
  const r = t.get(id);
  if (!r) return fail('NOT_FOUND', 'Scenario not found.');
  t.remove(id);
  audit(ctx, 'budget.scenario.delete', id, { name: r.name, config: r.config });
  return { ok: true };
}

export function saveZones(ctx: Ctx, raw: unknown): { regionZones: RegionZone[] } {
  const { rows } = budgetZonesSavePayload.parse(raw);
  const seen = new Set<string>();
  const clean = rows.filter((r) => {
    const k = r.region.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  replaceRows(ctx.env, 'ZONES', clean);
  audit(ctx, 'budget.zones.save', '', clean);
  return { regionZones: clean };
}
