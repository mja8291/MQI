import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { UNSAFE_LEVEL_LABEL, runBudget } from '@mqi/shared';
import type { PlacedCampus } from '@mqi/shared';
import { useCycleCampuses, useData } from '../lib/data';
import { int, rs, score } from '../lib/format';
import { CapBadge } from '../components/CapBadge';

export function CategoryPage() {
  const { scenarioId, categoryId } = useParams();
  const { state } = useData();
  const scenario = state?.scenarios.find((s) => s.id === scenarioId);
  const cycle = state?.cycles.find((c) => c.id === scenario?.cycleId);
  const campuses = useCycleCampuses(scenario?.cycleId);
  const [q, setQ] = useState('');
  const result = useMemo(() => (scenario && campuses.data ? runBudget(campuses.data.campuses, scenario.config, state?.regionZones ?? []) : null), [scenario, campuses.data, state?.regionZones]);
  if (!state) return <p className="text-ink-soft">Loading…</p>;
  if (!scenario || !cycle) return <p>Scenario not found. <Link to="/" className="underline">Home</Link></p>;
  if (!result) return <p className="text-ink-soft">{campuses.error || 'Loading campuses…'}</p>;
  const c = result.categories.find((x) => x.category.id === categoryId);
  if (!c) return <p>Category not found.</p>;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (p: PlacedCampus) => !words.length || words.every((w) => `${p.campus.name} ${p.campus.campusId} ${p.campus.region} ${p.campus.eCompoundNo} ${p.tag}`.toLowerCase().includes(w));
  const tbdRegions = Object.entries(c.category.tbdByRegion ?? {});
  const tbdAllocated = tbdRegions.reduce((n, [, k]) => n + k, 0);

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
        ›{' '}
        <Link to={`/scenario/${scenario.id}`} className="underline">
          {scenario.name}
        </Link>{' '}
        › {c.category.name}
      </div>
      <div className="card p-4 flex flex-wrap gap-6 items-center text-[13px]">
        <h1 className="text-xl font-semibold text-brand-deep">
          <span className="inline-block h-3 w-3 rounded-full mr-2" style={{ background: c.category.colour ?? '#999' }} />
          {c.category.name}
        </h1>
        <span>
          <b>{int(c.primaries)}</b> campuses
        </span>
        <span>
          <b>{int(c.siblings)}</b> siblings
        </span>
        <span>
          <b>{int(c.tbd)}</b> TBD
        </span>
        <span>
          Rate <b>Rs {rs(c.rate)}M</b>
        </span>
        <span>
          Budget <b>Rs {rs(c.budget)}M</b>
        </span>
        <CapBadge status={c.capStatus} category={c.category} />
        <div className="flex-1" />
        <input className="cell w-64" placeholder="Search campus, region, e-compound" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campuses" />
      </div>
      {c.warnings.length ? (
        <p className="rounded-lg bg-warn-tint p-3 text-[13px] text-warn" role="alert">
          {c.warnings.join(' ')}
        </p>
      ) : null}
      <section className="card p-4 overflow-x-auto">
        <CampusTable list={c.selected.filter(match)} />
        {c.tbd ? (
          <table className="tbl mt-2">
            <tbody>
              {Array.from({ length: c.tbd }, (_, i) => {
                const region = (() => {
                  let k = i;
                  for (const [r, n] of tbdRegions) {
                    if (k < n) return r;
                    k -= n;
                  }
                  return i < tbdAllocated ? '' : 'Unallocated';
                })();
                return (
                  <tr key={i} className="text-ink-soft italic">
                    <td>
                      {c.category.name} — TBD {i + 1} of {c.tbd}
                    </td>
                    <td>{region}</td>
                    <td className="num">Rs {rs(c.rate)}M</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {c.waitlist.length ? (
          <>
            <div className="my-3 border-t-2 border-dashed border-warn pt-2 text-[13px] font-semibold text-warn" data-testid="cutoff">
              Cut-off line — {int(c.waitlist.length)} campuses on the waitlist (they don&apos;t fit the cap)
            </div>
            <CampusTable list={c.waitlist.filter(match)} muted />
          </>
        ) : null}
      </section>
    </div>
  );
}

function CampusTable({ list, muted }: { list: PlacedCampus[]; muted?: boolean }) {
  if (!list.length) return <p className="text-[13px] text-ink-soft">No campuses.</p>;
  return (
    <table className={`tbl ${muted ? 'opacity-75' : ''}`}>
      <thead>
        <tr>
          <th className="num">Unit</th>
          <th>Campus</th>
          <th>Campus ID</th>
          <th className="num">MQI</th>
          <th>Band</th>
          <th>Unsafe</th>
          <th>Region</th>
          <th>Area</th>
          <th>E-compound</th>
          <th>Tags</th>
          <th className="num">Rs M</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => (
          <tr key={p.campus.campusId}>
            <td className="num text-ink-faint">{p.unit}</td>
            <td className="font-semibold">{p.campus.name}</td>
            <td>{p.campus.campusId}</td>
            <td className="num">{score(p.campus.score)}</td>
            <td>{p.campus.band ?? ''}</td>
            <td className={p.campus.unsafe === 'critical' ? 'text-warn font-semibold' : p.campus.unsafe ? 'text-amber font-semibold' : ''}>{p.campus.unsafe ? UNSAFE_LEVEL_LABEL[p.campus.unsafe] : ''}</td>
            <td>{p.campus.region}</td>
            <td>{p.campus.area}</td>
            <td>{p.campus.eCompoundNo}</td>
            <td>{p.tag ? <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[11.5px] text-brand">{p.tag}</span> : null}</td>
            <td className="num">{rs(p.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
