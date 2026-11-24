import { Fragment, useEffect, useState } from 'react';
import { UNSAFE_LEVEL_LABEL, rateFor } from '@mqi/shared';
import type { BudgetCampus, BudgetCategory, BudgetResult, CategoryResult, CategoryRule, PlacedCampus, RatingBand, ScenarioConfig } from '@mqi/shared';
import { dateTime, int, rs, score } from '../lib/format';
import { CapBadge } from './CapBadge';
import { BandBreakdown } from './BandBreakdown';

const SEEDED = new Set(['critical', 'partial', 'poor', 'average', 'bottomGood', 'emergencies', 'minor', 'special']);
const BANDS: RatingBand[] = ['Poor', 'Average', 'Good', 'Excellent'];

/** A number box: empty means "not set" (null). */
function Num({ value, onChange, label, width = 'w-20', step = 'any', placeholder }: { value: number | null | undefined; onChange: (v: number | null) => void; label: string; width?: string; step?: string; placeholder?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    setText((t) => (Number(t) === value && t !== '' ? t : value === null || value === undefined ? '' : String(value)));
  }, [value]);
  return (
    <input
      className={`cell num ${width}`}
      inputMode="decimal"
      aria-label={label}
      value={text}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') return onChange(null);
        const n = Number(t);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
    />
  );
}

