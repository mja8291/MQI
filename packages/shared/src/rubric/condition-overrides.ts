import type { RubricItem } from "../types";

/**
 * The two-button pickers used by several safety items in the rubric sheet
 * ("<- OK" / "Unsafe ->", "<- Roof Access Available" / "Roof Access Not
 * Available ->"). The arrows point at the sheet's Good and Very Poor
 * checkboxes, so the buttons map onto those two scores (100% / 25%) —
 * confirmed with the rubric owner 2026-10-27. Shared by every rubric
 * version so none can drift apart on what "Unsafe" is worth.
 */
export const OK_UNSAFE: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "OK" },
  { condition: "Very Poor", label: "Unsafe" },
];

/** v2 (W12): shown under every soundness item. */
export const SOUNDNESS_GUIDANCE =
  "Tap with a hammer and listen for a hollow sound (to detect delamination effect). Mark Unsafe if a hollow sound is heard.";

/** v2 (W37): shown under Wall/Column Condition. */
export const WALL_COLUMN_GUIDANCE =
  "Consider minor surface cracks (one sided, crazing, shrinkage, hairline cracks) in plaster item rating.";

export const ROOF_ACCESS: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "Roof Access Available" },
  { condition: "Very Poor", label: "Roof Access Not Available" },
];
