import { describe, expect, it } from "vitest";
import { ADDED_LATER, isLocationComplete, rubricGroupsForLocation } from "./rubric/items";
import { RUBRIC_GROUPS_20261113 } from "./rubric/items-v20261113";
import { RUBRIC_VERSION } from "./rubric/rubric-version";
import { KNOWN_RUBRIC_VERSIONS, rubricGroupsFor } from "./rubric/versions";
import type { Condition, LocationType } from "./types";

/** W77 (requested 2026-11-18): LED/TV/UPS only at DLP, Art Room, Art Room/Library and Library. */

const LAB: LocationType = "Lab (Wet/Dry/DLP)";
const CLASSROOM: LocationType = "Classroom";
const ITEM = "LED/TV/UPS";
const names = (t: LocationType, name?: string) => rubricGroupsForLocation(t, name).map((g) => g.name);

describe("W77 rubric 2026-11-18", () => {
  it("is current; 2026-11-13 surveys keep their frozen list", () => {
    expect(RUBRIC_VERSION).toBe("2026-11-18");
    expect(KNOWN_RUBRIC_VERSIONS).toContain("2026-11-13");
    expect(rubricGroupsFor("2026-11-13")).toBe(RUBRIC_GROUPS_20261113);
  });

  it("asks LED/TV/UPS only in the DLP lab", () => {
    expect(names(LAB, "DLP")).toContain(ITEM);
    expect(names(LAB, "DLP 2")).toContain(ITEM);
    for (const lab of ["Wet Lab", "Dry Lab", "Bio/Chemistry Lab", "Physics Lab"]) expect(names(LAB, lab)).not.toContain(ITEM);
  });

  it("asks LED/TV/UPS in Art Room, Art Room/Library and Library, not in grade classrooms", () => {
    for (const room of ["Art Room", "Art Room A", "Art Room/Library", "Library", "Library B"]) expect(names(CLASSROOM, room)).toContain(ITEM);
    for (const room of ["Grade 5 A", "Class 1 Red", "ECE Blue"]) expect(names(CLASSROOM, room)).not.toContain(ITEM);
  });

  it("a classroom from a phone not yet updated is still complete without it", () => {
    const scores = Object.fromEntries(names(CLASSROOM, "Library").filter((n) => n !== ITEM).map((n) => [n, "Good" as Condition]));
    expect(isLocationComplete({ type: CLASSROOM, name: "Library", scores }, ADDED_LATER)).toBe(true);
    expect(isLocationComplete({ type: CLASSROOM, name: "Library", scores })).toBe(false);
  });

  it("the frozen 2026-11-13 list still has it at every lab and no classroom", () => {
    const g = RUBRIC_GROUPS_20261113.find((x) => x.name === ITEM)!;
    expect(g.locations).toEqual([LAB]);
    expect(g.onlyAtNames).toBeUndefined();
  });
});
