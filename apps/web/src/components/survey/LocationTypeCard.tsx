import { LOCATION_ICONS } from "@/lib/data/location-icons";
import type { LocationType } from "@/lib/types";

interface LocationTypeCardProps {
  type: LocationType;
  count: number;
  onOpen: () => void;
}

export function LocationTypeCard({ type, count, onOpen }: LocationTypeCardProps) {
  const Icon = LOCATION_ICONS[type];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-2xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <div className="h-8 w-8 rounded-lg bg-brand-tint text-brand flex items-center justify-center">
          <Icon size={16} />
        </div>
        <div
          className={`h-7 w-7 rounded-full border-2 flex items-center justify-center font-display text-xs font-semibold ${
            count > 0 ? "bg-brand border-brand text-white" : "border-brand text-brand-deep"
          }`}
        >
          {count}
        </div>
      </div>
      <div className="text-[12.5px] font-semibold text-ink mt-2 leading-tight">{type}</div>
    </button>
  );
}
