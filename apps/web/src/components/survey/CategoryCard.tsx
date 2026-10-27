import { Check } from "lucide-react";
import type { Category } from "@/lib/types";

const TINT: Record<Category, string> = {
  Functionality: "var(--cat-functionality-tint)",
  Safety: "var(--cat-safety-tint)",
  Aesthetics: "var(--cat-aesthetics-tint)",
};

interface CategoryCardProps {
  category: Category;
  weight: number;
  answered: number;
  total: number;
  onOpen: () => void;
}

export function CategoryCard({ category, weight, answered, total, onOpen }: CategoryCardProps) {
  const complete = total > 0 && answered === total;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-border bg-card p-4 mb-3 flex items-center gap-3.5"
    >
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: TINT[category] }}
      >
        {complete ? <Check size={20} className="text-brand-deep" /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-ink">{category}</div>
        <div className="text-[12px] text-ink-faint">
          {weight}% of overall · {answered} of {total} scored
        </div>
      </div>
    </button>
  );
}
