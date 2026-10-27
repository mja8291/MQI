import { bandColor } from "@/lib/scoring";
import type { Category } from "@/lib/types";

interface CategoryBarProps {
  category: Category;
  score: number | null;
}

export function CategoryBar({ category, score }: CategoryBarProps) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const color = bandColor(score);
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-soft">{category}</span>
        <span className="font-semibold text-ink">{score === null ? "—" : `${Math.round(score)}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
