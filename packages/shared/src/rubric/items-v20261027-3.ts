import type { LocationType, RubricGroup } from "../types";
import { OK_UNSAFE, ROOF_ACCESS } from "./condition-overrides";

/**
 * FROZEN snapshot of the item groups as released under rubric version
 * "2026-10-27.3" (33 groups: before Window Shades was added, Taps/Wash Basin
 * and Electrical Fixtures/Switch-Dimmer were merged, W.Cs/Commodes and Plaque
 * were dropped, Plaster/Masonry was split and most weights/locations moved —
 * see items.ts). Never edited again. Surveys stamped with that
 * version were scored against exactly these weights, so exporting one has to
 * read them back the same way (see find-survey.ts).
 */
function worst(item: Omit<RubricGroup, "aggregation" | "category"> & { category: "Safety" }): RubricGroup {
  return { ...item, aggregation: "worst" };
}
function average(
  item: Omit<RubricGroup, "aggregation" | "category"> & { category: "Functionality" | "Aesthetics" }
): RubricGroup {
  return { ...item, aggregation: "average" };
}

const CLASSROOM: LocationType = "Classroom";
const CORRIDOR: LocationType = "Corridor & Stairs";
const TOILET: LocationType = "Toilet";
const FACADE: LocationType = "Exterior Facade";
const EXT_DEV: LocationType = "External Development";
const ROOF: LocationType = "Roof";
const OTHER_ROOM: LocationType = "Other Room (Staff, Principal, Admin, Store etc.)";
const LAB: LocationType = "Lab (Wet/Dry/DLP)";

export const RUBRIC_GROUPS_20261027_3: RubricGroup[] = [
  // Safety — 25% of overall, 8 groups
  worst({ name: "Boundary wall", category: "Safety", weight: 10, locations: [EXT_DEV] }),
  worst({ name: "Main Gate", category: "Safety", weight: 7, locations: [EXT_DEV] }),
  worst({
    name: "Roof Access",
    category: "Safety",
    weight: 10,
    locations: [ROOF],
    conditionOverride: ROOF_ACCESS,
    hideNA: true,
  }),
  worst({
    name: "Concrete/Plaster Soundness",
    category: "Safety",
    weight: 15,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Ceiling Condition i.e. cracks & seepage",
    category: "Safety",
    weight: 25,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Wall/Column Condition i.e. cracks",
    category: "Safety",
    weight: 10,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Roof Screeding/roof drainage",
    category: "Safety",
    weight: 15,
    locations: [ROOF],
    conditionOverride: OK_UNSAFE,
  }),
  worst({ name: "Distribution Board", category: "Safety", weight: 8, locations: [CORRIDOR] }),

  // Functionality — 45% of overall, 15 groups
  average({
    name: "Green board/Softboard/Cabinet",
    category: "Functionality",
    weight: 10,
    principalMaintained: true,
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "Water Storage (Overhead Tank)",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [ROOF],
  }),
  average({
    name: "External Plumbing",
    category: "Functionality",
    weight: 6,
    principalMaintained: true,
    locations: [EXT_DEV],
  }),
  average({ name: "Taps", category: "Functionality", weight: 7, principalMaintained: true, locations: [TOILET, LAB] }),
  average({
    name: "Wash Basin",
    category: "Functionality",
    weight: 6,
    principalMaintained: true,
    locations: [TOILET, LAB],
  }),
  average({
    name: "Flush Tanks",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    locations: [TOILET],
  }),
  average({ name: "W.Cs/Commodes", category: "Functionality", weight: 5, locations: [TOILET, LAB] }),
  average({
    name: "Sewerage System",
    category: "Functionality",
    weight: 6,
    principalMaintained: true,
    locations: [TOILET, EXT_DEV, LAB],
  }),
  average({
    name: "Electrical Fixtures",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM],
  }),
  average({
    name: "Switch/Dimmer Sheet",
    category: "Functionality",
    weight: 6,
    principalMaintained: true,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM],
  }),
  average({
    name: "Drinking Water Cooler & Filter",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    locations: [CORRIDOR, LAB],
  }),
  average({
    name: "Motor (Water pump)",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    locations: [EXT_DEV],
  }),
  average({
    name: "Internal Flooring",
    category: "Functionality",
    weight: 6,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "Furniture Condition",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "Grill Gate",
    category: "Functionality",
    weight: 3,
    principalMaintained: true,
    locations: [CORRIDOR, LAB],
  }),
  average({
    name: "Door/Windows/Ventilators",
    category: "Functionality",
    weight: 7,
    principalMaintained: true,
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, OTHER_ROOM, LAB],
  }),
  average({
    name: "LED/TV/UPS",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [LAB],
  }),
  average({
    name: "Solar Panels/Inverter/Batteries",
    category: "Functionality",
    weight: 5,
    locations: [CORRIDOR, ROOF, OTHER_ROOM],
  }),

  // Aesthetics — 30% of overall, 7 groups
  average({
    name: "Paint",
    category: "Aesthetics",
    weight: 35,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({ name: "Exterior Finish", category: "Aesthetics", weight: 25, locations: [FACADE] }),
  average({ name: "Toilet Flooring/tiles", category: "Aesthetics", weight: 5, locations: [TOILET] }),
  average({ name: "Signage", category: "Aesthetics", weight: 15, principalMaintained: true, locations: [FACADE] }),
  average({ name: "Plaque", category: "Aesthetics", weight: 5, principalMaintained: true, locations: [CORRIDOR] }),
  average({
    name: "Plaster/Masonry",
    category: "Aesthetics",
    weight: 10,
    locations: [CLASSROOM, TOILET, CORRIDOR, FACADE, ROOF, OTHER_ROOM, LAB],
  }),
  average({ name: "CC Jali", category: "Aesthetics", weight: 5, locations: [CORRIDOR, FACADE] }),
];

