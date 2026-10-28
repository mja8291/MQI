
import { CONDITIONS } from "@/lib/scoring";
import type { Condition } from "@/lib/types";

interface ConditionPillsProps {
  value: Condition | undefined;
  onChange: (value: Condition) => void;
  /** From RubricItem.conditionOverride — restricts + relabels the pills for items with fewer rubric states. N/A is appended unless hideNA is set. */
  options?: { condition: Exclude<Condition, "N/A">; label: string }[];
  /** From RubricItem.hideNA — see there for why an item would drop N/A entirely. */
  hideNA?: boolean;
}

/**
 * v2 (W21): for items whose Unsafe is split into parts (Wall/Column): OK, one pill per part
 * ("Column Unsafe", "Wall Unsafe" — any combination), N/A.
 */
export function UnsafePartsPills({
  value,
  parts,
  allParts,
  onChange,
  onPartsChange,
}: {
  value: Condition | undefined;
  parts: string[];
  allParts: string[];
  onChange: (value: Condition) => void;
  onPartsChange: (parts: string[]) => void;
}) {
  const pill = (active: boolean) =>
    `min-h-10 inline-flex items-center rounded-full border px-3.5 text-[12.5px] ${
      active ? "bg-brand border-brand text-white" : "bg-white border-border text-ink-soft"
    }`;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange("Good")} className={pill(value === "Good")}>
        OK
      </button>
      {allParts.map((part) => {
        const active = parts.includes(part);
        return (
          <button
            key={part}
            type="button"
            aria-pressed={active}
            onClick={() => onPartsChange(active ? parts.filter((p) => p !== part) : allParts.filter((p) => p === part || parts.includes(p)))}
            className={pill(active)}
          >
            {part} Unsafe
          </button>
        );
      })}
      <button type="button" onClick={() => onChange("N/A")} className={pill(value === "N/A")}>
        N/A
      </button>
    </div>
  );
}

export function ConditionPills({ value, onChange, options, hideNA }: ConditionPillsProps) {
  const pills: { condition: Condition; label: string }[] = options
    ? hideNA
      ? options
      : [...options, { condition: "N/A", label: "N/A" }]
    : CONDITIONS.map((c) => ({ condition: c, label: c }));

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map(({ condition, label }) => {
        const active = value === condition;
        return (
          <button
            key={condition}
            type="button"
            onClick={() => onChange(condition)}
            className={`min-h-10 inline-flex items-center rounded-full border px-3.5 text-[12.5px] ${
              active ? "bg-brand border-brand text-white" : "bg-white border-border text-ink-soft"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
