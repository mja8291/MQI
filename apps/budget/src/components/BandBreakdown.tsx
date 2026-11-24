import type { CategoryResult } from '@mqi/shared';

const ORDER = ['Poor', 'Average', 'Good', 'Excellent'] as const;

/**
 * W95: under an Unsafe category, how many of its campuses (siblings included) fall in each MQI band,
 * e.g. "Poor 4 · Average 6 · Good 2", so the share of the Unsafe budget on Poor/Average campuses shows.
 */
export function BandBreakdown({ result }: { result: CategoryResult | undefined }) {
  if (!result || result.category.rule?.type !== 'unsafe' || !result.selected.length) return null;
  const counts = new Map<string, number>();
  for (const p of result.selected) {
    const k = p.campus.band ?? 'No survey';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const parts = [...ORDER, 'No survey'].filter((k) => counts.get(k)).map((k) => `${k} ${counts.get(k)}`);
  return (
    <div className="mt-1 text-[11.5px] text-ink-soft whitespace-nowrap" data-testid={`bands-${result.category.id}`}>
      {parts.join(' · ')}
    </div>
  );
}
