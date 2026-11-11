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

/** v2 (W56): "Proper Overflow Disposal System" — YES = Good (100%), NO = Very Poor (25%), like OK/Unsafe. */
export const YES_NO: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "YES" },
  { condition: "Very Poor", label: "NO" },
];

/**
 * W68 (2026-11-11): Access to roof area /tanks at the Roof location takes the Review page's
 * options. Owner's scores: Proper staircase 100%, Ladder 50%, None 0% (stored as Good / Poor /
 * Very Poor; `score` overrides Very Poor's usual 25%). N/A stays available.
 */
export const ROOF_ACCESS_TYPES: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "Proper staircase" },
  { condition: "Poor", label: "Ladder" },
  { condition: "Very Poor", label: "None", score: 0 },
];

export const ROOF_ACCESS: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "Roof Access Available" },
  { condition: "Very Poor", label: "Roof Access Not Available" },
];
