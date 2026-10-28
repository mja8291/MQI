import type { Category, Condition, FloorLevel, LocationType, RubricGroup, RubricItem } from "../types";
import { OK_UNSAFE, ROOF_ACCESS, SOUNDNESS_GUIDANCE } from "./condition-overrides";

/**
 * The survey rubric — 31 item groups (Safety 9 / Functionality 15 / Aesthetics 7),
 * rubric version 2026-10-28, read from the item-group tab of the revised rubric workbook: names, order, "Category Weightage"
 * and the per-group Location column come straight from it, and each
 * division's weights sum to 100. This is the app's only rubric.
 *
 * History of this list (each earlier one frozen as a snapshot — see
 * rubric-version.ts):
 *   - 2026-10-27   30 groups (items-v20261027.ts)
 *   - 2026-10-27.2 31 groups (items-v20261027-2.ts)
 *   - 2026-10-27.3 33 groups (items-v20261027-3.ts)
 *   - 2026-10-28   this list: + Window Shades (Safety); Taps + Wash Basin
 *                  merged into "Wash Basin/Taps"; Electrical Fixtures +
 *                  Switch/Dimmer Sheet merged; W.Cs/Commodes and Plaque
 *                  dropped; "Plaster/Masonry" split into Plaster and
 *                  Masonry; "Roof Access" renamed "Access to roof area
 *                  /tanks"; "Internal Flooring" renamed "Internal Flooring
 *                  condition"; most weights and several locations changed.
 * All of it replaced the original 45-item / 6-work-category version (frozen
 * in items-legacy.ts): this list scores whole item *groups* per
 * location, and has no Work Category column, so a location's groups are
 * sectioned by division (Safety / Functionality / Aesthetics) instead.
 *
 * Decisions made on top of the sheet, confirmed with the rubric owner
 * 2026-10-27:
 *   - The two-button "OK / Unsafe" pickers score OK = 100%, Unsafe = 25%, and
 *     Access to roof area moves onto the same scale — see
 *     condition-overrides.ts.
 * Not in the sheet, derived here:
 *   - principalMaintained (drives the Minor score) is true when every item
 *     the sheet's own item-level "Item Group" column files under the group is
 *     one of its "*" (school-maintained) items. Distribution Board is mixed
 *     (Energy & Power * + Electrical Wiring) and stays with Engineering;
 *     Window Shades has no item-level entry and is treated as Engineering's.
 *   - Safety groups aggregate across locations by worst case, the others by
 *     average — unchanged from the previous version.
 * Where this list follows the sheet literally even though it changed from
 * before: Sewerage System is now listed at Toilet / Exterior Facade / Lab
 * (previously the sheet's Exterior Facade-only entry was overridden to
 * Toilet / External Development / Lab; the owner has since edited it), and
 * External Plumbing is at Exterior Facade / Roof, no longer External
 * Development.
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

export const RUBRIC_GROUPS: RubricGroup[] = [
  // Safety — 25% of overall, 9 groups
  worst({ name: "Boundary wall", category: "Safety", weight: 8, locations: [EXT_DEV] }),
  worst({ name: "Main Gate", category: "Safety", weight: 7, locations: [EXT_DEV] }),
  worst({
    name: "Access to roof area /tanks",
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
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB, FACADE],
    conditionOverride: OK_UNSAFE,
    guidance: SOUNDNESS_GUIDANCE,
  }),
  worst({
    name: "Ceiling Condition i.e. cracks & seepage",
    category: "Safety",
    weight: 20,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Wall/Column Condition i.e. cracks",
    category: "Safety",
    weight: 10,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB, FACADE],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Roof Screeding/roof drainage",
    category: "Safety",
    weight: 15,
    locations: [ROOF],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Window Shades",
    category: "Safety",
    weight: 7,
    locations: [FACADE],
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
    weight: 8,
    principalMaintained: true,
    locations: [ROOF],
  }),
  average({
    name: "External Plumbing",
    category: "Functionality",
    weight: 8,
    principalMaintained: true,
    locations: [FACADE, ROOF],
  }),
  average({
    name: "Wash Basin/Taps",
    category: "Functionality",
    weight: 8,
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
  average({
    name: "Sewerage System",
    category: "Functionality",
    weight: 8,
    principalMaintained: true,
    locations: [TOILET, FACADE, LAB],
  }),
  average({
    name: "Electrical Fixtures + Switch/Dimmer Sheet",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "Drinking Water Cooler & Filter",
    category: "Functionality",
    weight: 4,
    principalMaintained: true,
    locations: [CORRIDOR],
  }),
  average({
    name: "Motor (Water pump)",
    category: "Functionality",
    weight: 4,
    principalMaintained: true,
    locations: [EXT_DEV],
  }),
  average({
    name: "Internal Flooring condition",
    category: "Functionality",
    weight: 7,
    locations: [CLASSROOM, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({
    name: "Furniture Condition",
    category: "Functionality",
    weight: 6,
    principalMaintained: true,
    locations: [CLASSROOM, OTHER_ROOM, LAB],
  }),
  average({
    name: "Grill Gate",
    category: "Functionality",
    weight: 5,
    principalMaintained: true,
    locations: [CORRIDOR, LAB, ROOF],
  }),
  average({
    name: "Door/Windows/Ventilators",
    category: "Functionality",
    weight: 10,
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
    locations: [CORRIDOR, ROOF],
  }),

  // Aesthetics — 30% of overall, 7 groups
  average({
    name: "Paint",
    category: "Aesthetics",
    weight: 35,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
  }),
  average({ name: "Exterior Finish", category: "Aesthetics", weight: 25, locations: [FACADE] }),
  average({ name: "Toilet Flooring/tiles", category: "Aesthetics", weight: 7, locations: [TOILET] }),
  average({ name: "Signage", category: "Aesthetics", weight: 12, principalMaintained: true, locations: [FACADE] }),
  average({
    name: "Plaster",
    category: "Aesthetics",
    weight: 8,
    locations: [CLASSROOM, TOILET, CORRIDOR, ROOF, OTHER_ROOM, LAB],
  }),
  average({ name: "Masonry", category: "Aesthetics", weight: 4, locations: [FACADE, ROOF] }),
  average({ name: "CC Jali", category: "Aesthetics", weight: 9, locations: [CORRIDOR, FACADE] }),
];

/** Display order of a location's scoring sections. */
export const RUBRIC_SECTIONS: Category[] = ["Safety", "Functionality", "Aesthetics"];

