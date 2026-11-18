import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { financialYear } from '@mqi/shared';
import type { BudgetCycle, BudgetImportResult, RegionZone } from '@mqi/shared';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { dateTime, int } from '../lib/format';

/** The financial year that starts this July (or started last July). */
function currentFyStart(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function HomePage() {
  const { state, error, reload } = useData();
  if (error) return <p className="text-warn" role="alert">{error}</p>;
  if (!state) return <p className="text-ink-soft">Loading…</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Cycles cycles={state.cycles} scenarioCount={(id) => state.scenarios.filter((s) => s.cycleId === id).length} onSaved={reload} />
      </div>
      <div className="space-y-5">
        <Master master={state.master} onImported={reload} />
        <Zones regions={state.master.regions} saved={state.regionZones} onSaved={reload} />
      </div>
    </div>
  );
}

function Cycles({ cycles, scenarioCount, onSaved }: { cycles: BudgetCycle[]; scenarioCount: (id: string) => number; onSaved: () => Promise<void> }) {
  // The budget for next FY uses this FY's surveys.
  const thisFy = currentFyStart();
  const [budgetYear, setBudgetYear] = useState(thisFy + 1);
  const window = financialYear(budgetYear - 1);
  const [from, setFrom] = useState(window.from);
  const [to, setTo] = useState(window.to);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pickYear = (y: number) => {
    setBudgetYear(y);
    const w = financialYear(y - 1);
    setFrom(w.from);
    setTo(w.to);
  };
  const create = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api('budget.cycle.save', { name: financialYear(budgetYear).name, surveyFrom: from, surveyTo: to });
      await onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5">
      <h1 className="text-lg font-semibold text-brand-deep">Budget cycles</h1>
      <p className="text-[13px] text-ink-soft mb-4">A cycle is one financial year. Each campus is scored by its latest MQI survey dated in the cycle&apos;s survey window.</p>
      {cycles.length ? (
        <table className="tbl mb-5">
          <thead>
            <tr>
              <th>Cycle</th>
              <th>MQI surveys from</th>
              <th>to</th>
              <th className="num">Scenarios</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="font-semibold text-brand underline" to={`/cycle/${c.id}`}>
                    {c.name}
                  </Link>
                </td>
                <td>{c.surveyFrom}</td>
                <td>{c.surveyTo}</td>
                <td className="num">{scenarioCount(c.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[13px] mb-4">No cycles yet.</p>
      )}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-surface p-3 text-[13px]">
        <label>
          New cycle
          <select className="cell block mt-1" value={budgetYear} onChange={(e) => pickYear(Number(e.target.value))}>
            {[thisFy, thisFy + 1, thisFy + 2].map((y) => (
              <option key={y} value={y}>
                {financialYear(y).name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Surveys from
          <input className="cell block mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          to
          <input className="cell block mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
          Create cycle
        </button>
        {msg ? <p className="basis-full text-warn">{msg}</p> : null}
      </div>
    </section>
  );
}

function Master({ master, onImported }: { master: { campuses: number; importedAt: string; importedBy: string; source: string }; onImported: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BudgetImportResult | null>(null);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true);
    setMsg('');
    try {
      setResult(await api<BudgetImportResult>('budget.import'));
      await onImported();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5 text-[13px]">
      <h2 className="font-semibold text-brand-deep mb-1">Campus master</h2>
      {master.importedAt ? (
        <p className="text-ink-soft">
          {int(master.campuses)} campuses from {master.source}, imported {dateTime(master.importedAt)}
          {master.importedBy ? ` by ${master.importedBy}` : ''}.
        </p>
      ) : (
        <p className="text-ink-soft">Not imported yet. Import the SMS 2026 list before building a budget.</p>
      )}
      <button type="button" className="btn btn-primary mt-3" onClick={run} disabled={busy} data-testid="import">
        {busy ? 'Importing…' : master.importedAt ? 'Import again' : 'Import campuses'}
      </button>
      {result ? (
        <div className="mt-3 rounded-lg bg-brand-tint p-3" role="status" data-testid="import-summary">
          <div>
            <b>{int(result.campuses)}</b> campuses loaded
          </div>
          <div>
            <b>{int(result.noECompound)}</b> with no eCompoundNo
          </div>
          <div className="text-ink-soft">Campuses with no MQI survey this year are counted on each cycle&apos;s page.</div>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-warn" role="alert">{msg}</p> : null}
    </section>
  );
}

function Zones({ regions, saved, onSaved }: { regions: string[]; saved: RegionZone[]; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<RegionZone[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const zoneOf = new Map(saved.map((r) => [r.region.toLowerCase(), r.zone]));
    const all = [...new Set([...regions, ...saved.map((r) => r.region)])];
    setRows(all.map((region) => ({ region, zone: zoneOf.get(region.toLowerCase()) ?? '' })));
  }, [regions, saved]);
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api('budget.zones.save', { rows: rows.filter((r) => r.region.trim()) });
      await onSaved();
      setMsg('Saved.');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5 text-[13px]">
      <h2 className="font-semibold text-brand-deep mb-1">Region → Zone</h2>
      <p className="text-ink-soft mb-3">SMS has no zone column. Set the zone of each region for the zone breakdown.</p>
      {rows.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Region</th>
              <th>Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.region}>
                <td>{r.region}</td>
                <td>
                  <input
                    className="cell w-full"
                    aria-label={`Zone of ${r.region}`}
                    value={r.zone}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, zone: e.target.value } : x)))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Import the campuses first to list their regions.</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="btn" onClick={save} disabled={busy || !rows.length}>
          Save zones
        </button>
        {msg ? <span className={msg === 'Saved.' ? 'text-brand' : 'text-warn'}>{msg}</span> : null}
      </div>
    </section>
  );
}
