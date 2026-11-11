import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useSurveyStateOptional } from "@/lib/survey-context";
import { freeSpaceMb, photoCountAdvice, spaceAdvice, type Advice } from "@/lib/photo-limits";
import type { PhotoAsset } from "@/lib/types";

/**
 * W67: during a survey, a banner when the phone's free space runs short or the survey carries a
 * lot of photos (lib/photo-limits.ts). Free space is re-checked whenever a photo is added or
 * removed. A notice can be closed; it comes back only when it gets more serious.
 */
export function PhotoLoadNotice() {
  const state = useSurveyStateOptional();
  const { count, bytes } = useMemo(() => {
    if (!state) return { count: 0, bytes: 0 };
    const lists: PhotoAsset[][] = [
      ...state.scoring.locations.flatMap((l) => Object.values(l.photos ?? {})),
      ...Object.values(state.reviewPhotos ?? {}),
    ];
    let c = 0;
    let b = 0;
    for (const list of lists)
      for (const p of list ?? []) {
        c++;
        b += p.size ?? 0;
      }
    return { count: c, bytes: b };
  }, [state]);
  const [freeMb, setFreeMb] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void freeSpaceMb().then((mb) => alive && setFreeMb(mb));
    return () => {
      alive = false;
    };
  }, [count]);
  const [closed, setClosed] = useState<string[]>([]);
  if (!state?.startTime) return null;
  const items = [spaceAdvice(freeMb), photoCountAdvice(count, bytes)].filter((a): a is Advice => a !== null);
  // A closed notice stays closed for its level; a "warn" after a closed "notice" shows again.
  const shown = items.filter((a) => !closed.includes(key(a)));
  if (!shown.length) return null;
  return (
    <div className="sticky top-0 z-30 w-full max-w-md mx-auto px-3 pt-1 space-y-1">
      {shown.map((a) => (
        <div
          key={key(a)}
          role="alert"
          data-testid="photo-load-notice"
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] leading-snug ${
            a.level === "warn" ? "bg-[#FEF2F2] border-[#DC2626] text-[#991B1B]" : "bg-[#FFFBEB] border-[#F59E0B] text-[#92400E]"
          }`}
        >
          <span className="flex-1">{a.text}</span>
          <button type="button" aria-label="Close notice" onClick={() => setClosed((c) => [...c, key(a)])} className="-m-1 p-1 shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const key = (a: Advice) => `${a.text.startsWith("Phone storage") ? "space" : "photos"}-${a.level}`;