export const LOCATION_TYPES: LocationType[] = [
  CLASSROOM,
  CORRIDOR,
  TOILET,
  FACADE,
  EXT_DEV,
  ROOF,
  OTHER_ROOM,
  LAB,
];

export const FLOOR_LEVELS: FloorLevel[] = ["External", "Ground", "First", "Second", "Third", "Fourth", "Roof"];

// Roof is deliberately excluded here (2026-09-19, per the rubric sheet's
// "Level Option Page" — Roof's own row has no location-type options at
// all): it's already its own floor level with its own auto-created
// location (see chooseFloor's Roof special-case in scoring/page.tsx), so
// offering it again as a type card *within* Ground/First/etc. was a
// redundant, confusing duplicate route to the exact same location shape.
const GROUND_LIKE_TYPES: LocationType[] = [CLASSROOM, CORRIDOR, TOILET, OTHER_ROOM, LAB];

/** Which location types are offered on a given floor. Empty = skip the Location page (Roof floor only). */
export const FLOOR_LOCATION_TYPES: Record<FloorLevel, LocationType[]> = {
  External: [FACADE, EXT_DEV],
  Ground: GROUND_LIKE_TYPES,
  First: GROUND_LIKE_TYPES,
  Second: GROUND_LIKE_TYPES,
  Third: GROUND_LIKE_TYPES,
  Fourth: GROUND_LIKE_TYPES,
  Roof: [],
};

/**
 * Location types that only ever have one instance per visit, so naming it is
 * pointless friction — auto-name instead (e.g. "Roof 1", incrementing).
 */
export const UNNAMED_LOCATION_TYPES: LocationType[] = [CORRIDOR, FACADE, EXT_DEV, ROOF];

