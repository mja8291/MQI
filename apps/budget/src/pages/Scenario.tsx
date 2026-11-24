import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { listAssumptions, runBudget } from '@mqi/shared';
import type { AssumptionMeta, BudgetResult, Scenario, ScenarioConfig } from '@mqi/shared';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCycleCampuses, useData } from '../lib/data';
import { dateTime, int, rs, signed } from '../lib/format';
import { SettingsEditor } from '../components/SettingsEditor';
import { CAP_LABEL, CapBadge } from '../components/CapBadge';
import { BandBreakdown } from '../components/BandBreakdown';
import { ExportButtons } from '../components/ExportButtons';

type Tab = 'dashboard' | 'settings' | 'assumptions';

export function ScenarioPage() {
  const { scenarioId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'dashboard';
  const { state, putScenario } = useData();
  const scenario = state?.scenarios.find((s) => s.id === scenarioId);
  const cycle = state?.cycles.find((c) => c.id === scenario?.cycleId);
  const campuses = useCycleCampuses(scenario?.cycleId);
  // W82: an edit belongs to one scenario at one saved version. Moving to another scenario, or a newer
  // save arriving, never carries an edit across (it falls back to that scenario's saved settings); a
  // background refresh of the same version keeps the edit.
  const version = scenario ? `${scenario.id}@${scenario.updatedAt ?? ''}` : '';
  const [edit, setEdit] = useState<{ version: string; config: ScenarioConfig } | null>(null);
  const draft: ScenarioConfig | null = edit && edit.version === version ? edit.config : (scenario?.config ?? null);
  const setDraft = (config: ScenarioConfig) => setEdit({ version, config });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    setPulling(true);
    try {
      await campuses.pull();
    } finally {
      setPulling(false);
    }
  };

  const dirty = useMemo(() => !!scenario && !!draft && JSON.stringify(draft) !== JSON.stringify(scenario.config), [scenario, draft]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const result = useMemo(() => (draft && campuses.data ? runBudget(campuses.data.campuses, draft, state?.regionZones ?? []) : null), [draft, campuses.data, state?.regionZones]);

  if (!state) return <p className="text-ink-soft">Loading…</p>;
  if (!scenario || !cycle || !draft) return <p>Scenario not found. <Link to="/" className="underline">Home</Link></p>;

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const s = await api<Scenario>('budget.scenario.save', { id: scenario.id, cycleId: scenario.cycleId, name: scenario.name, config: draft, ...(scenario.updatedAt ? { baseUpdatedAt: scenario.updatedAt } : {}) });
      putScenario(s);
      setEdit(null);
      setMsg('Saved.');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const setTab = (t: Tab) => setParams(t === 'dashboard' ? {} : { tab: t }, { replace: true });

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-ink-soft">
        <Link to="/" className="underline">
          Cycles
        </Link>{' '}
        ›{' '}
        <Link to={`/cycle/${cycle.id}`} className="underline">
          {cycle.name}
        </Link>{' '}
        › {scenario.name}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-brand-deep">{scenario.name}</h1>
        <div role="tablist" className="flex gap-1 rounded-lg bg-border/60 p-1 text-[13px]">
          {(['dashboard', 'settings', 'assumptions'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-semibold ${tab === t ? 'bg-white text-brand-deep shadow-sm' : 'text-ink-soft'}`}>
              {t === 'dashboard' ? 'Dashboard' : t === 'settings' ? 'Settings' : 'Assumption register'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {dirty ? <span className="text-[12.5px] font-semibold text-amber">Unsaved changes</span> : null}
        {msg ? <span className={`text-[12.5px] ${msg === 'Saved.' ? 'text-brand' : 'text-warn'}`} role="status">{msg}</span> : null}
        <button type="button" className="btn" disabled={!dirty} onClick={() => setEdit(null)}>
          Undo changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {campuses.data ? <ExportButtons cycle={cycle} scenarios={[{ ...scenario, config: draft }]} campuses={campuses.data} zones={state.regionZones} /> : null}
      </div>
      <p className="text-[12px] text-ink-faint">
        Last saved {dateTime(scenario.updatedAt ?? '')} {scenario.updatedBy ? `by ${scenario.updatedBy}` : ''}. Figures update as you edit; Save keeps them.
      </p>
      {campuses.error ? <p className="text-warn" role="alert">{campuses.error}</p> : null}
      {tab === 'settings' ? (
        <SettingsEditor
          config={draft}
          onChange={setDraft}
          regions={state.master.regions}
          result={result}
          campuses={campuses.data?.campuses ?? []}
          onPull={() => void pull()}
          pulling={pulling}
          mqiAsOf={campuses.data?.generatedAt ?? ''}
        />
      ) : tab === 'assumptions' ? (
        <Assumptions config={draft} onChange={setDraft} />
      ) : result ? (
        <Dashboard scenario={scenario} result={result} />
      ) : (
        <p className="text-ink-soft">Loading campuses…</p>
      )}
    </div>
  );
}

function Dashboard({ scenario, result }: { scenario: Scenario; result: BudgetResult }) {
  const selected = result.categories.reduce((n, c) => n + c.selected.length, 0);
  const waiting = result.categories.reduce((n, c) => n + c.waitlist.length, 0);
  const last = result.lastYearTotal;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total budget (Rs M)" value={rs(result.total)} testId="total" sub={result.cut ? `After a cut of Rs ${rs(result.cut.achieved)}M (${int(result.cut.units.length)} campuses; see Settings)` : undefined} />
        <Card label={last ? `vs last year (Rs ${rs(last)}M)` : 'vs last year'} value={last ? signed(result.total - last) : '–'} />
        <Card label="Campuses selected (incl. siblings)" value={int(selected)} sub={waiting ? `${int(waiting)} on waitlists` : undefined} />
        <Card
          label="Overall ceiling"
          value={result.ceiling ? (result.ceiling.overrun > 0 ? `Over by ${rs(result.ceiling.overrun)}` : 'Within') : 'Not set'}
          warn={!!result.ceiling && result.ceiling.overrun > 0}
          sub={result.ceiling ? `Ceiling Rs ${rs(result.ceiling.ceilingRs)}M` : undefined}
        />
      </div>
      {result.warnings.length ? (
        <ul className="rounded-xl border border-warn bg-warn-tint p-3 text-[13px] text-warn list-disc pl-6" role="alert">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold text-brand-deep mb-2">Categories</h2>
        <table className="tbl" data-testid="category-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Category</th>
              <th className="num">Campuses</th>
              <th className="num">Siblings</th>
              <th className="num">TBD</th>
              <th className="num">Rate (Rs M)</th>
              <th className="num">Budget (Rs M)</th>
              <th>Cap</th>
              <th className="num">Waitlist</th>
            </tr>
          </thead>
          <tbody>
            {result.categories.map((c) => (
              <tr key={c.category.id}>
                <td className="text-ink-faint">{c.precedence ?? ''}</td>
                <td>
                  <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ background: c.category.colour ?? '#999' }} />
                  {c.category.kind === 'campus' ? (
                    <Link to={`/scenario/${scenario.id}/category/${c.category.id}`} className="text-brand underline font-semibold">
                      {c.category.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{c.category.name}</span>
                  )}
                  <BandBreakdown result={c} />
                </td>
                <td className="num">{c.category.kind === 'campus' ? int(c.primaries) : c.category.lumpSum != null ? 'Lump sum' : int(c.anticipatedCount)}</td>
                <td className="num">{c.category.kind === 'campus' ? int(c.siblings) : ''}</td>
                <td className="num">{c.category.kind === 'campus' ? int(c.tbd) : ''}</td>
                <td className="num">{c.category.kind === 'anticipated' && c.category.lumpSum != null ? '' : c.category.lastYearRate === null ? <span className="text-warn">not set</span> : rs(c.rate)}</td>
                <td className="num font-semibold">{rs(c.budget)}</td>
                <td>
                  <CapBadge status={c.capStatus} category={c.category} />
                </td>
                <td className="num">{c.waitlist.length ? int(c.waitlist.length) : ''}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td />
              <td>Total</td>
              <td className="num">{int(result.categories.reduce((n, c) => n + c.primaries, 0))}</td>
              <td className="num">{int(result.categories.reduce((n, c) => n + c.siblings, 0))}</td>
              <td className="num">{int(result.categories.reduce((n, c) => n + c.tbd, 0))}</td>
              <td />
              <td className="num">{rs(result.total)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
        {result.unplaced ? <p className="mt-2 text-[12px] text-ink-soft">{int(result.unplaced)} surveyed campuses are in no category (e.g. Excellent, or Good beyond the bottom N).</p> : null}
        <p className="mt-1 text-[12px] text-ink-faint">Cap status: {Object.values(CAP_LABEL).map((v) => `${v.label} = ${v.hint}`).filter((_, i) => i > 0).join('; ')}.</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 overflow-x-auto">
          <h2 className="font-semibold text-brand-deep mb-2">By region</h2>
          <table className="tbl" data-testid="region-table">
            <thead>
              <tr>
                <th>Region</th>
                <th>Zone</th>
                <th className="num">Campuses</th>
                <th className="num">TBD</th>
                <th className="num">Budget (Rs M)</th>
              </tr>
            </thead>
            <tbody>
              {result.regions.map((r) => (
                <tr key={r.region}>
                  <td>{r.region}</td>
                  <td className="text-ink-soft">{r.zone}</td>
                  <td className="num">{r.campuses ? int(r.campuses) : ''}</td>
                  <td className="num">{r.tbd ? int(r.tbd) : ''}</td>
                  <td className="num">{rs(r.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-4 overflow-x-auto">
          <h2 className="font-semibold text-brand-deep mb-2">By zone</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Zone</th>
                <th className="num">Campuses</th>
                <th className="num">TBD</th>
                <th className="num">Budget (Rs M)</th>
              </tr>
            </thead>
            <tbody>
              {result.zones.map((z) => (
                <tr key={z.zone}>
                  <td>{z.zone}</td>
                  <td className="num">{z.campuses ? int(z.campuses) : ''}</td>
                  <td className="num">{z.tbd ? int(z.tbd) : ''}</td>
                  <td className="num">{rs(z.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.ceiling && result.ceiling.overrun > 0 ? (
            <p className="mt-3 text-[13px] text-warn">
              Over the ceiling by Rs {rs(result.ceiling.overrun)}M. Nothing is trimmed automatically: lower caps or rates in Settings.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Card({ label, value, sub, warn, testId }: { label: string; value: string; sub?: string; warn?: boolean; testId?: string }) {
  return (
    <div className={`card p-4 ${warn ? 'border-warn bg-warn-tint' : ''}`}>
      <div className={`text-[22px] font-semibold ${warn ? 'text-warn' : 'text-brand-deep'}`} data-testid={testId}>
        {value}
      </div>
      <div className="text-[12.5px] text-ink-soft">{label}</div>
      {sub ? <div className="text-[12px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}

function Assumptions({ config, onChange }: { config: ScenarioConfig; onChange: (c: ScenarioConfig) => void }) {
  const { user } = useAuth();
  const rows = listAssumptions(config);
  const set = (key: string, patch: Partial<AssumptionMeta>) => {
    const current = config.assumptions[key] ?? { source: '', owner: '', date: '', note: '' };
    onChange({ ...config, assumptions: { ...config.assumptions, [key]: { ...current, ...patch } } });
  };
  const stamp = (key: string) => set(key, { owner: config.assumptions[key]?.owner || user?.name || '', date: new Date().toISOString().slice(0, 10) });
  return (
    <section className="card p-4 overflow-x-auto">
      <h2 className="font-semibold text-brand-deep mb-1">Assumption register</h2>
      <p className="text-[13px] text-ink-soft mb-3">Every rate, inflation figure, cap, N and TBD count with where it came from. Included in the budget book.</p>
      <table className="tbl" data-testid="assumptions">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Value</th>
            <th>Source</th>
            <th>Owner</th>
            <th>Date</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.item}</td>
              <td className="num">{r.value}</td>
              <td>
                <input className="cell w-44" aria-label={`Source of ${r.item}`} value={r.meta.source} onChange={(e) => set(r.key, { source: e.target.value })} />
              </td>
              <td>
                <input className="cell w-32" aria-label={`Owner of ${r.item}`} value={r.meta.owner} onChange={(e) => set(r.key, { owner: e.target.value })} />
              </td>
              <td>
                <input className="cell w-36" type="date" aria-label={`Date of ${r.item}`} value={r.meta.date} onChange={(e) => set(r.key, { date: e.target.value })} />
              </td>
              <td>
                <input className="cell w-56" aria-label={`Note on ${r.item}`} value={r.meta.note} onChange={(e) => set(r.key, { note: e.target.value })} />
              </td>
              <td>
                <button type="button" className="btn" onClick={() => stamp(r.key)} title="Fill owner (you) and today's date">
                  Me, today
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
