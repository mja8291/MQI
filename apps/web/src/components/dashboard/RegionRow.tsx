import { bandColor } from "@/lib/scoring";

export function RegionRow({ region, average, count }: { region: string; average: number; count: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-[12.5px] w-24 shrink-0 truncate">{region}</span>
      <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, average)}%`, background: bandColor(average) }}
        />
      </div>
      <span className="text-[11.5px] text-ink-soft w-16 text-right shrink-0">
        {Math.round(average)}% ({count})
      </span>
    </div>
  );
}