/** Fixed-choice dependent dropdown for location types that aren't free-text or auto-named. Classroom is handled separately (grade + section). */
export const LOCATION_NAME_OPTIONS: Partial<Record<LocationType, string[]>> = {
  Toilet: ["Girls Toilet", "Boys Toilet", "Female Staff Toilet", "Male Staff Toilet"],
  "Lab (Wet/Dry/DLP)": ["Wet Lab", "Dry Lab", "DLP", "Bio/Chemistry Lab", "Physics Lab"],
  "Other Room (Staff, Principal, Admin, Store etc.)": [
    "Staff room",
    "Principal Room",
    "Admin Room",
    "Store",
    "Chemistry/Wet Lab Store",
    "Physics/Dry Lab Store",
    "Pantry",
    "Others",
  ],
};

// Round 3 Task 12: Classroom naming isn't free text or a flat "Classroom 1,
// Classroom 2..." list — it's this Grade x Section combinator (see
// LOC_SET_CLASSROOM in survey-context.tsx, name = `${grade} ${section}`).
// Nursery slots in as an additional grade, pairing with a section like
// every other grade, rather than as a one-off special case.
/**
 * Library/Art Room/Art Room-Library (2026-09-19) aren't actual grades, but
 * they're picked from this same list rather than getting their own page —
 * same precedent as Nursery above. Unlike every real grade, a campus
 * normally has just one of each, so a Section pick would be forced busywork
 * for the common case — see CLASSROOM_GRADES_WITH_OPTIONAL_SECTION, which
 * is what actually excuses Continue from requiring one for these three.
 */
export const CLASSROOM_GRADES = [
  "Nursery",
  "KG",
  ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
  "Library",
  "Art Room/Library",
  "Art Room",
];
/** Grades that don't need a Section to disambiguate — a campus has one of each of these, not several. */
export const CLASSROOM_GRADES_WITH_OPTIONAL_SECTION = ["Library", "Art Room/Library", "Art Room"];
/** Campuses use either lettered or coloured sections — offer both, ASM picks whichever applies. */
export const CLASSROOM_SECTIONS = ["A", "B", "C", "D", "E", "Red", "Yellow", "Green", "Blue"];

export function rubricGroupsForLocation(type: LocationType): RubricGroup[] {
  return RUBRIC_GROUPS.filter((g) => g.locations.includes(type));
}

/** True once every item group applicable to this location has a score — the same completeness rule the scoring page enforces, applied to a whole recorded location at once. */
/** v2 (W13): a value whose picker label is "Unsafe" must be backed by a photo. */
export function isUnsafe(item: Pick<RubricItem, "conditionOverride">, value: Condition | undefined): boolean {
  return Boolean(value && item.conditionOverride?.some((o) => o.condition === value && o.label === "Unsafe"));
}

/** Items marked Unsafe at this location with no photo attached. */
export function unsafeWithoutPhoto(
  location: { type: LocationType; scores: Record<string, Condition>; photos: Record<string, readonly unknown[]> },
  groups: readonly Pick<RubricItem, "name" | "conditionOverride">[] = rubricGroupsForLocation(location.type)
): string[] {
  return groups.filter((g) => isUnsafe(g, location.scores[g.name]) && !(location.photos[g.name]?.length)).map((g) => g.name);
}

export function isLocationComplete(location: { type: LocationType; scores: Record<string, Condition> }): boolean {
  return rubricGroupsForLocation(location.type).every((g) => Boolean(location.scores[g.name]));
}

export function rubricGroupsForLocationAndSection(type: LocationType, section: Category): RubricGroup[] {
  return rubricGroupsForLocation(type).filter((g) => g.category === section);
}

/** Group counts per section for a specific location type — drives the scoring page's section counts (location-specific, not global). */
export function sectionCountsForLocation(type: LocationType): Record<Category, number> {
  const counts: Record<Category, number> = { Safety: 0, Functionality: 0, Aesthetics: 0 };
  for (const group of rubricGroupsForLocation(type)) counts[group.category]++;
  return counts;
}
