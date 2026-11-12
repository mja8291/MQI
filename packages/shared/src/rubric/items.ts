import type { Category, Condition, FloorLevel, LocationType, RubricGroup, RubricItem } from "../types";
import { OK_UNSAFE, ROOF_ACCESS_TYPES, SOUNDNESS_GUIDANCE, WALL_COLUMN_GUIDANCE, YES_NO } from "./condition-overrides";

/**
 * The survey rubric — 33 item groups (Safety 11 / Functionality 15 / Aesthetics 7),
 * rubric version 2026-11-07, read from the item-group tab of the revised rubric workbook: names, order, "Category Weightage"
 * and the per-group Location column come straight from it, and each
 * division's weights sum to 100. This is the app's only rubric.
 *
 * History of this list (each earlier one frozen as a snapshot — see
 * rubric-version.ts):
 *   - 2026-10-27   30 groups (items-v20261027.ts)
 *   - 2026-10-27.2 31 groups (items-v20261027-2.ts)
 *   - 2026-10-27.3 33 groups (items-v20261027-3.ts)
 *   - 2026-10-28   31 groups (items-v20261028.ts): + Window Shades (Safety); Taps + Wash Basin
 *                  merged into "Wash Basin/Taps"; Electrical Fixtures +
 *                  Switch/Dimmer Sheet merged; W.Cs/Commodes and Plaque
 *                  dropped; "Plaster/Masonry" split into Plaster and
 *                  Masonry; "Roof Access" renamed "Access to roof area
 *                  /tanks"; "Internal Flooring" renamed "Internal Flooring
 *                  condition"; most weights and several locations changed.
 *   - 2026-11-07   this list (W56): + "Slab + Screeding/Waterproofing
 *                  thickness assessment" (10) and "Proper Overflow Disposal
 *                  System" (4) in Safety, both at Roof and scored from answers
 *                  the surveyor already gives (drilling card, Review page) —
 *                  see derivedScores; Boundary wall 8→7, Concrete/Plaster
 *                  Soundness 15→12, Ceiling 20→16, Roof Screeding 15→10,
 *                  Distribution Board 8→7. Guardroom (Toilet's items) and
 *                  Canteen & UGWT (Other Room's items) added on External.
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
 *   - principalMaintained (drives the Minor score): since 2026-11-11 (W68) exactly the
 *     sheet's "*" item groups (school-maintained, minor): Access to roof area, Proper
 *     Overflow Disposal System, Distribution Board, every Functionality group but Sewerage
 *     System and Internal Flooring, and Signage. Before that it was true when every item
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
/** v2 (W56): on the External floor, behind one "Guardroom/Canteen & UGWT" card. */
const GUARDROOM: LocationType = "Guardroom";
/** W56's single type for both; kept so its surveys (and phones not yet updated) still check out. */
const CANTEEN_UGWT_W56: LocationType = "Canteen & UGWT";
/** v2 (W58): Canteen = Other Room's items less Green board; UGWT = Other Room's Safety items, External Plumbing and Plaster. */
const CANTEEN: LocationType = "Canteen";
const UGWT: LocationType = "UGWT";

/** v2 (W56): scored from the drilling card and the Review page, not picked at the Roof location. */
export const SLAB_ASSESSMENT_ITEM = "Slab + Screeding/Waterproofing thickness assessment";
export const OVERFLOW_ITEM = "Proper Overflow Disposal System";

