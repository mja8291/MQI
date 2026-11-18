import { useEffect, useState } from 'react';
import { rateFor } from '@mqi/shared';
import type { BudgetCategory, CategoryRule, RatingBand, ScenarioConfig } from '@mqi/shared';
import { rs } from '../lib/format';

const SEEDED = new Set(['critical', 'partial', 'poor', 'average', 'bottomGood', 'emergencies', 'minor', 'special']);
const BANDS: RatingBand[] = ['Poor', 'Average', 'Good', 'Excellent'];

/** A number box: empty means "not set" (null). */
function Num({ value, onChange, label, width = 'w-20', step = 'any' }: { value: number | null | undefined; onChange: (v: number | null) => void; label: string; width?: string; step?: string }) {
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

function parseByRegion(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(/[;\n]/)) {
    const m = /^(.+?)\s*[:=]\s*(\d+)\s*$/.exec(part.trim());
    if (m) out[m[1]!.trim()] = Number(m[2]);
  }
  return out;
}
const byRegionText = (r: Record<string, number> | undefined) =>
  Object.entries(r ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

function ByRegion({ value, onChange, label, regions }: { value: Record<string, number> | undefined; onChange: (v: Record<string, number>) => void; label: string; regions: string[] }) {
  const [text, setText] = useState(byRegionText(value));
  useEffect(() => setText((t) => (byRegionText(parseByRegion(t)) === byRegionText(value) ? t : byRegionText(value))), [value]);
  return (
    <input
      className="cell w-44"
      aria-label={label}
      placeholder={regions[0] ? `${regions[0]}: 2; …` : 'Region: 2; …'}
      title="Optional: how many TBD slots per region, e.g. North: 2; South: 1"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseByRegion(e.target.value));
      }}
    />
  );
}

export function SettingsEditor({ config, onChange, regions }: { config: ScenarioConfig; onChange: (c: ScenarioConfig) => void; regions: string[] }) {
  const cats = config.categories;
  const setCat = (id: string, patch: Partial<BudgetCategory>) => onChange({ ...config, categories: cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const campusCats = cats.filter((c) => c.kind === 'campus');
  const anticipated = cats.filter((c) => c.kind === 'anticipated');
  const move = (id: string, dir: -1 | 1) => {
    const order = campusCats.map((c) => c.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    onChange({ ...config, categories: [...order.map((x) => cats.find((c) => c.id === x)!), ...anticipated] });
  };
  const remove = (c: BudgetCategory) => {
    if (!window.confirm(`Remove the category "${c.name}" from this scenario?`)) return;
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
        <h2 className="font-semibold text-brand-deep mb-1">Campus categories (in precedence order)</h2>
        <p className="text-ink-soft mb-2">A campus goes to the first category it qualifies for. Caps fill worst MQI first; TBD slots count against the cap.</p>
        <table className="tbl" data-testid="campus-settings">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Rule</th>
              <th className="num">Last year cost / campus (Rs M)</th>
              <th className="num">Inflation % (blank = default)</th>
              <th className="num">Rate now</th>
              <th className="num">TBD</th>
              <th>TBD by region</th>
              <th className="num">Cap (projects)</th>
              <th className="num">Cap (Rs M)</th>
              <th>Colour</th>
              <th>Funding source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campusCats.map((c, i) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">
                  {i + 1}
                  <button type="button" className="ml-1 px-1" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c.id, -1)}>
                    ▲
                  </button>
                  <button type="button" className="px-1" aria-label={`Move ${c.name} down`} disabled={i === campusCats.length - 1} onClick={() => move(c.id, 1)}>
                    ▼
                  </button>
                </td>
                <td>
                  <input className="cell w-36" aria-label={`Name of ${c.name}`} value={c.name} onChange={(e) => setCat(c.id, { name: e.target.value })} />
                </td>
                <td>{c.rule ? <RuleEditor rule={c.rule} name={c.name} onChange={(rule) => setCat(c.id, { rule })} /> : null}</td>
                <td className="num">
                  <Num label={`Last year cost of ${c.name}`} value={c.lastYearRate} onChange={(v) => setCat(c.id, { lastYearRate: v })} />
                </td>
                <td className="num">
                  <Num label={`Inflation of ${c.name}`} width="w-16" value={c.inflationPct} onChange={(v) => setCat(c.id, { inflationPct: v })} />
                </td>
                <td className="num">{c.lastYearRate === null ? <span className="text-warn">not set</span> : rs(rateFor(c, config))}</td>
                <td className="num">
                  <Num label={`TBD of ${c.name}`} width="w-16" step="1" value={c.tbdCount ?? 0} onChange={(v) => setCat(c.id, { tbdCount: Math.floor(v ?? 0) })} />
                </td>
                <td>
                  <ByRegion label={`TBD by region of ${c.name}`} regions={regions} value={c.tbdByRegion} onChange={(tbdByRegion) => setCat(c.id, { tbdByRegion })} />
                </td>
                <td className="num">
                  <Num label={`Cap count of ${c.name}`} width="w-16" step="1" value={c.capCount} onChange={(v) => setCat(c.id, { capCount: v === null ? null : Math.floor(v) })} />
                </td>
                <td className="num">
                  <Num label={`Cap Rs of ${c.name}`} width="w-20" value={c.capRs} onChange={(v) => setCat(c.id, { capRs: v })} />
                </td>
                <td>
                  <input type="color" aria-label={`Colour of ${c.name}`} value={c.colour ?? '#667085'} onChange={(e) => setCat(c.id, { colour: e.target.value })} />
                </td>
                <td>
                  <input className="cell w-28" aria-label={`Funding source of ${c.name}`} value={c.fundingSource ?? ''} onChange={(e) => setCat(c.id, { fundingSource: e.target.value })} />
                </td>
                <td>{SEEDED.has(c.id) ? null : <button type="button" className="btn btn-danger" onClick={() => remove(c)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn mt-3" onClick={() => add('campus')}>
          Add campus category
        </button>
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
              <th>Colour</th>
              <th>Funding source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {anticipated.map((c) => {
              const lump = c.lumpSum !== null && c.lumpSum !== undefined;
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
                  <td>
                    <input type="color" aria-label={`Colour of ${c.name}`} value={c.colour ?? '#667085'} onChange={(e) => setCat(c.id, { colour: e.target.value })} />
                  </td>
                  <td>
                    <input className="cell w-28" aria-label={`Funding source of ${c.name}`} value={c.fundingSource ?? ''} onChange={(e) => setCat(c.id, { fundingSource: e.target.value })} />
                  </td>
                  <td>{SEEDED.has(c.id) ? null : <button type="button" className="btn btn-danger" onClick={() => remove(c)}>Remove</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="btn mt-3" onClick={() => add('anticipated')}>
          Add anticipated category
        </button>
      </section>
    </div>
  );
}
