
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";
import {
  CLASSROOM_GRADES,
  CLASSROOM_GRADES_WITH_OPTIONAL_SECTION,
  CLASSROOM_SECTIONS,
  FLOOR_LEVELS,
} from "@/lib/data/method2-items";
import type { FloorLevel } from "@/lib/types";

function isFloorLevel(v: string | null): v is FloorLevel {
  return v !== null && (FLOOR_LEVELS as string[]).includes(v);
}

function Method2ClassroomContent() {
  const router = useRouter();
  const { m2SetClassroom } = useSurvey();
  const floorParam = useSearchParams().get("floor");
  const floor = isFloorLevel(floorParam) ? floorParam : null;
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  // Library/Art Room/Art Room-Library are single-instance rooms, not
  // sectioned classes — a campus doesn't have "Library, Section B" the way
  // it has "Class 4, Section B", so Continue shouldn't withhold on a Section
  // pick that has nothing meaningful to disambiguate for these.
  const sectionRequired = !CLASSROOM_GRADES_WITH_OPTIONAL_SECTION.includes(grade);

  useEffect(() => {
    if (!floor) router.replace("/survey/m2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  if (!floor) return null;

  function start() {
    m2SetClassroom(floor!, grade, section);
    router.push("/survey/m2/category");
  }

  return (
    <ScreenShell>
      <TopBar title="Classroom" onBack={() => router.push(`/survey/m2/location?floor=${encodeURIComponent(floor)}`)} />

      <Field label="Grade">
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select grade</option>
          {CLASSROOM_GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>

      <Field label={sectionRequired ? "Section" : "Section (optional)"}>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select section</option>
          {CLASSROOM_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <BottomBar>
        <Button onClick={start} disabled={!grade || (sectionRequired && !section)}>
          Continue
        </Button>
      </BottomBar>
    </ScreenShell>
  );
}

export default function Method2ClassroomPage() {
  return (
    <Suspense fallback={null}>
      <Method2ClassroomContent />
    </Suspense>
  );
}
