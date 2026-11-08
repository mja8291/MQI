
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";
import { uniqueLocationName } from "@mqi/shared";
import type { Condition, SharedLocation } from "@mqi/shared";
import { getSiblingShared } from "@/lib/sibling-external";
import { FLOOR_LEVELS, LOCATION_CARDS, LOCATION_NAME_OPTIONS, LOCATION_TYPES } from "@/lib/data/items";
import type { FloorLevel, LocationType } from "@/lib/types";

function isFloorLevel(v: string | null): v is FloorLevel {
  return v !== null && (FLOOR_LEVELS as string[]).includes(v);
}
function isLocationType(v: string | null): v is LocationType {
  return v !== null && (LOCATION_TYPES as string[]).includes(v);
}

function LocationNameContent() {
  const router = useRouter();
  const { state, locSetLocationType, locSetLocationName, locCurrentSetScore } = useSurvey();
  const params = useSearchParams();
  const floorParam = params.get("floor");
  const typeParam = params.get("type");
  const floor = isFloorLevel(floorParam) ? floorParam : null;
  const type = isLocationType(typeParam) ? typeParam : null;
  // W56: a card standing for several types; the name picked decides the type.
  const card = LOCATION_CARDS.find((c) => c.label === params.get("card")) ?? null;
  const [name, setName] = useState("");
  // W60: Guardroom / Canteen / UGWT recorded for a sibling campus of the e-compound pre-fill (first one of a name only).
  const firstOfName = Boolean(name) && uniqueLocationName(name, state.scoring.locations.map((l) => l.name)) === name;
  const sharedType = card && name ? card.names[name] : undefined;
  const [sibling, setSibling] = useState<SharedLocation | null>(null);
  const schoolId = state.school?.schoolId;
  useEffect(() => {
    let alive = true;
    if (!schoolId || !sharedType || !firstOfName) {
      setSibling(null);
      return;
    }
    void getSiblingShared(schoolId, sharedType, name).then((found) => alive && setSibling(found));
    return () => {
      alive = false;
    };
  }, [schoolId, sharedType, name, firstOfName]);

  useEffect(() => {
    if (!floor || (!type && !card)) router.replace("/survey/locations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, type, card]);

  if (!floor || (!type && !card)) return null;

  const options = card ? Object.keys(card.names) : (LOCATION_NAME_OPTIONS[type!] ?? []);

  function start() {
    locSetLocationType(floor!, card ? card.names[name]! : type!);
    locSetLocationName(name);
    if (sibling) for (const [item, value] of Object.entries(sibling.scores)) locCurrentSetScore(item, value as Condition);
    router.push("/survey/locations/category");
  }

  return (
    <ScreenShell>
      <TopBar title={card ? card.label : type!} onBack={() => router.push(`/survey/locations/location?floor=${encodeURIComponent(floor)}`)} />
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
      {/* W52: a second location of the same kind is numbered, so each keeps its own rows and photos. */}
      {name && uniqueLocationName(name, state.scoring.locations.map((l) => l.name)) !== name ? (
        <p className="text-[12px] leading-snug text-ink-soft -mt-2">
          "{name}" is already in this survey, so this one will be saved as "{uniqueLocationName(name, state.scoring.locations.map((l) => l.name))}".
        </p>
      ) : null}
      {sibling ? (
        <p role="status" className="mt-2 rounded-lg bg-brand-tint px-3 py-2 text-[12.5px] leading-snug text-brand-deep">
          Pre-filled from {sibling.campusName}
          {sibling.date ? ` (${new Date(sibling.date).toLocaleDateString()})` : ""}, a campus of the same e-compound. Check every item and change what differs.
          {sibling.unsafeThere.length ? ` Marked Unsafe there, left for you to check and photograph: ${sibling.unsafeThere.join(", ")}.` : ""}
        </p>
      ) : null}
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
