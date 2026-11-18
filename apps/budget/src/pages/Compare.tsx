import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { compareScenarios, runBudget } from '@mqi/shared';
import type { CompareRow } from '@mqi/shared';
import { useCycleCampuses, useData } from '../lib/data';
import { int, rs } from '../lib/format';
import { ExportButtons } from '../components/ExportButtons';

export function ComparePage() {
  const { cycleId } = useParams();
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 3);
  const { state } = useData();
  const campuses = useCycleCampuses(cycleId);
  const cycle = state?.cycles.find((c) => c.id === cycleId);
  const scenarios = useMemo(() => ids.map((id) => state?.scenarios.find((s) => s.id === id)).filter((s) => !!s), [ids, state]);
  const cmp = useMemo(
    () => (campuses.data && scenarios.length ? compareScenarios(scenarios.map((s) => ({ name: s.name, result: runBudget(campuses.data!.campuses, s.config, state?.regionZones ?? []) }))) : null),
    [scenarios, campuses.data, state?.regionZones],
  );
  if (!state) return <p className="text-ink-soft">Loading…</p>;
  if (!cycle) return <p>Cycle not found.</p>;
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
        › Compare
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-brand-deep">Compare scenarios</h1>
        <div className="flex-1" />
        {campuses.data && scenarios.length ? <ExportButtons cycle={cycle} scenarios={scenarios} campuses={campuses.data} zones={state.regionZones} /> : null}
      </div>
      {!cmp ? (
        <p className="text-ink-soft">{campuses.error || 'Loading…'}</p>
      ) : (
        <section className="card p-4 overflow-x-auto">
          <p className="text-[12.5px] text-ink-soft mb-2">Rows that differ between scenarios are highlighted.</p>
          <table className="tbl" data-testid="compare">
            <thead>
              <tr>
                <th />
                {cmp.names.map((n) => (
                  <th key={n} className="num">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Rows rows={[cmp.totals]} money bold />
              <Head title="Budget by category (Rs M)" n={cmp.names.length} />
              <Rows rows={cmp.budgetByCategory} money />
              <Head title="Campuses by category (incl. siblings and TBD)" n={cmp.names.length} />
              <Rows rows={cmp.campusesByCategory} />
              <Head title="Campuses by region" n={cmp.names.length} />
              <Rows rows={cmp.campusesByRegion} />
              <Head title="Budget by region (Rs M)" n={cmp.names.length} />
              <Rows rows={cmp.budgetByRegion} money />
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Head({ title, n }: { title: string; n: number }) {
  return (
    <tr>
      <td colSpan={n + 1} className="pt-4 font-semibold text-brand-deep">
        {title}
      </td>
    </tr>
  );
}

function Rows({ rows, money, bold }: { rows: CompareRow[]; money?: boolean; bold?: boolean }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.key} className={`${r.differs ? 'bg-amber-tint' : ''} ${bold ? 'font-semibold' : ''}`} data-differs={r.differs ? 'yes' : 'no'}>
          <td>{r.label}</td>
          {r.values.map((v, i) => (
            <td key={i} className="num">
              {money ? rs(v) : int(v)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
