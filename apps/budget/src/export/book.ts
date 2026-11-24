import { UNSAFE_LEVEL_LABEL, compareScenarios, listAssumptions, runBudget } from '@mqi/shared';
import type { BudgetCampusesResult, BudgetCycle, BudgetResult, Comparison, RegionZone, Scenario } from '@mqi/shared';

/**
 * Everything a budget book shows, built once from the same engine result the dashboard uses, so
 * every number in the Excel, PPT and PDF matches the screen.
 */
export interface BookScenario {
  scenario: Scenario;
  result: BudgetResult;
}

export interface Book {
  cycle: BudgetCycle;
  scenarios: BookScenario[];
  comparison: Comparison | null;
  generatedAt: string;
  mqiAsOf: string;
  zoneOf: (region: string) => string;
}

export function buildBook(cycle: BudgetCycle, scenarios: Scenario[], campuses: BudgetCampusesResult, zones: RegionZone[]): Book {
  const items = scenarios.map((scenario) => ({ scenario, result: runBudget(campuses.campuses, scenario.config, zones) }));
  const map = new Map(zones.map((z) => [z.region.trim().toLowerCase(), z.zone]));
  return {
    cycle,
    scenarios: items,
    comparison: items.length > 1 ? compareScenarios(items.map((i) => ({ name: i.scenario.name, result: i.result }))) : null,
    generatedAt: new Date().toISOString(),
    mqiAsOf: campuses.generatedAt,
    zoneOf: (r) => map.get(r.trim().toLowerCase()) ?? '',
  };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function categoryRows(res: BudgetResult) {
  return res.categories.map((c) => {
    const lump = c.category.kind === 'anticipated' && c.category.lumpSum !== null && c.category.lumpSum !== undefined;
    return {
      name: c.category.name,
      kind: c.category.kind,
      precedence: c.precedence,
      campuses: c.category.kind === 'campus' ? c.primaries : 0,
      siblings: c.category.kind === 'campus' ? c.siblings : 0,
      tbd: c.category.kind === 'campus' ? c.tbd : 0,
      anticipated: c.category.kind === 'anticipated' ? c.anticipatedCount : 0,
      rate: lump ? (c.category.lumpSum ?? 0) : c.rate,
      /** W100: the siblings' own rate when one is entered (else null: the category rate). */
      sibRate: c.category.siblingLastYearRate != null ? (c.selected.find((p) => p.role === 'sibling')?.rate ?? null) : null,
      budget: c.budget,
      capCount: c.category.capCount ?? null,
      capRs: c.category.capRs ?? null,
      capStatus: c.capStatus,
      waitlist: c.waitlist.length,
      lump,
    };
  });
}

export function campusLines(res: BudgetResult, which: 'selected' | 'waitlist', zoneOf: (r: string) => string) {
  return res.categories.flatMap((c) =>
    c[which].map((p) => ({
      category: c.category.name,
      unit: p.unit,
      campusId: p.campus.campusId,
      name: p.campus.name,
      region: p.campus.region,
      zone: zoneOf(p.campus.region),
      area: p.campus.area,
      eCompoundNo: p.campus.eCompoundNo,
      score: p.campus.score === null ? null : Math.round(p.campus.score),
      band: p.campus.band ?? '',
      unsafe: p.campus.unsafe ? UNSAFE_LEVEL_LABEL[p.campus.unsafe] : '',
      role: p.role === 'primary' ? 'Primary' : 'Sibling',
      tag: p.tag,
      rate: p.rate,
    })),
  );
}

export function tbdLines(res: BudgetResult) {
  return res.categories
    .filter((c) => c.tbd > 0)
    .flatMap((c) => Array.from({ length: c.tbd }, (_, i) => ({ category: c.category.name, label: `${c.category.name} — TBD ${i + 1} of ${c.tbd}`, rate: c.rate })));
}

export { listAssumptions };

export const CAP_STATUS_TEXT: Record<string, string> = { none: 'No cap', within: 'Within cap', trimmed: 'Cut-off (waitlist)', overrun: 'Overrun (not trimmed)' };

export function bookTitle(b: Book): string {
  return b.scenarios.length === 1 ? `${b.cycle.name} — ${b.scenarios[0]!.scenario.name}` : `${b.cycle.name} — ${b.scenarios.map((s) => s.scenario.name).join(' vs ')}`;
}