const SHEET_GROUPS: RubricGroup[] = [
  // Safety — 25% of overall, 11 groups
  worst({ name: "Boundary wall", category: "Safety", weight: 7, locations: [EXT_DEV] }),
  worst({ name: "Main Gate", category: "Safety", weight: 7, locations: [EXT_DEV] }),
  worst({
    name: "Access to roof area /tanks",
    category: "Safety",
    weight: 10,
    // W68 (2026-11-11): the Review page's options, with the owner's scores (staircase 100, ladder 50, none 0); N/A allowed.
    principalMaintained: true,
    locations: [ROOF],
    conditionOverride: ROOF_ACCESS_TYPES,
  }),
  worst({
    name: "Concrete/Plaster Soundness",
    category: "Safety",
    weight: 12,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB, FACADE],
    conditionOverride: OK_UNSAFE,
    guidance: SOUNDNESS_GUIDANCE,
  }),
  worst({
    name: "Ceiling Condition i.e. cracks & seepage",
    category: "Safety",
    weight: 16,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Wall/Column Condition i.e. cracks",
    category: "Safety",
    weight: 10,
    locations: [CLASSROOM, TOILET, CORRIDOR, OTHER_ROOM, LAB, FACADE],
    conditionOverride: OK_UNSAFE,
    unsafeParts: ["Column", "Wall"],
    guidance: WALL_COLUMN_GUIDANCE,
  }),
  worst({
    name: "Roof Screeding/roof drainage",
    category: "Safety",
    weight: 10,
    locations: [ROOF],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: "Window Shades",
    label: "Window Shades (Chajja)",
    category: "Safety",
    weight: 7,
    locations: [FACADE],
    conditionOverride: OK_UNSAFE,
  }),
  worst({
    name: SLAB_ASSESSMENT_ITEM,
    category: "Safety",
    weight: 10,
    locations: [ROOF],
    conditionOverride: OK_UNSAFE,
    derived: true,
  }),
  worst({
    name: OVERFLOW_ITEM,
    category: "Safety",
    weight: 4,
    locations: [ROOF],
    conditionOverride: YES_NO,
    derived: true,
    principalMaintained: true,
  }),
  worst({ name: "Distribution Board", category: "Safety", weight: 7, principalMaintained: true, locations: [CORRIDOR] }),

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
    principalMaintained: true,
    locations: [CORRIDOR, ROOF],
    // W44: panels are on the roof, inverter and batteries in the corridor/stairs.
    locationLabels: { [ROOF]: "Solar Panels", [CORRIDOR]: "Inverter/Batteries" },
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

/**
 * v2 (W56): Guardroom is scored on every item a Toilet is; Canteen & UGWT on every item an Other
 * Room is (requested 2026-11-07; the sheet's Location column doesn't list them).
 */
const WITH_WATER_ONLY_AT: Partial<Record<LocationType, readonly string[]>> = {
  // W70 (2026-11-13): basins and drains are only in these rooms.
  [LAB]: ["Wet Lab", "Bio/Chemistry Lab"],
  [OTHER_ROOM]: ["Pantry"],
};
const WITH_WATER = ["Wash Basin/Taps", "Sewerage System"];

export const RUBRIC_GROUPS: RubricGroup[] = SHEET_GROUPS.map((g) => {
  const otherRoom = g.locations.includes(OTHER_ROOM);
  return {
    ...g,
    locations: [
      ...g.locations,
      // W59 (2026-11-08): Guardroom also has Distribution Board.
      ...(g.locations.includes(TOILET) || g.name === "Distribution Board" ? [GUARDROOM] : []),
      ...(otherRoom ? [CANTEEN_UGWT_W56] : []),
      // W58 (2026-11-07): Canteen has no Green board/Softboard/Cabinet.
      ...(otherRoom && g.name !== "Green board/Softboard/Cabinet" ? [CANTEEN] : []),
      // W58: UGWT keeps Other Room's Safety items and Plaster; its only Functionality item is External Plumbing; no Paint.
      ...((otherRoom && (g.category === "Safety" || g.name === "Plaster")) || g.name === "External Plumbing" ? [UGWT] : []),
      // W70: Pantry (an Other Room) has a basin and a drain.
      ...(WITH_WATER.includes(g.name) ? [OTHER_ROOM] : []),
    ],
    ...(WITH_WATER.includes(g.name) ? { onlyAtNames: WITH_WATER_ONLY_AT } : {}),
  };
});

