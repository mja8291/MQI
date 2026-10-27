import type { Category } from "@/lib/types";

const TINT: Record<Category, string> = {
  Functionality: "var(--cat-functionality-tint)",
  Safety: "var(--cat-safety-tint)",
  Aesthetics: "var(--cat-aesthetics-tint)",
};

export function CategoryHeader({ category, weight }: { category: Category; weight: number }) {
  return (
    <div
      className="mt-4 mb-1.5 rounded-lg px-3 py-2 flex items-baseline justify-between"
      style={{ background: TINT[category] }}
    >
      <span className="text-xs font-semibold text-brand-deep uppercase tracking-wide">{category}</span>
      <span className="text-[11px] text-ink-soft">{weight}% of overall</span>
    </div>
  );
}
