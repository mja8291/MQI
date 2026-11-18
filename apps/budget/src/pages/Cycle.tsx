import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FY2026_27_BASELINE, FY2026_27_TOTAL, cloneScenarioConfig, defaultScenarioConfig, runBudget } from '@mqi/shared';
import type { Scenario } from '@mqi/shared';
import { api, errorText } from '../lib/api';
import { useCycleCampuses, useData } from '../lib/data';
import { dateTime, int, rs } from '../lib/format';
import { ExportButtons } from '../components/ExportButtons';

export function CyclePage() {
  const { cycleId } = useParams();
  const { state, putScenario, reload } = useData();
  const campuses = useCycleCampuses(cycleId);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const cycle = state?.cycles.find((c) => c.id === cycleId);
  const scenarios = useMemo(() => state?.scenarios.filter((s) => s.cycleId === cycleId) ?? [], [state, cycleId]);
  const totals = useMemo(() => {
    const out = new Map<string, number>();
    if (campuses.data) for (const s of scenarios) out.set(s.id, runBudget(campuses.data.campuses, s.config, state?.regionZones ?? []).total);
    return out;
  }, [scenarios, campuses.data, state?.regionZones]);

  if (!state) return <p className="text-ink-soft">Loading…</p>;
  if (!cycle) return <p>Cycle not found. <Link to="/" className="underline">Home</Link></p>;

  const save = async (body: { id?: string; name: string; config: Scenario['config']; baseUpdatedAt?: string }) => {
    setMsg('');
    try {
      const s = await api<Scenario>('budget.scenario.save', { cycleId: cycle.id, ...body });
      putScenario(s);
      return s;
    } catch (e) {
      setMsg(errorText(e));
      return null;
    }
  };
  const create = async () => {
    const s = await save({ name: `Scenario ${scenarios.length + 1}`, config: defaultScenarioConfig() });
    if (s) navigate(`/scenario/${s.id}?tab=settings`);
  };
  const clone = async (s: Scenario) => {
    await save({ name: `${s.name} (copy)`, config: cloneScenarioConfig(s.config) });
  };
  const rename = async (s: Scenario) => {
    const name = window.prompt('Scenario name', s.name)?.trim();
    if (name && name !== s.name) await save({ id: s.id, name, config: s.config, ...(s.updatedAt ? { baseUpdatedAt: s.updatedAt } : {}) });
  };
  const remove = async (s: Scenario) => {
    if (!window.confirm(`Delete scenario "${s.name}"? This can't be undone.`)) return;
    try {
      await api('budget.scenario.delete', { id: s.id });
      setPicked((p) => p.filter((x) => x !== s.id));
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const sum = campuses.data?.summary;

  return (
    <div className="space-y-5">
      <div className="text-[13px] text-ink-soft">
        <Link to="/" className="underline">
          Cycles
        </Link>{' '}
        › {cycle.name}
      </div>
      <section className="card p-5">
        <h1 className="text-lg font-semibold text-brand-deep">{cycle.name}</h1>
        <p className="text-[13px] text-ink-soft">
          MQI surveys from {cycle.surveyFrom} to {cycle.surveyTo} (latest per campus, training surveys left out).
        </p>
        {campuses.error ? <p className="text-warn text-[13px] mt-2" role="alert">{campuses.error}</p> : null}
        {sum ? (
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]" data-testid="cycle-summary">
            <Stat label="Campuses loaded" value={int(sum.campuses)} />
            <Stat label="No eCompoundNo" value={int(sum.noECompound)} />
            <Stat label="No MQI survey in the window" value={int(sum.noSurvey)} warn={sum.noSurvey > 0} />
            {sum.surveyedNotInMaster ? <Stat label="Surveyed but not in SMS" value={int(sum.surveyedNotInMaster)} warn /> : null}
            <button type="button" className="btn self-center" onClick={campuses.refresh}>
              Refresh MQI figures
            </button>
            <span className="self-center text-ink-faint">MQI figures as of {dateTime(campuses.data!.generatedAt)}</span>
          </div>
        ) : !campuses.error ? (
          <p className="text-[13px] mt-2">Loading campuses…</p>
        ) : null}
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-semibold text-brand-deep">Scenarios</h2>
          <div className="flex-1" />
          <button type="button" className="btn btn-primary" onClick={create}>
            New scenario
          </button>
        </div>
        {msg ? <p className="text-warn text-[13px] mb-2" role="alert">{msg}</p> : null}
        {scenarios.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8">
                  <span className="sr-only">Select</span>
                </th>
                <th>Scenario</th>
                <th className="num">Total (Rs M)</th>
                <th className="num">vs FY 2026-27</th>
                <th>Last saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const total = totals.get(s.id);
                const last = s.config.lastYearTotal ?? null;
                return (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox" aria-label={`Select ${s.name}`} checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                    <td>
                      <Link to={`/scenario/${s.id}`} className="font-semibold text-brand underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="num">{total === undefined ? '…' : rs(total)}</td>
                    <td className="num">{total === undefined || !last ? '–' : `${total - last >= 0 ? '+' : '−'}${rs(Math.abs(total - last))}`}</td>
                    <td className="text-ink-soft">
                      {dateTime(s.updatedAt ?? '')} {s.updatedBy ? `· ${s.updatedBy}` : ''}
                    </td>
                    <td className="whitespace-nowrap text-right space-x-1">
                      <button type="button" className="btn" onClick={() => clone(s)}>
                        Clone
                      </button>
                      <button type="button" className="btn" onClick={() => rename(s)}>
                        Rename
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => remove(s)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px]">No scenarios yet. Start one with the seeded categories, then enter the rates.</p>
        )}
        {scenarios.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-soft">{picked.length ? `${picked.length} selected` : 'Tick scenarios to compare or export them (up to 3).'}</span>
            <button type="button" className="btn" disabled={picked.length < 2} onClick={() => navigate(`/cycle/${cycle.id}/compare?ids=${picked.join(',')}`)}>
              Compare
            </button>
            {campuses.data && picked.length ? (
              <ExportButtons cycle={cycle} scenarios={scenarios.filter((s) => picked.includes(s.id))} campuses={campuses.data} zones={state.regionZones} />
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-brand-deep mb-1">Last year: FY 2026-27 budget</h2>
        <p className="text-[13px] text-ink-soft mb-3">For reference. These lines don&apos;t map one-to-one onto the MQI categories; each scenario&apos;s rates are entered in its settings.</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Schools</th>
              <th className="num">Rate (Rs M)</th>
              <th className="num">Budget (Rs M)</th>
            </tr>
          </thead>
          <tbody>
            {FY2026_27_BASELINE.map((b) => (
              <tr key={b.category}>
                <td>{b.category}</td>
                <td className="num">{b.schools ?? '–'}</td>
                <td className="num">{rs(b.rate)}</td>
                <td className="num">{rs(b.budget)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td>
              <td />
              <td />
              <td className="num">{rs(FY2026_27_TOTAL)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${warn ? 'bg-amber-tint' : 'bg-surface'}`}>
      <div className="text-[18px] font-semibold">{value}</div>
      <div className="text-ink-soft">{label}</div>
    </div>
  );
}
