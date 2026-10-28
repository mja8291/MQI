
import { isUnsafe } from "@mqi/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { AccordionSection } from "@/components/ui/AccordionSection";
import { ItemRow } from "@/components/ui/ItemRow";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSurvey } from "@/lib/survey-context";
import { usePhotoUploadHandlers } from "@/lib/use-photo-upload-handlers";
import {
  RUBRIC_SECTIONS,
  rubricGroupsForLocationAndSection,
  sectionCountsForLocation,
} from "@/lib/data/items";
import type { Category } from "@/lib/types";

/**
 * The section picker and per-section item-group scoring page, merged
 * into one accordion (Round 3 Task 11) — the old score route is gone;
 * this is now the only screen for scoring a location. Sections (Safety /
 * Functionality / Aesthetics — the revised rubric has no Work Category
 * column) collapsed by default, one open at a time.
 *
 * Satisfies Task 13 together with this: locations/page.tsx's "Locations recorded"
 * list already links a finalized location back here via locResumeLocation
 * (unchanged) — that now lands on this single accordion with everything
 * pre-filled and editable, instead of a separate work-category picker, so
 * editing an earlier location's category is just tapping its header.
 */
export default function CategoryPage() {
  const router = useRouter();
  const {
    state,
    hydrated,
    locCurrentSetScore,
    locCurrentAddPhoto,
    locCurrentRemovePhoto,
    locCurrentSetNote,
    locFinalizeCurrent,
    locDiscardCurrent,
  } = useSurvey();
  const current = state.scoring.current;
  const { handleAddPhoto, handleRemovePhoto } = usePhotoUploadHandlers({
    surveyId: state.surveyId,
    region: state.school?.region ?? "",
    campusName: state.school?.name ?? "",
    floorLevel: current?.floorLevel,
    locationType: current?.type ?? undefined,
    locationName: current?.name,
    addPhoto: locCurrentAddPhoto,
    removePhoto: locCurrentRemovePhoto,
  });
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  // Deliberately depends only on `hydrated`, not `current` — goBack() below
  // clears `current` as part of navigating away, and depending on it here
  // would re-fire this exact check mid-navigation and race the explicit
  // router.push. It still needs to wait on `hydrated` (see
  // survey/locations/page.tsx's matching effect) so this doesn't
  // bounce away before a possible auto-resume — reached directly by resume,
  // not just via the floor picker — has loaded `current`.
  useEffect(() => {
    if (!hydrated) return;
    if (!current || !current.type) router.replace("/survey/locations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!current || !current.type) return null;
  const type = current.type;

  const counts = sectionCountsForLocation(type);
  const applicableCategories = RUBRIC_SECTIONS.filter((wc) => counts[wc] > 0);
  const categoryStatus = applicableCategories.map((wc) => {
    const items = rubricGroupsForLocationAndSection(type, wc);
    const answered = items.filter((i) => current!.scores[i.name]).length;
    // v2 (W13): an Unsafe item without a photo keeps its section incomplete.
    const unsafeMissing = items.filter((i) => isUnsafe(i, current!.scores[i.name]) && !(current!.photos[i.name]?.length)).length;
    return { wc, items, answered, total: items.length, unsafeMissing, complete: answered === items.length && unsafeMissing === 0 };
  });
  const incomplete = categoryStatus.filter((c) => !c.complete);
  const allComplete = incomplete.length === 0;

  function targetRoute() {
    const floorLevel = current!.floorLevel;
    return floorLevel === "Roof" ? "/survey/locations" : `/survey/locations/location?floor=${encodeURIComponent(floorLevel)}`;
  }

  // Leaving with everything scored just finalizes and goes — nothing to
  // confirm. Leaving with unscored items used to silently finalize the
  // location anyway (as "Incomplete" — the floor picker's "Locations
  // recorded" list can still show that badge for a location saved before
  // this changed, or restored from an older draft) with zero warning at
  // the moment of tapping back — easy to walk away believing this location
  // was actually finished. Ask instead of guessing which one they meant;
  // the only way to leave an incomplete location now is the explicit
  // discard below, not a silent partial save.
  function goBack() {
    if (allComplete) {
      locFinalizeCurrent();
      router.push(targetRoute());
      return;
    }
    if (Object.keys(current!.scores).length === 0) {
      // Nothing's been entered on this location at all yet (just landed
      // here, or backed out of every category without picking a
      // condition) — nothing to warn about discarding, so don't.
      locDiscardCurrent();
      router.push(targetRoute());
      return;
    }
    setConfirmBack(true);
  }

  function confirmDiscardAndGoBack() {
    locDiscardCurrent();
    router.push(targetRoute());
  }

  function saveSelectionAndReturn() {
    if (allComplete) {
      locFinalizeCurrent();
      router.push(targetRoute());
      return;
    }
    // Incomplete: stay put, mark every unscored item pending, and jump to
    // the first work category that still has one, same reasoning as
    // The old equivalent — a pending marker inside a collapsed section
    // is invisible otherwise.
    setAttemptedSave(true);
    const firstIncomplete = categoryStatus.find((c) => !c.complete);
    if (firstIncomplete) setOpenCategory(firstIncomplete.wc);
  }

  return (
    <ScreenShell>
      <TopBar title="Score location" onBack={goBack} />
      <ConfirmDialog
        open={confirmBack}
        title="You haven't scored all items"
        message={
          incomplete.length === 1
            ? `"${incomplete[0]!.wc}" still has unscored items in this location. Go back and discard everything scored here, or stay and finish the rest?`
            : `${incomplete.length} categories still have unscored items in this location. Go back and discard everything scored here, or stay and finish the rest?`
        }
        confirmLabel="Discard and go back"
        cancelLabel="Complete remaining items"
        onConfirm={confirmDiscardAndGoBack}
        onCancel={() => setConfirmBack(false)}
      />
      <div className="bg-brand-tint text-brand-deep text-[13px] font-semibold rounded-xl px-3.5 py-2.5 mb-4">
        {current.floorLevel} — {type} — {current.name}
      </div>

      {categoryStatus.map(({ wc, items, answered, total }) => (
        <AccordionSection
          key={wc}
          title={wc}
          answered={answered}
          total={total}
          open={openCategory === wc}
          onToggle={() => setOpenCategory((prev) => (prev === wc ? null : wc))}
          pending={attemptedSave && !categoryStatus.find((c) => c.wc === wc)!.complete}
        >
          {items.map((item) => (
            <ItemRow
              key={item.name}
              item={item}
              worstCase={item.aggregation === "worst"}
              value={current!.scores[item.name]}
              photos={current!.photos[item.name] ?? []}
              note={current!.notes[item.name]}
              onScoreChange={(v) => locCurrentSetScore(item.name, v)}
              onAddPhoto={(f) => handleAddPhoto(item.name, f)}
              onRemovePhoto={(id) => handleRemovePhoto(item.name, id)}
              onNoteChange={(v) => locCurrentSetNote(item.name, v)}
              pending={attemptedSave && (!current!.scores[item.name] || (isUnsafe(item, current!.scores[item.name]) && !(current!.photos[item.name]?.length)))}
            />
          ))}
        </AccordionSection>
      ))}

      <BottomBar>
        <Button variant={allComplete ? "primary" : "muted"} onClick={saveSelectionAndReturn}>
          Save Selection and Return
        </Button>
        {attemptedSave && !allComplete ? (
          <p className="text-center text-[11.5px] text-band-poor mt-2.5">
            {incomplete.some((c) => c.unsafeMissing > 0) && incomplete.every((c) => c.answered === c.total)
              ? "Attach a photo to every item marked Unsafe."
              : incomplete.length === 1
                ? `"${incomplete[0]!.wc}" still has unscored items or an Unsafe item without a photo.`
                : `${incomplete.length} categories still have unscored items or an Unsafe item without a photo.`}
          </p>
        ) : (
          <p className="text-center text-[11.5px] text-ink-faint mt-2.5">Score every category to continue.</p>
        )}
      </BottomBar>
    </ScreenShell>
  );
}
