import { describe, expect, it } from "vitest";
import { foundSurveyFromRows } from "./read-models";
import { buildReportModel, reportSourceFromFound, shownCondition } from "./report/model";
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from "./report/fixture-01a1911f";
import { ROOF_ACCESS_ITEM } from "./rubric/derived";
import { ADDED_LATER, RUBRIC_GROUPS, isLocationComplete, rubricGroupsForLocation } from "./rubric/items";
import { RUBRIC_GROUPS_20261111 } from "./rubric/items-v20261111";
import { RUBRIC_VERSION } from "./rubric/rubric-version";
import { rubricGroupsFor } from "./rubric/versions";
import { DRILLING_PHOTO_NEEDED, SITE_PHOTO_SLAB_THICKNESS, drillingPhotoMissing, type LocationType } from "./types";

/** W70 (requested 2026-11-13): ladder 100%, basins/drains by room, drilling photo, report order. */

const LAB: LocationType = "Lab (Wet/Dry/DLP)";
const OTHER: LocationType = "Other Room (Staff, Principal, Admin, Store etc.)";
const names = (t: LocationType, name?: string) => rubricGroupsForLocation(t, name).map((g) => g.name);

describe("W70 rubric 2026-11-13", () => {
  it("is current; 2026-11-11 surveys keep their frozen list", () => {
    expect(RUBRIC_VERSION).toBe("2026-11-13");
    expect(rubricGroupsFor("2026-11-11")).toBe(RUBRIC_GROUPS_20261111);
  });

  it("Ladder scores 100% like a proper staircase and is drawn as Good", () => {
    const g = RUBRIC_GROUPS.find((x) => x.name === ROOF_ACCESS_ITEM)!;
    expect(g.conditionOverride).toEqual([
      { condition: "Good", label: "Proper staircase" },
      { condition: "Poor", label: "Ladder", score: 100 },
      { condition: "Very Poor", label: "None", score: 0 },
    ]);
    expect(shownCondition(g, "Poor")).toBe("Good");
    expect(shownCondition(g, "Very Poor")).toBe("Very Poor");
  });

  it("Wash Basin/Taps and Sewerage System only at Wet Lab, Bio/Chemistry Lab and Pantry", () => {
    for (const lab of ["Wet Lab", "Bio/Chemistry Lab", "Wet Lab 2"]) {
      expect(names(LAB, lab)).toEqual(expect.arrayContaining(["Wash Basin/Taps", "Sewerage System"]));
    }
    for (const lab of ["Dry Lab", "DLP", "Physics Lab"]) {
      expect(names(LAB, lab)).not.toContain("Wash Basin/Taps");
      expect(names(LAB, lab)).not.toContain("Sewerage System");
    }
    expect(names(OTHER, "Pantry")).toEqual(expect.arrayContaining(["Wash Basin/Taps", "Sewerage System"]));
    expect(names(OTHER, "Staff room")).not.toContain("Wash Basin/Taps");
    expect(names("Canteen")).not.toContain("Wash Basin/Taps");
  });

  it("a Pantry from a phone not yet updated (without them) is still accepted by the server", () => {
    const pantry = { type: OTHER, name: "Pantry", scores: Object.fromEntries(names(OTHER, "Staff room").map((n) => [n, "Good" as const])) };
    expect(isLocationComplete(pantry)).toBe(false);
    expect(isLocationComplete(pantry, ADDED_LATER)).toBe(true);
  });
});

describe("W70 drilling photo", () => {
  it("is required only when drilling was done", () => {
    expect(drillingPhotoMissing({ done: "YES" }, {})).toBe(true);
    expect(drillingPhotoMissing({ done: "YES" }, { [SITE_PHOTO_SLAB_THICKNESS]: [{}] })).toBe(false);
    expect(drillingPhotoMissing({ done: "NO" }, {})).toBe(false);
    expect(DRILLING_PHOTO_NEEDED).toMatch(/drilled hole/);
  });
});

describe("W70 report", () => {
  it("lists Safety first", () => {
    const m = buildReportModel(reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!));
    expect(m.categories.map((c) => c.category)).toEqual(["Safety", "Functionality", "Aesthetics"]);
  });
});

describe("W71 roof upkeep with the minor items", () => {
  it("a roof not clean / rain spouts not clear is a minor shortcoming, with its photo grouped as minor", () => {
    const src = reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!);
    const m = buildReportModel({
      ...src,
      siteChecks: { ...src.siteChecks, roofClean: "No", rainSpoutsClear: "No" },
      photos: [{ id: "spout", itemName: "Rain spouts clear", locationName: "" }],
    });
    const upkeep = m.minor.byLocation.find((l) => l.label.startsWith("Roof · upkeep"))!;
    expect(upkeep.items).toEqual([
      { label: "Roof clean of dirt and vegetation", rating: "Not clean (dirt/vegetation)", level: "poor" },
      { label: "Rain spouts clear", rating: "Not clear (blocked)", level: "poor" },
    ]);
    expect(m.photos[0]).toMatchObject({ id: "spout", section: "Minor", severity: 2 });
  });
});
