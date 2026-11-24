import type {
  AssumptionMeta,
  AssumptionRow,
  BudgetCampus,
  BudgetResult,
  CapStatus,
  BudgetCategory,
  CategoryResult,
  CategoryRule,
  PlacedCampus,
  RegionLine,
  RegionZone,
  ScenarioConfig,
} from './types';

/**
 * budgetEngine (R&M Budget Build 1). Pure: campuses + scenario config in, budget out.
 *
 * 1. Precedence: campus-backed categories are tried in their order; a campus goes to the first it qualifies for.
 * 2. E-compound siblings: every other campus with the host's eCompoundNo joins the host's category as
 *    "<BudgetCategory> sibling", unless it is already in a higher (earlier) category. Siblings are costed at the
 *    host category's rate (decided 2026-11-18: no per-band rates), count against its cap and never leave
 *    while their host is selected.
 * 3. Units: a category's campuses sharing an eCompoundNo are one unit, filled worst MQI first.
 * 4. Caps: TBD slots are reserved first, then units fill until one doesn't fit; it and every unit after it
 *    go to the waitlist (below the cut-off line). Unsafe categories are never trimmed: over the cap they
 *    show an overrun warning instead.
 */

export const UNALLOCATED_REGION = 'Unallocated TBD';
export const NO_REGION = 'Anticipated (no region)';
export const UNMAPPED_ZONE = 'Unmapped';

const EPS = 1e-9;

export function inflationFor(category: BudgetCategory, config: ScenarioConfig): number {
  return category.inflationPct ?? config.inflationPct ?? 0;
}

/** Rate per campus (Rs M) = last year's actual cost per campus × (1 + inflation). */
export function rateFor(category: BudgetCategory, config: ScenarioConfig): number {
  return (category.lastYearRate ?? 0) * (1 + inflationFor(category, config) / 100);
}

function matches(rule: CategoryRule, c: BudgetCampus): boolean {
  switch (rule.type) {
    case 'unsafe':
      return c.unsafe === rule.level;
    case 'band':
      return c.band !== null && rule.bands.includes(c.band);
    case 'scoreRange':
      return c.score !== null && c.score >= rule.min && (c.score < rule.max || (rule.max >= 100 && c.score <= rule.max));
    case 'manual':
      return rule.campusIds.includes(c.campusId);
    case 'bottomN':
      return c.band === rule.band;
  }
}

/** Campus-backed category index (precedence order) of each campus that qualifies on its own. */
export function assignPrimaries(campuses: readonly BudgetCampus[], categories: readonly BudgetCategory[]): Map<string, number> {
  const out = new Map<string, number>();
  // W91: campuses added to a category in its list go there first (the earliest such category wins).
  const known = new Set(campuses.map((c) => c.campusId));
  categories.forEach((cat, i) => {
    for (const id of cat.includeIds ?? []) if (known.has(id) && !out.has(id) && !(cat.excludeIds ?? []).includes(id)) out.set(id, i);
  });
  categories.forEach((cat, i) => {
    if (!cat.rule) return;
    const rule = cat.rule;
    const excluded = new Set(cat.excludeIds ?? []);
    let picked = campuses.filter((c) => !out.has(c.campusId) && !excluded.has(c.campusId) && (c.score !== null || rule.type === 'manual') && matches(rule, c));
    if (rule.type === 'bottomN') {
      picked = [...picked].sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.name.localeCompare(b.name)).slice(0, Math.max(0, Math.floor(rule.n)));
    }
    for (const c of picked) out.set(c.campusId, i);
  });
  return out;
}

interface Placement {
  cat: number;
  role: 'primary' | 'sibling';
  hostId?: string;
}

/** Primaries plus their e-compound siblings, each in exactly one category. */
export function placeCampuses(campuses: readonly BudgetCampus[], categories: readonly BudgetCategory[]): Map<string, Placement> {
  const placement = new Map<string, Placement>();
  for (const [id, cat] of assignPrimaries(campuses, categories)) placement.set(id, { cat, role: 'primary' });
  const byEc = new Map<string, BudgetCampus[]>();
  for (const c of campuses) {
    const ec = c.eCompoundNo.trim();
    if (ec) byEc.set(ec, [...(byEc.get(ec) ?? []), c]);
  }
  categories.forEach((cat, i) => {
    const excluded = new Set(cat.excludeIds ?? []);
    const hosts = campuses.filter((c) => {
      const p = placement.get(c.campusId);
      return p?.cat === i && p.role === 'primary';
    });
    for (const host of hosts) {
      const ec = host.eCompoundNo.trim();
      if (!ec) continue;
      for (const s of byEc.get(ec) ?? []) {
        if (s.campusId === host.campusId || excluded.has(s.campusId)) continue;
        const current = placement.get(s.campusId);
        // A campus already in this or a higher category stays where it is (higher category wins).
        if (current && current.cat <= i) continue;
        placement.set(s.campusId, { cat: i, role: 'sibling', hostId: host.campusId });
      }
    }
  });
  return placement;
}