/** W70: whether a group is scored at a location of this type and name (no name: the type decides). */
export function groupAppliesAt(g: Pick<RubricGroup, "locations" | "onlyAtNames">, type: LocationType, name?: string): boolean {
  if (!g.locations.includes(type)) return false;
  const only = g.onlyAtNames?.[type];
  if (!only || name === undefined) return true;
  return only.some((n) => name === n || name.startsWith(`${n} `));
}

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
  GUARDROOM,
  CANTEEN_UGWT_W56,
  CANTEEN,
  UGWT,
];

export const FLOOR_LEVELS: FloorLevel[] = ["External", "Ground", "First", "Second", "Third", "Fourth", "Roof"];

/** v2 (W24): levels the surveyor confirms for the campus. External is always on. */
export const DEFAULT_LEVELS: FloorLevel[] = ["External", "Ground", "First", "Roof"];
export const REQUIRED_LEVELS: FloorLevel[] = ["External"];
/** v2 (W55): levels that don't count towards "at least one level" (the building itself needs one). */
export const NON_BUILDING_LEVELS: FloorLevel[] = ["External", "Roof"];
export const NEED_BUILDING_LEVEL_MESSAGE = "Tick at least one level besides External and Roof.";
export function hasBuildingLevel(levels: readonly FloorLevel[]): boolean {
  return levels.some((l) => !NON_BUILDING_LEVELS.includes(l));
}
export const NO_ROOF_MESSAGE = "Leave Roof unticked only if another vertical campus is built above this campus.";
/** The chosen levels in floor order (External first, Roof last); null (older drafts) → every level. */
export function applicableLevels(levels: readonly FloorLevel[] | null | undefined): FloorLevel[] {
  if (!levels) return FLOOR_LEVELS;
  return FLOOR_LEVELS.filter((l) => REQUIRED_LEVELS.includes(l) || levels.includes(l));
}

// Roof is deliberately excluded here (2026-09-19, per the rubric sheet's
// "Level Option Page" — Roof's own row has no location-type options at
// all): it's already its own floor level with its own auto-created
// location (see chooseFloor's Roof special-case in scoring/page.tsx), so
// offering it again as a type card *within* Ground/First/etc. was a
// redundant, confusing duplicate route to the exact same location shape.
const GROUND_LIKE_TYPES: LocationType[] = [CLASSROOM, CORRIDOR, TOILET, OTHER_ROOM, LAB];

