
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";
import { DEFAULT_LEVELS, FLOOR_LEVELS, NO_ROOF_MESSAGE, REQUIRED_LEVELS, applicableLevels } from "@mqi/shared";
import type { FloorLevel } from "@/lib/types";

/**
 * v2 (W24): which levels this campus has. External is always included; Ground, First and Roof are
 * ticked to start with. Opened after Survey details, and again from the Floor level page ("Change
 * levels"). A level that already has recorded locations cannot be unticked.
 */
export default function LevelsPage() {
  const router = useRouter();
  const { state, hydrated, setLevels } = useSurvey();
  const [levels, setLocal] = useState<FloorLevel[]>(() => applicableLevels(state.levels ?? DEFAULT_LEVELS));

  useEffect(() => {
    // See survey/locations/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school || !state.started) router.replace("/survey/find-school");
  }, [hydrated, state.school, state.started, router]);

  const used = new Set(state.scoring.locations.map((l) => l.floorLevel));
  if (state.scoring.current) used.add(state.scoring.current.floorLevel);

  function toggle(level: FloorLevel) {
    if (REQUIRED_LEVELS.includes(level) || used.has(level)) return;
    setLocal((list) => (list.includes(level) ? list.filter((l) => l !== level) : applicableLevels([...list, level])));
  }

  function next() {
    setLevels(applicableLevels(levels));
    router.push("/survey/locations");
  }

  if (!state.school) return null;

  return (
    <ScreenShell>
      <TopBar title="Applicable levels" subtitle={state.school.name} onBack={() => router.push(state.levels ? "/survey/locations" : "/survey/details")} />
      <p className="text-[12.5px] text-ink-soft leading-snug mb-3.5">
        Tick every level this campus has. Only these levels are offered on the Floor level page; you can change them later.
      </p>

      <div className="space-y-2">
        {FLOOR_LEVELS.map((level) => {
          const on = levels.includes(level);
          const locked = REQUIRED_LEVELS.includes(level) || used.has(level);
          return (
            <button
              key={level}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={locked}
              onClick={() => toggle(level)}
              className={`w-full min-h-12 rounded-xl border px-4 flex items-center gap-3 text-left ${
                on ? "border-brand bg-brand-tint/50" : "border-border bg-card"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                  on ? "bg-brand border-brand text-white" : "border-border bg-white"
                }`}
              >
                {on ? <Check size={14} /> : null}
              </span>
              <span className="flex-1 text-[14px] font-semibold text-ink">{level}</span>
              {REQUIRED_LEVELS.includes(level) ? (
                <span className="text-[11px] text-ink-faint">Always included</span>
              ) : used.has(level) ? (
                <span className="text-[11px] text-ink-faint">Has locations</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {!levels.includes("Roof") ? (
        <p role="status" className="mt-3 rounded-lg bg-band-poor-tint px-3 py-2 text-[12.5px] leading-snug text-band-poor">
          {NO_ROOF_MESSAGE}
        </p>
      ) : null}

      <BottomBar>
        <Button onClick={next}>Continue</Button>
      </BottomBar>
    </ScreenShell>
  );
}