function unitKey(c: BudgetCampus): string {
  return c.eCompoundNo.trim() ? `ec:${c.eCompoundNo.trim()}` : `id:${c.campusId}`;
}

export function runBudget(campuses: readonly BudgetCampus[], config: ScenarioConfig, regionZones: readonly RegionZone[] = []): BudgetResult {
  const campusCats = config.categories.filter((c) => c.kind === 'campus');
  const placement = placeCampuses(campuses, campusCats);
  const zoneOf = new Map(regionZones.map((r) => [r.region.trim().toLowerCase(), r.zone]));
  const zone = (region: string) => zoneOf.get(region.trim().toLowerCase()) ?? UNMAPPED_ZONE;
  const warnings: string[] = [];

  const results: CategoryResult[] = config.categories.map((category) => {
    const rate = rateFor(category, config);
    const inflationPct = inflationFor(category, config);
    const catWarnings: string[] = [];
    if (category.kind === 'anticipated') {
      const lump = category.lumpSum ?? null;
      const count = Math.max(0, category.count ?? 0);
      const budget = lump !== null ? lump : count * rate;
      if (lump === null && count > 0 && category.lastYearRate === null) catWarnings.push(`${category.name}: rate not set.`);
      return {
        category,
        precedence: null,
        rate,
        inflationPct,
        selected: [],
        waitlist: [],
        primaries: 0,
        siblings: 0,
        tbd: 0,
        anticipatedCount: lump !== null ? 1 : count,
        budget,
        capStatus: 'none' as CapStatus,
        warnings: catWarnings,
      };
    }
    const index = campusCats.indexOf(category);
    const members = campuses.filter((c) => placement.get(c.campusId)?.cat === index);
    // Units, worst MQI first (a unit's priority is its worst primary).
    const units = new Map<string, BudgetCampus[]>();
    for (const c of members) units.set(unitKey(c), [...(units.get(unitKey(c)) ?? []), c]);
    const worst = (list: BudgetCampus[]) =>
      Math.min(...list.filter((c) => placement.get(c.campusId)?.role === 'primary').map((c) => c.score ?? Number.POSITIVE_INFINITY));
    const ordered = [...units.values()]
      .map((list) =>
        [...list].sort((a, b) => {
          const ra = placement.get(a.campusId)!.role === 'primary' ? 0 : 1;
          const rb = placement.get(b.campusId)!.role === 'primary' ? 0 : 1;
          return ra - rb || (a.score ?? 999) - (b.score ?? 999) || a.name.localeCompare(b.name);
        }),
      )
      .sort((a, b) => worst(a) - worst(b) || a[0]!.name.localeCompare(b[0]!.name));

    const tbd = Math.max(0, Math.floor(category.tbdCount ?? 0));
    const capCount = category.capCount ?? null;
    const capRs = category.capRs ?? null;
    const neverTrim = category.rule?.type === 'unsafe';
    let usedCount = tbd;
    let usedRs = tbd * rate;
    let cut = false;
    let over = (capCount !== null && usedCount > capCount) || (capRs !== null && usedRs > capRs + EPS);
    const selected: PlacedCampus[] = [];
    const waitlist: PlacedCampus[] = [];
    ordered.forEach((unit, u) => {
      const placed = unit.map((c): PlacedCampus => {
        const p = placement.get(c.campusId)!;
        return {
          campus: c,
          role: p.role,
          tag: p.role === 'sibling' ? `${category.name} sibling` : '',
          ...(p.hostId ? { hostId: p.hostId } : {}),
          rate,
          unit: u + 1,
        };
      });
      const n = placed.length;
      const fits = (capCount === null || usedCount + n <= capCount) && (capRs === null || usedRs + n * rate <= capRs + EPS);
      if (neverTrim || (!cut && fits)) {
        if (!fits) over = true;
        selected.push(...placed);
        usedCount += n;
        usedRs += n * rate;
      } else {
        cut = true;
        waitlist.push(...placed);
      }
    });
    const hasCap = capCount !== null || capRs !== null;
    const capStatus: CapStatus = !hasCap ? 'none' : over ? 'overrun' : waitlist.length ? 'trimmed' : 'within';
    if (capStatus === 'overrun') {
      catWarnings.push(
        neverTrim
          ? `${category.name}: ${usedCount} projects (Rs ${usedRs.toFixed(2)}M) exceed the cap; unsafe campuses are never dropped.`
          : `${category.name}: the TBD slots alone exceed the cap.`,
      );
    }
    if (category.lastYearRate === null && (selected.length || tbd)) catWarnings.push(`${category.name}: rate not set.`);
    return {
      category,
      precedence: index + 1,
      rate,
      inflationPct,
      selected,
      waitlist,
      primaries: selected.filter((p) => p.role === 'primary').length,
      siblings: selected.filter((p) => p.role === 'sibling').length,
      tbd,
      anticipatedCount: 0,
      budget: selected.length * rate + tbd * rate,
      capStatus,
      warnings: catWarnings,
    };
  });

  // Region and zone breakdown: selected campuses and TBD slots; anticipated categories have no region.
  const regionMap = new Map<string, RegionLine>();
  const line = (region: string) => {
    const key = region || 'No region';
    let l = regionMap.get(key);
    if (!l) {
      l = { region: key, zone: region === NO_REGION || region === UNALLOCATED_REGION ? '' : zone(key), campuses: 0, tbd: 0, budget: 0 };
      regionMap.set(key, l);
    }
    return l;
  };
  for (const r of results) {
    if (r.category.kind === 'anticipated') {
      if (r.budget) line(NO_REGION).budget += r.budget;
      continue;
    }
    for (const p of r.selected) {
      const l = line(p.campus.region);
      l.campuses++;
      l.budget += p.rate;
    }
    let left = r.tbd;
    for (const [region, n] of Object.entries(r.category.tbdByRegion ?? {})) {
      const k = Math.max(0, Math.min(left, Math.floor(n)));
      if (!k) continue;
      const l = line(region);
      l.tbd += k;
      l.budget += k * r.rate;
      left -= k;
    }
    if (left > 0) {
      const l = line(UNALLOCATED_REGION);
      l.tbd += left;
      l.budget += left * r.rate;
    }
  }
  const regions = [...regionMap.values()].sort((a, b) => {
    const tail = (x: RegionLine) => (x.region === NO_REGION ? 2 : x.region === UNALLOCATED_REGION ? 1 : 0);
    return tail(a) - tail(b) || a.region.localeCompare(b.region);
  });
  const zoneMap = new Map<string, { zone: string; campuses: number; tbd: number; budget: number }>();
  for (const r of regions) {
    const z = r.zone || r.region;
    const e = zoneMap.get(z) ?? { zone: z, campuses: 0, tbd: 0, budget: 0 };
    e.campuses += r.campuses;
    e.tbd += r.tbd;
    e.budget += r.budget;
    zoneMap.set(z, e);
  }

  const total = results.reduce((s, r) => s + r.budget, 0);
  const ceilingRs = config.ceilingRs ?? null;
  const ceiling =
    ceilingRs !== null && ceilingRs > 0
      ? {
          ceilingRs,
          overrun: Math.max(0, total - ceilingRs),
          byCategory: results.map((r) => ({ id: r.category.id, name: r.category.name, budget: r.budget })),
        }
      : null;
  if (ceiling && ceiling.overrun > EPS) warnings.push(`Total Rs ${total.toFixed(2)}M is Rs ${ceiling.overrun.toFixed(2)}M over the ceiling of Rs ${ceilingRs!.toFixed(2)}M.`);
  for (const r of results) warnings.push(...r.warnings);
  const unplaced = campuses.filter((c) => c.score !== null && !placement.has(c.campusId)).length;
  return {
    categories: results,
    regions,
    zones: [...zoneMap.values()],
    total,
    lastYearTotal: config.lastYearTotal ?? null,
    ceiling,
    unplaced,
    warnings,
  };
}

