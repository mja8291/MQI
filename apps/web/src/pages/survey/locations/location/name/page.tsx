
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";
import { FLOOR_LEVELS, LOCATION_NAME_OPTIONS, LOCATION_TYPES } from "@/lib/data/items";
import type { FloorLevel, LocationType } from "@/lib/types";

function isFloorLevel(v: string | null): v is FloorLevel {
  return v !== null && (FLOOR_LEVELS as string[]).includes(v);
}
function isLocationType(v: string | null): v is LocationType {
  return v !== null && (LOCATION_TYPES as string[]).includes(v);
}

function LocationNameContent() {
  const router = useRouter();
  const { locSetLocationType, locSetLocationName } = useSurvey();
  const params = useSearchParams();
  const floorParam = params.get("floor");
  const typeParam = params.get("type");
  const floor = isFloorLevel(floorParam) ? floorParam : null;
  const type = isLocationType(typeParam) ? typeParam : null;
  const [name, setName] = useState("");

  useEffect(() => {
    if (!floor || !type) router.replace("/survey/locations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, type]);

  if (!floor || !type) return null;

  const options = LOCATION_NAME_OPTIONS[type] ?? [];

  function start() {
    locSetLocationType(floor!, type!);
    locSetLocationName(name);
    router.push("/survey/locations/category");
  }

  return (
    <ScreenShell>
      <TopBar title={type} onBack={() => router.push(`/survey/locations/location?floor=${encodeURIComponent(floor)}`)} />
      <Field label="Location">
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select which one</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
      <BottomBar>
        <Button onClick={start} disabled={!name}>
          Continue
        </Button>
      </BottomBar>
    </ScreenShell>
  );
}

export default function LocationNamePage() {
  return (
    <Suspense fallback={null}>
      <LocationNameContent />
    </Suspense>
  );
}
