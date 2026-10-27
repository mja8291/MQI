export function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-3">
      <div className="text-[11px] text-ink-soft mb-0.5">{label}</div>
      <div className="font-display text-[22px] font-semibold" style={{ color: color ?? "var(--brand-deep)" }}>
        {value}
      </div>
      {sub ? <div className="text-[10.5px] text-ink-faint mt-0.5">{sub}</div> : null}
    </div>
  );
}