// ---- scenarios ----

/** A deep copy: editing the clone never touches its source. */
export function cloneScenarioConfig(config: ScenarioConfig): ScenarioConfig {
  return JSON.parse(JSON.stringify(config)) as ScenarioConfig;
}

export interface CompareRow {
  key: string;
  label: string;
  values: number[];
  differs: boolean;
}

export interface Comparison {
  names: string[];
  totals: CompareRow;
  budgetByCategory: CompareRow[];
  campusesByCategory: CompareRow[];
  campusesByRegion: CompareRow[];
  budgetByRegion: CompareRow[];
}

/** Two or three scenarios side by side; rows whose values differ are flagged. */
export function compareScenarios(items: { name: string; result: BudgetResult }[]): Comparison {
  const row = (key: string, label: string, values: number[]): CompareRow => ({
    key,
    label,
    values,
    differs: values.some((v) => Math.abs(v - values[0]!) > 0.005),
  });
  const catNames: string[] = [];
  for (const it of items) for (const c of it.result.categories) if (!catNames.includes(c.category.name)) catNames.push(c.category.name);
  const regionNames: string[] = [];
  for (const it of items) for (const r of it.result.regions) if (!regionNames.includes(r.region)) regionNames.push(r.region);
  const cat = (it: { result: BudgetResult }, name: string) => it.result.categories.find((c) => c.category.name === name);
  const reg = (it: { result: BudgetResult }, name: string) => it.result.regions.find((r) => r.region === name);
  return {
    names: items.map((i) => i.name),
    totals: row('total', 'Total (Rs M)', items.map((i) => i.result.total)),
    budgetByCategory: catNames.map((n) => row(`b:${n}`, n, items.map((i) => cat(i, n)?.budget ?? 0))),
    campusesByCategory: catNames.map((n) => row(`c:${n}`, n, items.map((i) => { const c = cat(i, n); return c ? c.selected.length + c.tbd + c.anticipatedCount : 0; }))),
    campusesByRegion: regionNames.map((n) => row(`rc:${n}`, n, items.map((i) => { const r = reg(i, n); return r ? r.campuses + r.tbd : 0; }))),
    budgetByRegion: regionNames.map((n) => row(`rb:${n}`, n, items.map((i) => reg(i, n)?.budget ?? 0))),
  };
}