/** Which location types are offered on a given floor. Empty = skip the Location page (Roof floor only). */
export const FLOOR_LOCATION_TYPES: Record<FloorLevel, LocationType[]> = {
  External: [FACADE, EXT_DEV, GUARDROOM, CANTEEN, UGWT],
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

/** The groups the surveyor scores at a location of this type (W56: not those scored from other answers). */
export function rubricGroupsForLocation(type: LocationType, name?: string): RubricGroup[] {
  return RUBRIC_GROUPS.filter((g) => groupAppliesAt(g, type, name) && !g.derived);
}

/**
 * v2 (W56): location types offered together behind one card, the name picked deciding the type.
 * On the External floor: "Guardroom/Canteen & UGWT" → Guardroom, Canteen or UGWT.
 */
export const LOCATION_CARDS: { label: string; names: Record<string, LocationType>; legacy?: LocationType[] }[] = [
  { label: "Guardroom/Canteen & UGWT", names: { Guardroom: GUARDROOM, Canteen: CANTEEN, UGWT: UGWT }, legacy: [CANTEEN_UGWT_W56] },
];
/** v2 (W60): location types an e-compound's campuses share; a sibling campus's latest one pre-fills. */
export const SHARED_LOCATION_TYPES: readonly LocationType[] = [GUARDROOM, CANTEEN, UGWT, CANTEEN_UGWT_W56];

export function locationCardFor(type: LocationType): (typeof LOCATION_CARDS)[number] | undefined {
  return LOCATION_CARDS.find((c) => Object.values(c.names).includes(type) || c.legacy?.includes(type));
}

/**
 * v2 (W58): a draft location of W56's "Canteen & UGWT" type becomes Canteen or UGWT by its name,
 * keeping only the scores that type has (the rest is scored again where needed). Photos and notes stay.
 */
export function migrateLocationType<L extends { type: LocationType; name: string; scores: Record<string, Condition> }>(loc: L): L {
  if (loc.type !== CANTEEN_UGWT_W56) return loc;
  const type: LocationType = /^UGWT\b/i.test(loc.name) ? UGWT : CANTEEN;
  const keep = new Set(rubricGroupsForLocation(type).map((g) => g.name));
  return { ...loc, type, scores: Object.fromEntries(Object.entries(loc.scores).filter(([name]) => keep.has(name))) as Record<string, Condition> };
}

/** True once every item group applicable to this location has a score — the same completeness rule the scoring page enforces, applied to a whole recorded location at once. */
/** v2 (W13): a value whose picker label is "Unsafe" must be backed by a photo. */
export function isUnsafe(item: Pick<RubricItem, "conditionOverride">, value: Condition | undefined): boolean {
  return Boolean(value && item.conditionOverride?.some((o) => o.condition === value && o.label === "Unsafe"));
}

/** Items marked Unsafe at this location with no photo attached (W47: except those whose photo the app lost). */
export function unsafeWithoutPhoto(
  location: { type: LocationType; scores: Record<string, Condition>; photos: Record<string, readonly unknown[]>; photoLost?: readonly string[] },
  groups: readonly Pick<RubricItem, "name" | "conditionOverride" | "derived">[] = rubricGroupsForLocation(location.type)
): string[] {
  return groups
    // W56: a derived item's evidence is its own question's photo (drilling card, Review page).
    .filter((g) => !g.derived && isUnsafe(g, location.scores[g.name]) && !(location.photos[g.name]?.length) && !location.photoLost?.includes(g.name))
    .map((g) => g.name);
}

export function isLocationComplete(
  location: { type: LocationType; name?: string; scores: Record<string, Condition> },
  /** W59: items the server doesn't require yet (see ADDED_LATER). */
  excused: Partial<Record<LocationType, readonly string[]>> = {}
): boolean {
  return rubricGroupsForLocation(location.type, location.name).every((g) => Boolean(location.scores[g.name]) || Boolean(excused[location.type]?.includes(g.name)));
}

/**
 * v2 (W59): items added to a location type after it went live. The phone asks for them; the server
 * accepts a location without them, so a survey from a phone not yet updated isn't refused.
 */
export const ADDED_LATER: Partial<Record<LocationType, readonly string[]>> = {
  Guardroom: ["Distribution Board"],
  // W70: Pantry's basin and drain.
  "Other Room (Staff, Principal, Admin, Store etc.)": ["Wash Basin/Taps", "Sewerage System"],
};

export function rubricGroupsForLocationAndSection(type: LocationType, section: Category, name?: string): RubricGroup[] {
  return rubricGroupsForLocation(type, name).filter((g) => g.category === section);
}

/** Group counts per section for a specific location type — drives the scoring page's section counts (location-specific, not global). */
export function sectionCountsForLocation(type: LocationType, name?: string): Record<Category, number> {
  const counts: Record<Category, number> = { Safety: 0, Functionality: 0, Aesthetics: 0 };
  for (const group of rubricGroupsForLocation(type, name)) counts[group.category]++;
  return counts;
}

/** v2 (W21): the sheet text for parts marked unsafe, e.g. "Column Unsafe, Wall Unsafe". */
export function unsafePartsText(parts: readonly string[]): string {
  return parts.map((p) => `${p} Unsafe`).join(", ");
}

/** v2 (W66): "Column Unsafe, Wall Unsafe" → ["Column", "Wall"]. */
export function unsafePartsFromCell(value: string): string[] {
  return [...value.matchAll(/(\w+) Unsafe\b/g)].map((m) => m[1]!);
}

/** Reads a response cell back as a condition: "… Unsafe" text (W21) is that item's Unsafe score. */
export function cellCondition(value: string): Condition | undefined {
  if (!value) return undefined;
  if (/\bUnsafe\b/.test(value)) return "Very Poor";
  return value as Condition;
}
