
import { Check, ChevronDown } from "lucide-react";

interface AccordionSectionProps {
  title: string;
  subtitle?: string;
  answered: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  /** Shows a red asterisk badge next to the title — set after a blocked save attempt, for sections still missing responses. */
  pending?: boolean;
  /** Background color for the leading icon chip — defaults to the app's standard brand tint. */
  tint?: string;
  children: React.ReactNode;
}

/**
 * One collapsible section of a Round 3 Task 11 accordion page — used
 * by the work-category sections (locations/category/page.tsx), which previously lived on
 * two separate pages each (a picker page + a per-section scoring page).
 * Collapsed by default; the page hosting these is responsible for the
 * one-open-at-a-time behavior (this component only knows its own
 * open/toggle state, not its siblings').
 */
export function AccordionSection({
  title,
  subtitle,
  answered,
  total,
  open,
  onToggle,
  pending,
  tint,
  children,
}: AccordionSectionProps) {
  const complete = total > 0 && answered === total;
  return (
    <div className="rounded-2xl border border-border bg-card mb-3 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex items-center gap-3.5">
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: tint ?? "var(--brand-tint)" }}
        >
          {complete ? <Check size={20} className="text-brand-deep" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-ink">
            {title}
            {pending ? (
              <span
                className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-band-poor-tint align-middle text-[10.5px] font-bold text-band-poor"
                aria-label="Still has unscored items"
              >
                *
              </span>
            ) : null}
          </div>
          <div className="text-[12px] text-ink-faint">
            {subtitle ? `${subtitle} · ` : ""}
            {answered} of {total} scored
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-ink-faint shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="px-4 pb-1 border-t border-border">{children}</div> : null}
    </div>
  );
}
