import type { RubricItem } from "../types";

/**
 * FROZEN snapshot of Method 1's item list as it stood before the 2026-10-27
 * rubric change (see method1-items.ts). Never edited again — surveys
 * submitted before that change carry no "Rubric Version" value and were
 * scored against exactly these items/weights, so exporting one has to read
 * them back the same way (see find-survey.ts) or the export's recalculated
 * score would stop matching the one that was submitted.
 *
 * Original header, for reference:
 *
 * Method 1 — 45 items, flat, one score per campus. Re-synced 2026-08-22
 * (Round 3 Task 10) against the live "MQI Assessment Rubrics (Method 1)"
 * sheet — every count/name/weight below is a direct fetch, not carried over
 * from any earlier round of this brief (which had gone stale). Changes from
 * the previous 44-item version:
 *   - New 22nd Functionality item "Drinking Water Cooler & Filter *" (2%),
 *     funded by Cabinet and Soft board each dropping 3% -> 2%.
 *   - "W.Cs/Commodes *" lost its asterisk (no longer principal-maintained) —
 *     matches what method2-items.ts already had; Method 1's copy was stale.
 *   - "Toilet Flooring condition" renamed to "Toilet Tile condition".
 * Safety is unchanged (still 14 items, same weights as the 2026-08-12 audit).
 */
export const LEGACY_METHOD1_ITEMS: RubricItem[] = [
  // Functionality — 45% of overall, 22 items
  { name: "Green board *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Water Storage (Overhead Tank) *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Water Supply line *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Water Taps *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Wash Basin *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Flush Tanks *", category: "Functionality", weight: 5, principalMaintained: true },
  { name: "W.Cs/Commodes", category: "Functionality", weight: 7 },
  { name: "Sewerage Line functionality *", category: "Functionality", weight: 7, principalMaintained: true },
  { name: "Energy & Power (Distribution Board) *", category: "Functionality", weight: 4, principalMaintained: true },
  { name: "Fans *", category: "Functionality", weight: 5, principalMaintained: true },
  { name: "Light Switch Buttons *", category: "Functionality", weight: 5, principalMaintained: true },
  { name: "Bulbs *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "Fan Dimmers *", category: "Functionality", weight: 5, principalMaintained: true },
  { name: "Motor (Water pump) *", category: "Functionality", weight: 4, principalMaintained: true },
  { name: "Windows & panes *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "Cabinet *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "Soft board *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "Drinking Water Cooler & Filter *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "LED/TV *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "UPS *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "Solar/UPS Batteries", category: "Functionality", weight: 3 },
  { name: "Solar Panels", category: "Functionality", weight: 2 },

  // Safety — 25% of overall, 14 items (updated 2026-08-12 to match the live
  // "MQI Assessment Rubrics (Method 1)" sheet, which had been rebalanced —
  // adding "Parapet Wall" and reweighting 4 other items — without the app's
  // copy catching up; weights below now match Method 2's Safety set exactly,
  // since the sheet shows both methods sharing one Safety rubric).
  { name: "Boundary wall", category: "Safety", weight: 7 },
  { name: "Grill gate of lab *", category: "Safety", weight: 5, principalMaintained: true },
  { name: "Doors *", category: "Safety", weight: 7, principalMaintained: true },
  { name: "Main Gate", category: "Safety", weight: 7 },
  {
    name: "Access to roof area /tanks",
    category: "Safety",
    weight: 4,
    // Rubric sheet only labels 2 of the 5 checkbox slots for this item
    // (verified 2026-08-14 after the sheet's stray-text mixup on the
    // adjacent Parapet Wall row was fixed) — same Ok/Poor scores as
    // everywhere else, just item-specific button text.
    conditionOverride: [
      { condition: "Ok", label: "Roof Access Available" },
      { condition: "Poor", label: "Roof Access Not Available" },
    ],
    // Either there's roof access or there isn't — "not applicable" has no
    // meaning here, unlike an item that might genuinely be absent at a
    // given location.
    hideNA: true,
  },
  { name: "Cracks visibility in roof", category: "Safety", weight: 14 },
  { name: "Cracks visibility in columns", category: "Safety", weight: 7 },
  { name: "Cracks visibility in walls", category: "Safety", weight: 7 },
  { name: "Parapet Wall", category: "Safety", weight: 5 },
  { name: "Internal Flooring condition", category: "Safety", weight: 10 },
  { name: "Roof leakage/seepage", category: "Safety", weight: 7 },
  { name: "Roof Screeding/roof drainage", category: "Safety", weight: 7 },
  { name: "Visibility of dampness", category: "Safety", weight: 7 },
  { name: "Electrical Wiring/Connections", category: "Safety", weight: 6 },

  // Aesthetics — 30% of overall, 9 items
  { name: "Internal Paint", category: "Aesthetics", weight: 15 },
  { name: "External Fascade (Exterior Finish)", category: "Aesthetics", weight: 12 },
  { name: "Toilet Tile condition", category: "Aesthetics", weight: 12 },
  { name: "Furniture condition *", category: "Aesthetics", weight: 10, principalMaintained: true },
  { name: "Signage *", category: "Aesthetics", weight: 10, principalMaintained: true },
  { name: "Marble Plaque *", category: "Aesthetics", weight: 10, principalMaintained: true },
  { name: "Plaster", category: "Aesthetics", weight: 12 },
  { name: "Masonry", category: "Aesthetics", weight: 12 },
  { name: "CC Jaali", category: "Aesthetics", weight: 7 },
];
