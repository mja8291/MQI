
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { LocationTypeCard } from "@/components/survey/LocationTypeCard";
import { useSurvey } from "@/lib/survey-context";
import { FLOOR_LEVELS, FLOOR_LOCATION_TYPES, LOCATION_NAME_OPTIONS, UNNAMED_LOCATION_TYPES } from "@/lib/data/method2-items";
import type { FloorLevel, LocationType } from "@/lib/types";

function isFloorLevel(v: string | null): v is FloorLevel {
  return v !== null && (FLOOR_LEVELS as string[]).includes(v);
}

function Method2LocationContent() {
  const router = useRouter();
  const { state, m2SetLocationType } = useSurvey();
  const floorParam = useSearchParams().get("floor");
  const floor = isFloorLevel(floorParam) ? floorParam : null;

  useEffect(() => {
    if (!floor) router.replace("/survey/m2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  if (!floor) return null;

  const types = FLOOR_LOCATION_TYPES[floor];

  function pick(type: LocationType) {
    if (type === "Classroom") {
      router.push(`/survey/m2/location/classroom?floor=${encodeURIComponent(floor!)}`);
      return;
    }
    if (UNNAMED_LOCATION_TYPES.includes(type)) {
      const count = state.m2.locations.filter((l) => l.type === type).length;
      m2SetLocationType(floor!, type, `${type} ${count + 1}`);
      router.push("/survey/m2/category");
      return;
    }
    if (LOCATION_NAME_OPTIONS[type]) {
      router.push(`/survey/m2/location/name?floor=${encodeURIComponent(floor!)}&type=${encodeURIComponent(type)}`);
      return;
    }
    m2SetLocationType(floor!, type);
    router.push("/survey/m2/category");
  }

  return (
    <ScreenShell>
      <TopBar title={`${floor} floor`} onBack={() => router.push("/survey/m2")} />
      <p className="text-[12.5px] text-ink-soft leading-snug mb-3.5">Tap the type of location you&apos;re scoring.</p>

      <div className="grid grid-cols-2 gap-2.5">
        {types.map((type) => (
          <LocationTypeCard
            key={type}
            type={type}
            count={state.m2.locations.filter((l) => l.type === type).length}
            onOpen={() => pick(type)}
          />
        ))}
      </div>
    </ScreenShell>
  );
}

export default function Method2LocationPage() {
  return (
    <Suspense fallback={null}>
      <Method2LocationContent />
    </Suspense>
  );
}