// ---- assumption register ----

export function assumptionKey(...parts: string[]): string {
  return parts.join(':');
}

const BLANK: AssumptionMeta = { source: '', owner: '', date: '', note: '' };
const fmt = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? 'not set' : `${n}${unit}`);

/** Every rate, inflation figure, cap, N and TBD count with its source, owner, date and note. */
export function listAssumptions(config: ScenarioConfig): AssumptionRow[] {
  const meta = (key: string) => config.assumptions[key] ?? BLANK;
  const rows: AssumptionRow[] = [];
  const add = (key: string, item: string, value: string) => rows.push({ key, item, value, meta: meta(key) });
  add('inflation', 'Inflation (default)', `${config.inflationPct}%`);
  if (config.ceilingRs) add('ceiling', 'Overall ceiling', `Rs ${config.ceilingRs}M`);
  if (config.lastYearTotal) add('lastYearTotal', "Last year's total", `Rs ${config.lastYearTotal}M`);
  for (const c of config.categories) {
    const k = (f: string) => assumptionKey('cat', c.id, f);
    if (c.kind === 'anticipated' && c.lumpSum !== null && c.lumpSum !== undefined) {
      add(k('lumpSum'), `${c.name}: lump sum`, `Rs ${c.lumpSum}M`);
      continue;
    }
    add(k('rate'), `${c.name}: last year's cost per ${c.kind === 'campus' ? 'campus' : 'item'}`, fmt(c.lastYearRate, ' Rs M'));
    if (c.inflationPct !== null && c.inflationPct !== undefined) add(k('inflation'), `${c.name}: inflation override`, `${c.inflationPct}%`);
    if (c.kind === 'anticipated') add(k('count'), `${c.name}: count`, fmt(c.count ?? 0));
    if (c.rule?.type === 'bottomN') add(k('n'), `${c.name}: N`, String(c.rule.n));
    if (c.kind === 'campus') {
      if (c.tbdCount) add(k('tbd'), `${c.name}: TBD count`, String(c.tbdCount));
      if (c.capCount !== null && c.capCount !== undefined) add(k('capCount'), `${c.name}: cap (count)`, String(c.capCount));
      if (c.capRs !== null && c.capRs !== undefined) add(k('capRs'), `${c.name}: cap (Rs)`, `Rs ${c.capRs}M`);
    }
  }
  return rows;
}
