import { bandColor } from "@/lib/scoring";

/** W65: the region name is never cut off (it wraps), and the figures keep their own width. */
export function RegionRow({ region, average, count }: { region: string; average: number; count: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-[12.5px] w-28 shrink-0 leading-tight">{region}</span>
      <div className="flex-1 min-w-0 h-2 rounded-full bg-border/60 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, average)}%`, background: bandColor(average) }} />
      </div>
      <span className="text-[11.5px] text-ink-soft shrink-0 tabular-nums whitespace-nowrap">
        {Math.round(average)}% ({count})
      </span>
    </div>
  );
}
