
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LocationTypeCard } from "@/components/survey/LocationTypeCard";
import { useSurvey } from "@/lib/survey-context";
import { FLOOR_LEVELS, FLOOR_LOCATION_TYPES, LOCATION_NAME_OPTIONS, UNNAMED_LOCATION_TYPES } from "@/lib/data/items";
import type { Condition, FloorLevel, LocationType } from "@/lib/types";
import { getSiblingExternal } from "@/lib/sibling-external";

/** v2 (W26): leaving a floor with fewer locations than this asks for confirmation. */
const MIN_FLOOR_LOCATIONS = 2;

function isFloorLevel(v: string | null): v is FloorLevel {
  return v !== null && (FLOOR_LEVELS as string[]).includes(v);
}

function LocationContent() {
  const router = useRouter();
  const { state, locSetLocationType, locCurrentSetScore } = useSurvey();
  const floorParam = useSearchParams().get("floor");
  const floor = isFloorLevel(floorParam) ? floorParam : null;
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!floor) router.replace("/survey/locations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  if (!floor) return null;

  const types = FLOOR_LOCATION_TYPES[floor];
  const onFloor = state.scoring.locations.filter((l) => l.floorLevel === floor).length;

  function leave() {
    if (onFloor < MIN_FLOOR_LOCATIONS) setConfirmLeave(true);
    else router.push("/survey/locations");
  }

  async function pick(type: LocationType) {
    if (type === "Classroom") {
      router.push(`/survey/locations/location/classroom?floor=${encodeURIComponent(floor!)}`);
      return;
    }
    if (UNNAMED_LOCATION_TYPES.includes(type)) {
      const count = state.scoring.locations.filter((l) => l.type === type).length;
      locSetLocationType(floor!, type, `${type} ${count + 1}`);
      // v2 (W30): pre-fill External Development from a sibling campus in the same e-compound.
      if (type === "External Development" && state.school) {
        const sibling = await getSiblingExternal(state.school.schoolId);
        if (sibling) for (const [name, value] of Object.entries(sibling.scores)) locCurrentSetScore(name, value as Condition);
      }
      router.push("/survey/locations/category");
      return;
    }
    if (LOCATION_NAME_OPTIONS[type]) {
      router.push(`/survey/locations/location/name?floor=${encodeURIComponent(floor!)}&type=${encodeURIComponent(type)}`);
      return;
    }
    locSetLocationType(floor!, type);
    router.push("/survey/locations/category");
  }

  return (
    <ScreenShell>
      <TopBar title={`${floor} floor`} onBack={leave} />
      {/* v2 (W26): a floor normally has at least two locations; check before leaving it with fewer. */}
      <ConfirmDialog
        open={confirmLeave}
        title="Have you covered this floor?"
        message={`Only ${onFloor} location${onFloor === 1 ? "" : "s"} recorded on the ${floor} floor. Make sure every required location here has been scored.`}
        confirmLabel="Proceed anyway"
        cancelLabel="Remain on this floor"
        onConfirm={() => {
          setConfirmLeave(false);
          router.push("/survey/locations");
        }}
        onCancel={() => setConfirmLeave(false)}
      />
      <p className="text-[12.5px] text-ink-soft leading-snug mb-3.5">Tap the type of location you&apos;re scoring.</p>

      <div className="grid grid-cols-2 gap-2.5">
        {types.map((type) => (
          <LocationTypeCard
            key={type}
            type={type}
            count={state.scoring.locations.filter((l) => l.type === type).length}
            onOpen={() => pick(type)}
          />
        ))}
      </div>
    </ScreenShell>
  );
}

export default function LocationPage() {
  return (
    <Suspense fallback={null}>
      <LocationContent />
    </Suspense>
  );
}
