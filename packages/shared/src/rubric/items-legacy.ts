import type { RubricItem } from "../types";

/**
 * FROZEN snapshot of the item list as it stood before the 2026-10-27
 * rubric change (the survey moved from 45 individual items in 6 work categories
 * to 30 item groups — see items.ts). Never edited again. Surveys
 * submitted before that change carry no "Rubric Version" value and were
 * scored against exactly these items/weights, so the Excel/PDF export of an
 * old survey has to read them back the same way (see find-survey.ts) or its
 * recalculated score would silently stop matching the one that was submitted.
 * Only the fields exports need are used; locations/workCategory are kept
 * verbatim from the original data for fidelity.
 */
type LegacyGroup = RubricItem & {
  aggregation: "worst" | "average";
  workCategory: string;
  locations: string[];
};

function worst(item: Omit<LegacyGroup, "aggregation" | "category"> & { category: "Safety" }): LegacyGroup {
  return { ...item, aggregation: "worst" };
}
function average(
  item: Omit<LegacyGroup, "aggregation" | "category"> & { category: "Functionality" | "Aesthetics" }
): LegacyGroup {
  return { ...item, aggregation: "average" };
}

const CLASSROOM = "Classroom";
const CORRIDOR = "Corridor & Stairs";
const TOILET = "Toilet";
const FACADE = "Exterior Facade";
const EXT_DEV = "External Development";
const ROOF = "Roof";
const OTHER_ROOM = "Other Room (Staff, Principal, Admin, Store etc.)";
const LAB = "Lab (Wet/Dry/DLP)";

export const LEGACY_RUBRIC_GROUPS: LegacyGroup[] = [
  // Plumbing Works — 8 items, all Functionality
  average({
    name: "Water Storage (Overhead Tank) *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [ROOF],
  }),
  average({
    name: "Water Supply line *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [TOILET, EXT_DEV, ROOF, LAB],
  }),
  average({
    name: "Water Taps *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [TOILET, LAB],
  }),
  average({
    name: "Wash Basin *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [TOILET, LAB],
  }),
  average({
    name: "Flush Tanks *",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [TOILET],
  }),
  average({
    name: "W.Cs/Commodes",
    category: "Functionality",
    weight: 7,
    workCategory: "Plumbing Works",
    locations: [TOILET],
  }),
  average({
    name: "Sewerage Line functionality *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [TOILET, EXT_DEV, LAB],
  }),
  average({
    name: "Motor (Water pump) *",
    category: "Functionality",
    weight: 4,
    principalMaintained: true,
    workCategory: "Plumbing Works",
    locations: [EXT_DEV],
  }),

  // Electrical Works — 11 items, Functionality except Electrical Wiring/Connections (Safety)
  average({
    name: "Energy & Power (Distribution Board) *",
    category: "Functionality",
    weight: 4,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CORRIDOR, LAB],
  }),
  average({
    name: "Fans *",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "Light Switch Buttons *",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, LAB],
  }),
  average({
    name: "Bulbs *",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, LAB],
  }),
  average({
    name: "Fan Dimmers *",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "LED/TV *",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [LAB],
  }),
  average({
    name: "UPS *",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [LAB],
  }),
  average({
    name: "Solar/UPS Batteries",
    category: "Functionality",
    weight: 3,
    workCategory: "Electrical Works",
    locations: [CORRIDOR],
  }),
  average({
    name: "Solar Panels",
    category: "Functionality",
    weight: 2,
    workCategory: "Electrical Works",
    locations: [ROOF],
  }),
  average({
    name: "Drinking Water Cooler & Filter *",
    category: "Functionality",
    weight: 2,
    principalMaintained: true,
    workCategory: "Electrical Works",
    locations: [CORRIDOR],
  }),
  worst({
    name: "Electrical Wiring/Connections",
    category: "Safety",
    weight: 6,
    workCategory: "Electrical Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),

  // Carpentry Works — 5 items
  average({
    name: "Windows/Ventilator & panes *",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    workCategory: "Carpentry Works",
    locations: [CLASSROOM, TOILET, OTHER_ROOM, LAB],
  }),
  average({
    name: "Cabinet *",
    category: "Functionality",
    weight: 2,
    principalMaintained: true,
    workCategory: "Carpentry Works",
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "Soft board *",
    category: "Functionality",
    weight: 2,
    principalMaintained: true,
    workCategory: "Carpentry Works",
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Doors *",
    category: "Safety",
    weight: 7,
    principalMaintained: true,
    workCategory: "Carpentry Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "Furniture condition *",
    category: "Aesthetics",
    weight: 10,
    principalMaintained: true,
    workCategory: "Carpentry Works",
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),

  // Paint Works — 3 items
  average({
    name: "Green board *",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    workCategory: "Paint Works",
    locations: [CLASSROOM, LAB],
  }),
  average({
    name: "Internal Paint",
    category: "Aesthetics",
    weight: 15,
    workCategory: "Paint Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "External Fascade (Exterior Finish)",
    category: "Aesthetics",
    weight: 12,
    workCategory: "Paint Works",
    locations: [FACADE],
  }),

  // External Development Works — 2 items
  worst({
    name: "Boundary wall",
    category: "Safety",
    weight: 7,
    workCategory: "External Development Works",
    locations: [EXT_DEV],
  }),
  worst({
    name: "Main Gate",
    category: "Safety",
    weight: 7,
    workCategory: "External Development Works",
    locations: [EXT_DEV],
  }),

  // Building Civil Works — 16 items
  worst({
    name: "Grill gate *",
    category: "Safety",
    weight: 5,
    principalMaintained: true,
    workCategory: "Building Civil Works",
    locations: [CORRIDOR, LAB, ROOF],
  }),
  worst({
    name: "Access to roof area /tanks",
    category: "Safety",
    weight: 4,
    workCategory: "Building Civil Works",
    locations: [ROOF],
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
  }),
  worst({
    name: "Cracks visibility in roof",
    category: "Safety",
    weight: 14,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Cracks visibility in columns",
    category: "Safety",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, ROOF, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Cracks visibility in walls",
    category: "Safety",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Parapet Wall",
    category: "Safety",
    weight: 5,
    workCategory: "Building Civil Works",
    locations: [ROOF],
  }),
  worst({
    name: "Internal Flooring condition",
    category: "Safety",
    weight: 10,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, CORRIDOR, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Roof leakage/seepage",
    category: "Safety",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  worst({
    name: "Roof Screeding/roof drainage",
    category: "Safety",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [ROOF],
  }),
  worst({
    name: "Visibility of dampness",
    category: "Safety",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "Toilet Tile condition",
    category: "Aesthetics",
    weight: 12,
    workCategory: "Building Civil Works",
    locations: [TOILET],
  }),
  average({
    name: "Signage *",
    category: "Aesthetics",
    weight: 10,
    principalMaintained: true,
    workCategory: "Building Civil Works",
    locations: [FACADE],
  }),
  average({
    name: "Marble Plaque *",
    category: "Aesthetics",
    weight: 10,
    principalMaintained: true,
    workCategory: "Building Civil Works",
    locations: [CORRIDOR],
  }),
  average({
    name: "Plaster",
    category: "Aesthetics",
    weight: 12,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, OTHER_ROOM, LAB],
  }),
  average({
    name: "Masonry",
    category: "Aesthetics",
    weight: 12,
    workCategory: "Building Civil Works",
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, OTHER_ROOM, LAB],
  }),
  average({
    name: "CC Jaali",
    category: "Aesthetics",
    weight: 7,
    workCategory: "Building Civil Works",
    locations: [CORRIDOR, FACADE],
  }),
];
