import type { BudgetCategory, CapStatus } from '@mqi/shared';
import { int, rs } from '../lib/format';

export const CAP_LABEL: Record<CapStatus, { label: string; hint: string; cls: string }> = {
  none: { label: 'No cap', hint: 'no cap set', cls: 'text-ink-faint' },
  within: { label: 'Within', hint: 'everything fits', cls: 'bg-brand-tint text-brand' },
  trimmed: { label: 'Cut-off', hint: 'some campuses wait below the cut-off line', cls: 'bg-amber-tint text-amber' },
  overrun: { label: 'Overrun', hint: 'over the cap but never trimmed (unsafe or TBD)', cls: 'bg-warn-tint text-warn' },
};

export function capText(c: BudgetCategory): string {
  const parts = [c.capCount != null ? `${int(c.capCount)} projects` : '', c.capRs != null ? `Rs ${rs(c.capRs)}M` : ''].filter(Boolean);
  return parts.join(' / ');
}

export function CapBadge({ status, category }: { status: CapStatus; category: BudgetCategory }) {
  const l = CAP_LABEL[status];
  return (
    <span className="whitespace-nowrap text-[12px]">
      <span className={`rounded px-1.5 py-0.5 font-semibold ${l.cls}`}>{l.label}</span>
      {capText(category) ? <span className="ml-1 text-ink-faint">{capText(category)}</span> : null}
    </span>
  );
}
