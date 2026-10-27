import type { RubricItem } from "../types";

/**
 * The two-button pickers used by several safety items in the rubric sheet
 * ("<- OK" / "Unsafe ->", "<- Roof Access Available" / "Roof Access Not
 * Available ->"). The arrows point at the sheet's Good and Very Poor
 * checkboxes, so the buttons map onto those two scores (100% / 25%) —
 * confirmed with the rubric owner 2026-10-27. Shared by Method 1 and
 * Method 2 so the two methods can't drift apart on what "Unsafe" is worth.
 */
export const OK_UNSAFE: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "OK" },
  { condition: "Very Poor", label: "Unsafe" },
];

export const ROOF_ACCESS: NonNullable<RubricItem["conditionOverride"]> = [
  { condition: "Good", label: "Roof Access Available" },
  { condition: "Very Poor", label: "Roof Access Not Available" },
];
