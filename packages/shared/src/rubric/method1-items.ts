import type { RubricItem } from "../types";
import { OK_UNSAFE, ROOF_ACCESS } from "./condition-overrides";

/**
 * Method 1 — 46 items, flat, one score per campus. Re-synced 2026-10-27
 * against the "MQI Assessment Rubrics (Method A)" tab of the revised rubric
 * workbook (names, order and "Category Weightage" column read directly from
 * it; Functionality 22 / Safety 15 / Aesthetics 9, each summing to 100).
 * Changes from the previous 45-item version (frozen in
 * method1-legacy-items.ts):
 *   - New Safety item "Concrete/Plaster Soundness" (7%).
 *   - Safety reweighted: Main Gate 7 -> 5, Cracks visibility in roof
 *     14 -> 12, Internal Flooring condition 10 -> 7.
 *   - Renamed: "Grill gate of lab *" -> "Grill gate *", "Windows & panes *"
 *     -> "Windows/Ventilator & panes *", "Solar/UPS Batteries" ->
 *     "Solar/Inverter Batteries".
 *   - Two-button "OK / Unsafe" pickers on six safety items, and Roof Access
 *     moved onto the same scale — see condition-overrides.ts.
 * The sheet's Location / Item Category columns describe Method 2's shape and
 * don't apply to a whole-campus score.
 */
export const METHOD1_ITEMS: RubricItem[] = [
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
  { name: "Windows/Ventilator & panes *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "Cabinet *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "Soft board *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "Drinking Water Cooler & Filter *", category: "Functionality", weight: 2, principalMaintained: true },
  { name: "LED/TV *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "UPS *", category: "Functionality", weight: 3, principalMaintained: true },
  { name: "Solar/Inverter Batteries", category: "Functionality", weight: 3 },
  { name: "Solar Panels", category: "Functionality", weight: 2 },

  // Safety — 25% of overall, 15 items
  { name: "Boundary wall", category: "Safety", weight: 7 },
  { name: "Grill gate *", category: "Safety", weight: 5, principalMaintained: true },
  { name: "Doors *", category: "Safety", weight: 7, principalMaintained: true },
  { name: "Main Gate", category: "Safety", weight: 5 },
  {
    name: "Access to roof area /tanks",
    category: "Safety",
    weight: 4,
    conditionOverride: ROOF_ACCESS,
    // Either there's roof access or there isn't — "not applicable" has no
    // meaning here, unlike an item that might genuinely be absent at a
    // given location.
    hideNA: true,
  },
  { name: "Cracks visibility in roof", category: "Safety", weight: 12, conditionOverride: OK_UNSAFE },
  { name: "Cracks visibility in columns", category: "Safety", weight: 7, conditionOverride: OK_UNSAFE },
  { name: "Cracks visibility in walls", category: "Safety", weight: 7 },
  { name: "Concrete/Plaster Soundness", category: "Safety", weight: 7, conditionOverride: OK_UNSAFE },
  { name: "Parapet Wall", category: "Safety", weight: 5 },
  { name: "Internal Flooring condition", category: "Safety", weight: 7 },
  { name: "Roof leakage/seepage", category: "Safety", weight: 7, conditionOverride: OK_UNSAFE },
  { name: "Roof Screeding/roof drainage", category: "Safety", weight: 7, conditionOverride: OK_UNSAFE },
  { name: "Visibility of dampness", category: "Safety", weight: 7, conditionOverride: OK_UNSAFE },
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