function RuleEditor({ rule, onChange, name }: { rule: CategoryRule; onChange: (r: CategoryRule) => void; name: string }) {
  const pick = (type: CategoryRule['type']) => {
    if (type === rule.type) return;
    onChange(
      type === 'unsafe'
        ? { type, level: 'partial' }
        : type === 'band'
          ? { type, bands: ['Poor'] }
          : type === 'scoreRange'
            ? { type, min: 0, max: 50 }
            : type === 'bottomN'
              ? { type, band: 'Good', n: 10 }
              : { type: 'manual', campusIds: [] },
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select className="cell" aria-label={`Rule of ${name}`} value={rule.type} onChange={(e) => pick(e.target.value as CategoryRule['type'])}>
        <option value="unsafe">Unsafe tier</option>
        <option value="band">MQI band</option>
        <option value="scoreRange">Score range</option>
        <option value="bottomN">Bottom N of a band</option>
        <option value="manual">Campus list</option>
      </select>
      {rule.type === 'unsafe' ? (
        <select className="cell" aria-label={`Unsafe tier of ${name}`} value={rule.level} onChange={(e) => onChange({ type: 'unsafe', level: e.target.value as 'critical' | 'partial' })}>
          <option value="critical">Critically unsafe</option>
          <option value="partial">Partially unsafe</option>
        </select>
      ) : rule.type === 'band' ? (
        BANDS.map((b) => (
          <label key={b} className="text-[12px] mr-1">
            <input
              type="checkbox"
              checked={rule.bands.includes(b)}
              onChange={() => {
                const next = rule.bands.includes(b) ? rule.bands.filter((x) => x !== b) : [...rule.bands, b];
                if (next.length) onChange({ type: 'band', bands: next });
              }}
            />{' '}
            {b}
          </label>
        ))
      ) : rule.type === 'scoreRange' ? (
        <>
          <Num label={`${name} from score`} width="w-14" value={rule.min} onChange={(v) => onChange({ ...rule, min: Math.min(100, v ?? 0) })} />
          <span className="text-[12px]">to below</span>
          <Num label={`${name} to score`} width="w-14" value={rule.max} onChange={(v) => onChange({ ...rule, max: Math.min(100, v ?? 100) })} />
        </>
      ) : rule.type === 'bottomN' ? (
        <>
          <span className="text-[12px]">N =</span>
          <Num label={`N of ${name}`} width="w-16" step="1" value={rule.n} onChange={(v) => onChange({ ...rule, n: Math.floor(v ?? 0) })} />
          <span className="text-[12px]">lowest</span>
          <select className="cell" aria-label={`Band of ${name}`} value={rule.band} onChange={(e) => onChange({ ...rule, band: e.target.value as RatingBand })}>
            {BANDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </>
      ) : (
        <input
          className="cell w-56"
          aria-label={`Campus IDs of ${name}`}
          placeholder="Campus IDs, comma-separated"
          value={rule.campusIds.join(', ')}
          onChange={(e) => onChange({ type: 'manual', campusIds: e.target.value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean) })}
        />
      )}
    </div>
  );
}

/** W91: TBD slots per region, picked from the region list (no typing). */
function ByRegion({ value, onChange, name, regions }: { value: Record<string, number> | undefined; onChange: (v: Record<string, number>) => void; name: string; regions: string[] }) {
  const entries = Object.entries(value ?? {});
  const free = regions.filter((r) => !(r in (value ?? {})));
  const set = (region: string, n: number | null) => onChange({ ...(value ?? {}), [region]: Math.floor(n ?? 0) });
  const drop = (region: string) => onChange(Object.fromEntries(entries.filter(([r]) => r !== region)));
  return (
    <div className="space-y-1 min-w-36">
      {entries.map(([r, n]) => (
        <div key={r} className="flex items-center gap-1">
          <span className="text-[12px] flex-1 whitespace-nowrap">{r}</span>
          <Num label={`TBD in ${r} for ${name}`} width="w-14" step="1" value={n} onChange={(v) => set(r, v)} />
          <button type="button" className="px-1 text-ink-faint" aria-label={`Remove ${r} from TBD of ${name}`} onClick={() => drop(r)}>
            ✕
          </button>
        </div>
      ))}
      {free.length ? (
        <select className="cell w-full" aria-label={`Add a region to TBD of ${name}`} value="" onChange={(e) => e.target.value && set(e.target.value, 1)}>
          <option value="">+ Region…</option>
          {free.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

/**
 * W91: a category's campuses, right under its row. Removing a campus keeps it out of this category (it
 * falls to the next one it qualifies for); a campus can be added by ID or name. The row's figures and the
 * totals update at once; Save keeps the adjustments with the scenario.
 */
function ListView({ result, campuses, category, onChange }: { result: CategoryResult | undefined; campuses: BudgetCampus[]; category: BudgetCategory; onChange: (patch: Partial<BudgetCategory>) => void }) {
  const [add, setAdd] = useState('');
  const [msg, setMsg] = useState('');
  const include = category.includeIds ?? [];
  const exclude = category.excludeIds ?? [];
  const byId = new Map(campuses.map((c) => [c.campusId, c]));
  const remove = (id: string) => onChange({ includeIds: include.filter((x) => x !== id), excludeIds: [...new Set([...exclude, id])] });
  const restore = (id: string) => onChange({ excludeIds: exclude.filter((x) => x !== id) });
  const addCampus = () => {
    const q = add.trim().toLowerCase();
    if (!q) return;
    const found = byId.get(add.trim()) ?? campuses.find((c) => c.name.toLowerCase() === q) ?? campuses.find((c) => `${c.campusId} · ${c.name}`.toLowerCase() === q);
    if (!found) return setMsg('No campus with that ID or name in the master list.');
    onChange({ includeIds: [...new Set([...include, found.campusId])], excludeIds: exclude.filter((x) => x !== found.campusId) });
    setAdd('');
    setMsg(`${found.name} added.`);
  };
  const rows = (list: PlacedCampus[], muted = false) =>
    list.map((p) => (
      <tr key={p.campus.campusId} className={muted ? 'opacity-70' : ''}>
        <td className="num text-ink-faint">{p.unit}</td>
        <td className="font-semibold">{p.campus.name}</td>
        <td>{p.campus.campusId}</td>
        <td className="num">{score(p.campus.score)}</td>
        <td>{p.campus.band ?? ''}</td>
        <td>{p.campus.unsafe ? UNSAFE_LEVEL_LABEL[p.campus.unsafe] : ''}</td>
        <td>{p.campus.region}</td>
        <td>{p.campus.eCompoundNo}</td>
        <td>
          {p.tag ? <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[11.5px] text-brand">{p.tag}</span> : null}
          {include.includes(p.campus.campusId) ? <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[11.5px]">added</span> : null}
          {muted ? <span className="ml-1 text-[11.5px] text-warn">waitlist</span> : null}
        </td>
        <td className="num">{rs(p.rate)}</td>
        <td>
          <button type="button" className="btn" onClick={() => remove(p.campus.campusId)}>
            Remove
          </button>
        </td>
      </tr>
    ));
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-3" data-testid={`list-${category.id}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <b className="text-brand-deep">{category.name}: campus list</b>
        <span className="text-ink-soft">Remove a campus to keep it out of this category; add one by Campus ID or name.</span>
        <div className="flex-1" />
        <input
          className="cell w-64"
          list={`campus-options-${category.id}`}
          placeholder="Campus ID or name"
          aria-label={`Add a campus to ${category.name}`}
          value={add}
          onChange={(e) => {
            setAdd(e.target.value);
            setMsg('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && addCampus()}
        />
        <datalist id={`campus-options-${category.id}`}>
          {campuses.slice(0, 2000).map((c) => (
            <option key={c.campusId} value={c.campusId}>
              {c.name}
            </option>
          ))}
        </datalist>
        <button type="button" className="btn" onClick={addCampus}>
          Add
        </button>
        {msg ? <span className="text-[12px] text-ink-soft" role="status">{msg}</span> : null}
      </div>
      {result && (result.selected.length || result.waitlist.length) ? (
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Unit</th>
              <th>Campus</th>
              <th>Campus ID</th>
              <th className="num">MQI</th>
              <th>Band</th>
              <th>Unsafe</th>
              <th>Region</th>
              <th>E-compound</th>
              <th>Tags</th>
              <th className="num">Rs M</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows(result.selected)}
            {rows(result.waitlist, true)}
          </tbody>
        </table>
      ) : (
        <p className="text-ink-soft">No campuses in this category.</p>
      )}
      {exclude.length ? (
        <div className="mt-2 text-[12.5px]">
          <span className="text-ink-soft">Removed from this category: </span>
          {exclude.map((id) => (
            <span key={id} className="mr-2 inline-flex items-center gap-1 rounded bg-white border border-border px-1.5 py-0.5">
              {byId.get(id)?.name ?? id}
              <button type="button" className="text-brand underline" onClick={() => restore(id)}>
                Restore
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** W102: the sibling bands, in this order. */
const SIB_BANDS = ['Poor', 'Average', 'Good', 'Excellent', 'No survey'] as const;

export function SettingsEditor({
  config,
  onChange,
  regions,
  result,
  campuses,
  onPull,
  pulling,
  mqiAsOf,
}: {
  config: ScenarioConfig;
  onChange: (c: ScenarioConfig) => void;
  regions: string[];
  result: BudgetResult | null;
  campuses: BudgetCampus[];
  onPull: () => void;
  pulling: boolean;
  mqiAsOf: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cats = config.categories;
  const setCat = (id: string, patch: Partial<BudgetCategory>) => onChange({ ...config, categories: cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const campusCats = cats.filter((c) => c.kind === 'campus');
  const anticipated = cats.filter((c) => c.kind === 'anticipated');
  const live = (id: string) => result?.categories.find((r) => r.category.id === id);
  const sum = (list: BudgetCategory[], f: (r: CategoryResult) => number) => list.reduce((s, c) => s + (live(c.id) ? f(live(c.id)!) : 0), 0);
  // W98: the campus categories table shows each category's own campuses and TBD; the e-compound siblings
  // costed with them are shown in the sibling table below (same rate, same total).
  const ownBudget = (r: CategoryResult) => (r.primaries + r.tbd) * r.rate;
  const campusTotal = sum(campusCats, ownBudget);
  const withSiblings = campusCats.map((c) => live(c.id)).filter((r): r is CategoryResult => !!r && r.siblings > 0);
  const sibCost = (r: CategoryResult) => r.selected.filter((p) => p.role === 'sibling').reduce((t, p) => t + p.rate, 0);
  const shortlistedSibTotal = withSiblings.reduce((t, r) => t + sibCost(r), 0);
  const hostName = new Map(campuses.map((c) => [c.campusId, c.name]));
  const anticipatedTotal = sum(anticipated, (r) => r.budget);
  // W92: R&M Plan siblings not in any category, by the category their own MQI matches.
  const sibRows = (result?.categories ?? []).filter((r) => r.section === 'rmPlanSibling');
  const sibTotal = sibRows.reduce((s, r) => s + r.budget, 0);
  const sibCfg = config.rmPlanSiblings ?? {};
  const setSib = (patch: NonNullable<ScenarioConfig['rmPlanSiblings']>) => onChange({ ...config, rmPlanSiblings: { ...sibCfg, ...patch } });
  /**
   * W101: one row of the simplified Sibling campuses table, with its campus list (band, safety, main
   * campus or survey plan).
   */
  const sibLine = (o: { key: string; label: React.ReactNode; catRate?: number | null; rateCell: React.ReactNode; rate: number | null; rateNote?: string; list: PlacedCampus[]; budget: number }) => (
    <Fragment key={o.key}>
      <tr>
        <td>{o.label}</td>
        <td className="num">{o.catRate === undefined ? '' : o.catRate === null ? <span className="text-warn">not set</span> : rs(o.catRate)}</td>
        <td className="num">{o.rateCell}</td>
        <td className="num">{o.rateNote ? <span className="text-ink-faint">{o.rateNote}</span> : o.rate === null ? <span className="text-warn">not set</span> : rs(o.rate)}</td>
        <td className="num" data-testid={`sib-campuses-${o.key}`}>{int(o.list.length)}</td>
        <td className="num font-semibold">{rs(o.budget)}</td>
        <td>
          <button type="button" className="btn" aria-expanded={open === o.key} onClick={() => setOpen(open === o.key ? null : o.key)}>
            {open === o.key ? 'Close list' : 'List view'}
          </button>
        </td>
      </tr>
      {open === o.key ? (
        <tr>
          <td colSpan={7}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Campus</th>
                  <th>Campus ID</th>
                  <th className="num">MQI</th>
                  <th>Band</th>
                  <th>Main campus / survey plan</th>
                  <th>Region</th>
                  <th>E-compound</th>
                  <th className="num">Rs M</th>
                </tr>
              </thead>
              <tbody>
                {o.list.map((p) => (
                  <tr key={p.campus.campusId}>
                    <td className="font-semibold">{p.campus.name}</td>
                    <td>{p.campus.campusId}</td>
                    <td className="num">{score(p.campus.score)}</td>
                    <td>{p.campus.band ?? 'No survey'}</td>
                    <td>{p.hostId ? `With ${hostName.get(p.hostId) ?? p.hostId}` : [p.campus.planCategory, p.campus.planAssessment].filter(Boolean).join(' · ')}</td>
                    <td>{p.campus.region}</td>
                    <td>{p.campus.eCompoundNo}</td>
                    <td className="num">{rs(p.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
  const move = (id: string, dir: -1 | 1) => {
    const order = campusCats.map((c) => c.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    onChange({ ...config, categories: [...order.map((x) => cats.find((c) => c.id === x)!), ...anticipated] });
  };
  const remove = (c: BudgetCategory) => {
    const where = c.kind === 'campus' ? ' Its campuses move to the next category they qualify for, or to no category.' : '';
    if (!window.confirm(`Remove the category "${c.name}" from this scenario?${where} Undo changes (or not saving) brings it back.`)) return;
    const assumptions = Object.fromEntries(Object.entries(config.assumptions).filter(([k]) => !k.startsWith(`cat:${c.id}:`)));
    onChange({ ...config, categories: cats.filter((x) => x.id !== c.id), assumptions });
  };
  const add = (kind: 'campus' | 'anticipated') => {
    const id = `c${Date.now().toString(36)}`;
    const c: BudgetCategory =
      kind === 'campus'
        ? { id, name: 'New category', kind, rule: { type: 'manual', campusIds: [] }, lastYearRate: null, colour: '#667085' }
        : { id, name: 'New item', kind, lastYearRate: null, count: 0, colour: '#667085' };
    onChange({ ...config, categories: kind === 'campus' ? [...campusCats, c, ...anticipated] : [...cats, c] });
  };
  // W94: TBD and Cap columns fold away (one summary column each) and open on demand.
  const [tbdOpen, setTbdOpen] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const tbdCols = tbdOpen ? 2 : 1;
  const capCols = capOpen ? 3 : 1;
  const CAMPUS_COLS = 10 + tbdCols + capCols;
  const Fold = ({ label, isOpen, onClick }: { label: string; isOpen: boolean; onClick: () => void }) => (
    <button type="button" className="font-semibold text-brand underline whitespace-nowrap" aria-expanded={isOpen} onClick={onClick} title={isOpen ? `Hide the ${label} columns` : `Show the ${label} columns`}>
      {label} {isOpen ? '◂' : '▸'}
    </button>
  );

  return (
    <div className="space-y-4 text-[13px]">
      <section className="card p-4 flex flex-wrap gap-6">
        <label>
          Inflation (default, %)
          <div className="mt-1">
            <Num label="Inflation (default)" value={config.inflationPct} onChange={(v) => onChange({ ...config, inflationPct: v ?? 0 })} />
          </div>
        </label>
        <label>
          Overall ceiling (Rs M, optional)
          <div className="mt-1">
            <Num label="Overall ceiling" width="w-28" value={config.ceilingRs} onChange={(v) => onChange({ ...config, ceilingRs: v })} />
          </div>
        </label>
        <label>
          Last year&apos;s total (Rs M)
          <div className="mt-1">
            <Num label="Last year's total" width="w-28" value={config.lastYearTotal} onChange={(v) => onChange({ ...config, lastYearTotal: v })} />
          </div>
        </label>
        <p className="basis-full text-ink-soft">
          Rate per campus = last year&apos;s actual cost per campus × (1 + inflation). E-compound siblings are costed at their host category&apos;s rate and count against its cap. Unsafe categories are never trimmed by a cap.
        </p>
      </section>

      <section className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="font-semibold text-brand-deep">Campus categories (in precedence order)</h2>
          <div className="flex-1" />
          <span className="text-[12px] text-ink-faint">{mqiAsOf ? `MQI results as of ${dateTime(mqiAsOf)}` : ''}</span>
          <button type="button" className="btn" onClick={onPull} disabled={pulling}>
            {pulling ? 'Pulling…' : 'Pull latest MQI categories'}
          </button>
        </div>
        <p className="text-ink-soft mb-2">
          A campus goes to the first category it qualifies for. Campuses, Rate and Budget update live from the latest MQI results. Caps are optional: leave them blank for no cap; when set they fill worst MQI first and TBD slots count against them.
        </p>
        <table className="tbl" data-testid="campus-settings">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Rule</th>
              <th className="num whitespace-normal w-24">Last year cost / campus (Rs M)</th>
              <th className="num whitespace-normal w-20" title="Leave blank to use the default inflation">Inflation % (blank = default)</th>
              <th className="num">Rate (Rs M)</th>
              <th className="num" title="This category's own campuses; their e-compound siblings are shown in the sibling table below">Campuses</th>
              <th className="num">
                <Fold label="TBD" isOpen={tbdOpen} onClick={() => setTbdOpen((v) => !v)} />
              </th>
              {tbdOpen ? <th>TBD by region</th> : null}
              {capOpen ? (
                <>
                  <th className="num">Cap (projects)</th>
                  <th className="num">Cap (Rs M)</th>
                </>
              ) : null}
              <th>
                <Fold label="Cap" isOpen={capOpen} onClick={() => setCapOpen((v) => !v)} />
              </th>
              <th className="num">Budget (Rs M)</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {campusCats.map((c, i) => {
              const r = live(c.id);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="whitespace-nowrap">
                      {i + 1}
                      <button type="button" className="ml-1 px-1" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c.id, -1)}>
                        ▲
                      </button>
                      <button type="button" className="px-1" aria-label={`Move ${c.name} down`} disabled={i === campusCats.length - 1} onClick={() => move(c.id, 1)}>
                        ▼
                      </button>
                    </td>
                    <td className="whitespace-nowrap">
                      <input type="color" className="mr-1 align-middle h-6 w-6" aria-label={`Colour of ${c.name}`} value={c.colour ?? '#667085'} onChange={(e) => setCat(c.id, { colour: e.target.value })} />
                      <input className="cell w-32" aria-label={`Name of ${c.name}`} value={c.name} onChange={(e) => setCat(c.id, { name: e.target.value })} />
                    </td>
                    <td>
                      {c.rule ? <RuleEditor rule={c.rule} name={c.name} onChange={(rule) => setCat(c.id, { rule })} /> : null}
                      <BandBreakdown result={r} />
                    </td>
                    <td className="num">
                      <Num label={`Last year cost of ${c.name}`} value={c.lastYearRate} onChange={(v) => setCat(c.id, { lastYearRate: v })} />
                    </td>
                    <td className="num">
                      <Num label={`Inflation of ${c.name}`} width="w-16" value={c.inflationPct} onChange={(v) => setCat(c.id, { inflationPct: v })} />
                    </td>
                    <td className="num" data-testid={`rate-${c.id}`}>{c.lastYearRate === null ? <span className="text-warn">not set</span> : rs(rateFor(c, config))}</td>
                    <td className="num" data-testid={`campuses-${c.id}`} title={r && r.siblings ? `${r.siblings} sibling(s) shown in the sibling table below` : undefined}>
                      {r ? int(r.primaries) : '…'}
                    </td>
                    <td className="num">
                      {tbdOpen ? (
                        <Num label={`TBD of ${c.name}`} width="w-16" step="1" value={c.tbdCount ?? 0} onChange={(v) => setCat(c.id, { tbdCount: Math.floor(v ?? 0) })} />
                      ) : (
                        int(c.tbdCount ?? 0)
                      )}
                    </td>
                    {tbdOpen ? (
                    <td>
                      <ByRegion
                        name={c.name}
                        regions={regions}
                        value={c.tbdByRegion}
                        // The TBD count is at least what the regions add up to.
                        onChange={(tbdByRegion) => setCat(c.id, { tbdByRegion, tbdCount: Math.max(c.tbdCount ?? 0, Object.values(tbdByRegion).reduce((s, n) => s + n, 0)) })}
                      />
                    </td>
                    ) : null}
                    {capOpen ? (
                      <>
                        <td className="num">
                          <Num label={`Cap count of ${c.name}`} width="w-16" step="1" placeholder="none" value={c.capCount} onChange={(v) => setCat(c.id, { capCount: v === null ? null : Math.floor(v) })} />
                        </td>
                        <td className="num">
                          <Num label={`Cap Rs of ${c.name}`} width="w-20" placeholder="none" value={c.capRs} onChange={(v) => setCat(c.id, { capRs: v })} />
                        </td>
                      </>
                    ) : null}
                    <td>{r ? <CapBadge status={r.capStatus} category={c} /> : null}</td>
                    <td className="num font-semibold" data-testid={`budget-${c.id}`}>{r ? rs(ownBudget(r)) : '…'}</td>
                    <td>
                      <button type="button" className="btn" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                        {open === c.id ? 'Close list' : 'List view'}
                      </button>
                    </td>
                    <td>
                      {/* W97: any campus category can be removed, the default ones too. */}
                      <button type="button" className="btn btn-danger" aria-label={`Remove category ${c.name}`} onClick={() => remove(c)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {open === c.id ? (
                    <tr>
                      <td colSpan={CAMPUS_COLS}>
                        <ListView result={r} campuses={campuses} category={c} onChange={(patch) => setCat(c.id, patch)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            <tr className="font-semibold bg-surface/60" data-testid="campus-total">
              <td />
              <td colSpan={5}>Total, campus categories</td>
              <td className="num">{int(sum(campusCats, (r) => r.primaries))}</td>
              <td className="num">{int(sum(campusCats, (r) => r.tbd))}</td>
              <td colSpan={tbdCols - 1 + capCols} />
              <td className="num">{rs(campusTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
        <button type="button" className="btn mt-3" onClick={() => add('campus')}>
          Add campus category
        </button>
      </section>

      <section className="card p-4 overflow-x-auto" data-testid="rm-siblings">
        <h2 className="font-semibold text-brand-deep mb-1">Sibling campuses</h2>
        <p className="text-ink-soft mb-2">
          <b>A. Siblings of shortlisted campuses</b>: share an e-compound with a campus in a category above; shown by their own MQI band; each sibling is costed at its main campus&apos;s category rate unless you enter a rate for its band (they count against that cap).{' '}
          <b>B. R&amp;M Plan siblings</b>: on the R&amp;M Plan list, share an e-compound, in no category; costed at the rate of the category their own MQI matches, or at the rate entered on their line.
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num" />
              <th className="num">Last year cost / campus (Rs M)</th>
              <th className="num">Rate (Rs M)</th>
              <th className="num">Campuses</th>
              <th className="num">Budget (Rs M)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface/40" data-testid="sib-group-shortlisted">
              <td className="font-semibold" colSpan={5}>A. Siblings of shortlisted campuses — by their own MQI band</td>
              <td className="num font-semibold">{rs(shortlistedSibTotal)}</td>
              <td />
            </tr>
            {withSiblings.length ? null : (
              <tr>
                <td colSpan={7} className="text-ink-faint pl-4">None.</td>
              </tr>
            )}
            {SIB_BANDS.map((band) => {
              const list = withSiblings.flatMap((r) => r.selected.filter((p) => p.role === 'sibling' && (p.campus.band ?? 'No survey') === band));
              if (!list.length) return null;
              const own = config.siblingBandRates?.[band];
              return sibLine({
                key: `sibband:${band}`,
                label: <span className="pl-4 font-semibold">{band}</span>,
                catRate: undefined,
                rateCell: (
                  <Num
                    label={`Sibling last year cost for ${band}`}
                    placeholder="main campus"
                    value={own}
                    onChange={(v) => onChange({ ...config, siblingBandRates: { ...(config.siblingBandRates ?? {}), [band]: v } })}
                  />
                ),
                rate: own != null ? (list[0]?.rate ?? null) : null,
                rateNote: own != null ? undefined : 'main campus rate',
                list,
                budget: list.reduce((t, p) => t + p.rate, 0),
              });
            })}
            <tr className="bg-surface/40">
              <td className="font-semibold" colSpan={5}>B. R&amp;M Plan siblings — by own MQI or survey plan</td>
              <td className="num font-semibold">{rs(sibTotal)}</td>
              <td />
            </tr>
            {sibRows.length ? null : (
              <tr>
                <td colSpan={7} className="text-ink-faint pl-4">None.</td>
              </tr>
            )}
            {sibRows.map((r) => {
              const m = /^rmsib:(other|unknown):(.*)$/.exec(r.category.id);
              const key = m ? `${m[1]}:${m[2]}` : '';
              const fallback = m ? (m[1] === 'other' ? sibCfg.otherLastYearRate : sibCfg.unknownLastYearRate) : null;
              const label = m
                ? `${m[1] === 'other' ? 'No category' : 'Not surveyed'}: ${m[2]!.replace(' (not surveyed in this cycle)', '')}`
                : r.category.name.replace('R&M Plan siblings – ', '');
              return sibLine({
                key: r.category.id,
                label: <span className="pl-4">{label}</span>,
                rateCell: m ? (
                  <Num
                    label={`Last year cost of ${r.category.name}`}
                    placeholder={fallback != null ? String(fallback) : 'rate'}
                    value={sibCfg.rates?.[key]}
                    onChange={(v) => setSib({ rates: { ...(sibCfg.rates ?? {}), [key]: v } })}
                  />
                ) : (
                  <span className="text-ink-faint">as the category</span>
                ),
                rate: r.category.lastYearRate === null ? null : r.rate,
                list: r.selected,
                budget: r.budget,
              });
            })}
            <tr className="font-semibold bg-surface/60" data-testid="rm-siblings-total">
              <td colSpan={4}>Total, sibling campuses</td>
              <td className="num">{int(withSiblings.reduce((n, r) => n + r.siblings, 0) + sibRows.reduce((n, r) => n + r.primaries, 0))}</td>
              <td className="num">{rs(shortlistedSibTotal + sibTotal)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold text-brand-deep mb-1">Anticipated categories (not tied to campuses)</h2>
        <p className="text-ink-soft mb-2">Count × rate, or a lump sum.</p>
        <table className="tbl" data-testid="anticipated-settings">
          <thead>
            <tr>
              <th>Name</th>
              <th>Costed as</th>
              <th className="num">Count</th>
              <th className="num">Last year cost / item (Rs M)</th>
              <th className="num">Inflation %</th>
              <th className="num">Lump sum (Rs M)</th>
              <th className="num">Rate (Rs M)</th>
              <th className="num">Budget (Rs M)</th>
              <th>Colour</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {anticipated.map((c) => {
              const lump = c.lumpSum !== null && c.lumpSum !== undefined;
              const r = live(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <input className="cell w-40" aria-label={`Name of ${c.name}`} value={c.name} onChange={(e) => setCat(c.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <select className="cell" aria-label={`Costing of ${c.name}`} value={lump ? 'lump' : 'count'} onChange={(e) => setCat(c.id, e.target.value === 'lump' ? { lumpSum: 0 } : { lumpSum: null })}>
                      <option value="count">Count × rate</option>
                      <option value="lump">Lump sum</option>
                    </select>
                  </td>
                  <td className="num">{lump ? '' : <Num label={`Count of ${c.name}`} width="w-16" step="1" value={c.count ?? 0} onChange={(v) => setCat(c.id, { count: Math.floor(v ?? 0) })} />}</td>
                  <td className="num">{lump ? '' : <Num label={`Last year cost of ${c.name}`} value={c.lastYearRate} onChange={(v) => setCat(c.id, { lastYearRate: v })} />}</td>
                  <td className="num">{lump ? '' : <Num label={`Inflation of ${c.name}`} width="w-16" value={c.inflationPct} onChange={(v) => setCat(c.id, { inflationPct: v })} />}</td>
                  <td className="num">{lump ? <Num label={`Lump sum of ${c.name}`} width="w-24" value={c.lumpSum} onChange={(v) => setCat(c.id, { lumpSum: v ?? 0 })} /> : ''}</td>
                  <td className="num">{lump ? '' : c.lastYearRate === null ? <span className="text-warn">not set</span> : rs(rateFor(c, config))}</td>
                  <td className="num font-semibold" data-testid={`budget-${c.id}`}>{r ? rs(r.budget) : '…'}</td>
                  <td>
                    <input type="color" aria-label={`Colour of ${c.name}`} value={c.colour ?? '#667085'} onChange={(e) => setCat(c.id, { colour: e.target.value })} />
                  </td>
                  <td>{SEEDED.has(c.id) ? null : <button type="button" className="btn btn-danger" onClick={() => remove(c)}>Remove</button>}</td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-surface/60" data-testid="anticipated-total">
              <td colSpan={2}>Total, anticipated categories</td>
              <td className="num">{int(anticipated.reduce((s, c) => s + (c.lumpSum != null ? 0 : (c.count ?? 0)), 0))}</td>
              <td colSpan={4} />
              <td className="num">{rs(anticipatedTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
        <button type="button" className="btn mt-3" onClick={() => add('anticipated')}>
          Add anticipated category
        </button>
      </section>

      <section className="card p-4" data-testid="grand-total">
        <table className="tbl max-w-xl">
          <tbody>
            <tr>
              <td>Campus categories</td>
              <td className="num">Rs {rs(campusTotal)}M</td>
            </tr>
            <tr>
              <td>Sibling campuses</td>
              <td className="num">Rs {rs(shortlistedSibTotal + sibTotal)}M</td>
            </tr>
            <tr>
              <td>Anticipated categories</td>
              <td className="num">Rs {rs(anticipatedTotal)}M</td>
            </tr>
            <tr className="font-semibold text-brand-deep text-[15px]">
              <td>Grand total</td>
              <td className="num" data-testid="grand-total-value">Rs {rs(campusTotal + shortlistedSibTotal + sibTotal + anticipatedTotal)}M</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
