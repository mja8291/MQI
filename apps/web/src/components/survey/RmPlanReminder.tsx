import { ClipboardList } from "lucide-react";
import { RM_PLAN_REMINDER } from "@mqi/shared";

/** v2 (W64): shown for a campus in the R&M Plan 2026-27 — its BOQ is a separate activity to prepare. */
export function RmPlanReminder({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`flex gap-2 rounded-lg border border-band-average bg-band-average-tint px-3 py-2 my-1.5 ${className}`}>
      <ClipboardList size={16} className="text-band-average shrink-0 mt-0.5" />
      <div className="text-[12.5px] leading-snug text-ink">
        <span className="font-semibold">R&amp;M Plan 2026-27: prepare the BOQ.</span> {RM_PLAN_REMINDER}
      </div>
    </div>
  );
}
