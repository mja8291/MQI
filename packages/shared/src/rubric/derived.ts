import type { Condition, DrillingCheck, LocationType, SiteChecks } from "../types";
import { OVERFLOW_ITEM, RUBRIC_GROUPS, SLAB_ASSESSMENT_ITEM } from "./items";

/**
 * v2 (W56): rubric items scored from answers the surveyor gives elsewhere, not picked at a location.
 *   - "Slab + Screeding/Waterproofing thickness assessment": the drilling card's assessment, the
 *     worst over every hole (Ok → Good, Unsafe → Very Poor); no drilling check → not scored.
 *   - "Proper Overflow Disposal System": the Review page's answer (Provided → Good, Not provided →
 *     Very Poor); unanswered → not scored.
 * Both belong to Roof locations, so every Roof location carries them (Safety takes the worst).
 */
export const DERIVED_ITEMS: readonly string[] = RUBRIC_GROUPS.filter((g) => g.derived).map((g) => g.name);

export function derivedScores(
  drilling: Pick<DrillingCheck, "done" | "slabAssessment" | "extraHoles">,
  site: Pick<SiteChecks, "overflowDisposal">
): Record<string, Condition> {
  const out: Record<string, Condition> = {};
  if (drilling.done === "YES") {
    const answers = [drilling.slabAssessment ?? "", ...(drilling.extraHoles ?? []).map((h) => h.slabAssessment)].filter(Boolean);
    if (answers.length) out[SLAB_ASSESSMENT_ITEM] = answers.includes("Unsafe") ? "Very Poor" : "Good";
  }
  if (site.overflowDisposal === "Provided") out[OVERFLOW_ITEM] = "Good";
  else if (site.overflowDisposal === "Not provided") out[OVERFLOW_ITEM] = "Very Poor";
  return out;
}

/** The locations with the derived items written onto every Roof location (and only there). */
export function withDerivedScores<L extends { type: LocationType; scores: Record<string, Condition> }>(
  locations: readonly L[],
  drilling: Pick<DrillingCheck, "done" | "slabAssessment" | "extraHoles">,
  site: Pick<SiteChecks, "overflowDisposal">
): L[] {
  const derived = derivedScores(drilling, site);
  return locations.map((loc) => {
    const scores = Object.fromEntries(Object.entries(loc.scores).filter(([name]) => !DERIVED_ITEMS.includes(name))) as Record<string, Condition>;
    return { ...loc, scores: loc.type === "Roof" ? { ...scores, ...derived } : scores };
  });
}
