
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle } from "lucide-react";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Gauge } from "@/components/ui/Gauge";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSurvey } from "@/lib/survey-context";
import { applicableLevels, isLocationComplete } from "@/lib/data/items";
import { scoreSurvey } from "@/lib/scoring";
import type { FloorLevel } from "@/lib/types";

/** v2 (W25): fewer locations than this asks for confirmation before Review and submit. */
const MIN_LOCATIONS = 15;

export default function FloorPage() {
  const router = useRouter();
  const { state, hydrated, locSetFloor, locResumeLocation, discardProgress } = useSurvey();
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmFew, setConfirmFew] = useState(false);

  useEffect(() => {
    // See survey/locations/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school || !state.started) router.replace("/survey/find-school");
  }, [hydrated, state.school, state.started, router]);

  if (!state.school) return null;

  const result = scoreSurvey(state.scoring.locations);
  const totalLocations = state.scoring.locations.length;
  const incompleteLocations = state.scoring.locations.filter((l) => !isLocationComplete(l));
  const canSubmit = totalLocations > 0 && incompleteLocations.length === 0;

  function confirmDiscardAndGoBack() {
    discardProgress();
    router.push("/survey/details");
  }

  function chooseFloor(floor: FloorLevel) {
    if (floor === "Roof") {
      const count = state.scoring.locations.filter((l) => l.type === "Roof").length;
      locSetFloor(floor, `Roof ${count + 1}`);
      router.push("/survey/locations/category");
    } else {
      router.push(`/survey/locations/location?floor=${encodeURIComponent(floor)}`);
    }
  }

  return (
    <ScreenShell>
      <TopBar title="Floor level" onBack={() => setConfirmBack(true)} />
      {/* v2 (W25): a full campus usually has 15+ locations; check before reviewing with fewer. */}
      <ConfirmDialog
        open={confirmFew}
        title="Have you covered every location?"
        message={`Only ${totalLocations} location${totalLocations === 1 ? "" : "s"} recorded. A campus normally needs at least ${MIN_LOCATIONS}. Make sure every required location has been scored.`}
        confirmLabel="Proceed anyway"
        cancelLabel="Remain on Floor level page"
        onConfirm={() => {
          setConfirmFew(false);
          router.push("/survey/review");
        }}
        onCancel={() => setConfirmFew(false)}
      />
      <ConfirmDialog
        open={confirmBack}
        title="Discard this assessment?"
        message="Going back will discard your progress and reset the timer. Continue?"
        onConfirm={confirmDiscardAndGoBack}
        onCancel={() => setConfirmBack(false)}
      />
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <p className="text-[12.5px] text-ink-soft leading-snug">Pick the floor of the location you&apos;re about to score.</p>
        {/* v2 (W24): change which levels this campus has. */}
        <button
          type="button"
          onClick={() => router.push("/survey/levels")}
          className="shrink-0 text-[12.5px] font-semibold text-brand-deep underline"
        >
          Change levels
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-5">
        {applicableLevels(state.levels).map((floor) => {
          // v2 (W16): each floor shows how many locations are recorded on it.
          const onFloor = state.scoring.locations.filter((l) => l.floorLevel === floor).length;
          return (
            <button
              key={floor}
              type="button"
              onClick={() => chooseFloor(floor)}
              className="rounded-2xl border border-border bg-card p-4 text-left min-h-14 flex items-center justify-between gap-2"
            >
              <span className="text-[14px] font-semibold text-ink">{floor}</span>
              {onFloor > 0 ? (
                <span
                  aria-label={`${onFloor} location${onFloor === 1 ? "" : "s"} recorded`}
                  className="min-w-6 h-6 px-1.5 rounded-full bg-brand text-white text-[12px] font-bold flex items-center justify-center"
                >
                  {onFloor}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {totalLocations > 0 ? (
        <div className="mb-2">
          <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2">
            Locations recorded ({totalLocations})
          </div>
          {state.scoring.locations.map((loc) => {
            const complete = isLocationComplete(loc);
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  locResumeLocation(loc.id);
                  router.push("/survey/locations/category");
                }}
                className="w-full flex items-center gap-2 py-2 border-b border-border text-[13px] text-left"
              >
                {complete ? (
                  <Check size={14} className="text-brand shrink-0" />
                ) : (
                  <AlertCircle size={14} className="text-band-average shrink-0" />
                )}
                <span className="text-ink-faint">{loc.floorLevel}</span>
                <span>·</span>
                <span className="flex-1 truncate">
                  {loc.type} — {loc.name}
                </span>
                {!complete ? <span className="text-band-average text-[11px] shrink-0">Incomplete</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <BottomBar>
        <div className="flex items-center gap-3.5 mb-2.5">
          <Gauge score={result.overall} />
          <div>
            <div className="text-xs text-ink-soft">Overall (live)</div>
            <div className="font-display text-xl font-semibold text-brand-deep">
              {result.overall === null ? "0%" : `${Math.round(result.overall)}%`}
            </div>
          </div>
        </div>
        <Button
          disabled={!canSubmit}
          onClick={() => (totalLocations < MIN_LOCATIONS ? setConfirmFew(true) : router.push("/survey/review"))}
        >
          Review and submit
        </Button>
        {totalLocations === 0 ? (
          <p className="text-center text-[11.5px] text-ink-faint mt-2.5">
            Record at least one location to continue.
          </p>
        ) : incompleteLocations.length > 0 ? (
          <p className="text-center text-[11.5px] text-band-average mt-2.5">
            {incompleteLocations.length === 1
              ? "1 location has an unscored category — open it and score every category to continue."
              : `${incompleteLocations.length} locations have unscored categories — open each and score every category to continue.`}
          </p>
        ) : null}
      </BottomBar>
    </ScreenShell>
  );
}
