import { RATING_DEFINITIONS, THUMB_RULE } from "@/lib/data/content";
import type { Category } from "@/lib/types";

const ORDER = ["Good", "Ok", "Poor", "Very Poor"] as const;

export function ConditionInfoPanel({ category }: { category: Category }) {
  const defs = RATING_DEFINITIONS[category];
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-xs space-y-2.5">
      {ORDER.map((c) => (
        <div key={c}>
          <div className="font-semibold text-ink mb-0.5">{c}</div>
          <div className="text-ink-soft leading-snug">{defs[c].en}</div>
          <div className="text-ink-faint leading-snug" dir="rtl">
            {defs[c].ur}
          </div>
        </div>
      ))}
      <div className="pt-1.5 border-t border-border">
        <div className="font-semibold text-ink mb-1">Multiple instances? Use the thumb rule</div>
        {THUMB_RULE.map((t) => (
          <div key={t.rating} className="text-ink-soft leading-snug">
            <span className="font-medium text-ink">{t.rating}:</span> {t.guidance}
          </div>
        ))}
      </div>
    </div>
  );
}
