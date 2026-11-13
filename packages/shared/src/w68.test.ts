import { describe, expect, it } from "vitest";
import type { CapturedSchool } from "./api";
import { campusBreakup, markRmPlanned, parsePlan } from "./campus-plan";
import { foundSurveyFromRows, parseSchools } from "./read-models";
import { buildReportModel, reportSourceFromFound, type ReportSource } from "./report/model";
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from "./report/fixture-01a1911f";
import { roofAccessFromLocations, ROOF_ACCESS_ITEM } from "./rubric/derived";
import { RUBRIC_GROUPS } from "./rubric/items";
import { RUBRIC_GROUPS_20261107 } from "./rubric/items-v20261107";
import { RUBRIC_VERSION } from "./rubric/rubric-version";
import { rubricGroupsFor, scoreSurveyFor } from "./rubric/versions";
import { aggregateLocations } from "./scoring";
import type { Condition, SurveyLocation } from "./types";

/** W68 (requested 2026-11-11): "*" items, roof access options, legacy table, School ID matching. */

const roof = (c: Condition): SurveyLocation => ({ floorLevel: "Roof", type: "Roof", name: "Roof 1", scores: { [ROOF_ACCESS_ITEM]: c }, photos: {}, notes: {} }) as unknown as SurveyLocation;

describe("W68 rubric 2026-11-11", () => {
  it("is the current version; 2026-11-07 surveys keep their frozen list", () => {
    expect(RUBRIC_VERSION >= "2026-11-11").toBe(true); // W70 moved on to 2026-11-13
    expect(rubricGroupsFor("2026-11-07")).toBe(RUBRIC_GROUPS_20261107);
    expect(RUBRIC_GROUPS_20261107).toHaveLength(33);
    expect(RUBRIC_GROUPS_20261107.find((g) => g.name === ROOF_ACCESS_ITEM)!.conditionOverride!.map((o) => o.label)).toEqual(["Roof Access Available", "Roof Access Not Available"]);
    // Weights are unchanged.
    expect(RUBRIC_GROUPS.map((g) => [g.name, g.weight])).toEqual(RUBRIC_GROUPS_20261107.map((g) => [g.name, g.weight]));
  });

  it("minor items are exactly the rubric sheet's '*' items", () => {
    expect(RUBRIC_GROUPS.filter((g) => g.principalMaintained).map((g) => g.name)).toEqual([
      "Access to roof area /tanks",
      "Proper Overflow Disposal System",
      "Distribution Board",
      "Green board/Softboard/Cabinet",
      "Water Storage (Overhead Tank)",
      "External Plumbing",
      "Wash Basin/Taps",
      "Flush Tanks",
      "Electrical Fixtures + Switch/Dimmer Sheet",
      "Drinking Water Cooler & Filter",
      "Motor (Water pump)",
      "Furniture Condition",
      "Grill Gate",
      "Door/Windows/Ventilators",
      "LED/TV/UPS",
      "Solar Panels/Inverter/Batteries",
      "Signage",
    ]);
  });

  it("roof access: Proper staircase 100%, Ladder 100% since W70 (50% under 2026-11-11), None 0%, N/A left out; offered with N/A", () => {
    const g = RUBRIC_GROUPS.find((x) => x.name === ROOF_ACCESS_ITEM)!;
    expect(g.conditionOverride!.map((o) => o.label)).toEqual(["Proper staircase", "Ladder", "None"]);
    expect(g.hideNA).toBeFalsy();
    expect(aggregateLocations([roof("Good")])[ROOF_ACCESS_ITEM]).toBe(100);
    expect(aggregateLocations([roof("Poor")])[ROOF_ACCESS_ITEM]).toBe(100);
    expect(scoreSurveyFor([roof("Poor")], "2026-11-11").categories.Safety.score).toBe(50);
    expect(aggregateLocations([roof("Very Poor")])[ROOF_ACCESS_ITEM]).toBe(0);
    expect(aggregateLocations([roof("N/A")])[ROOF_ACCESS_ITEM]).toBeUndefined();
    // A survey under 2026-11-07 still scores "Not available" at 25%.
    expect(scoreSurveyFor([roof("Very Poor")], "2026-11-07").categories.Safety.score).toBe(25);
    expect(scoreSurveyFor([roof("Very Poor")], RUBRIC_VERSION).categories.Safety.score).toBe(0);
  });

  it("the Roof location's answer fills the Review page's roof access", () => {
    expect(roofAccessFromLocations([roof("Good")])).toBe("Proper staircase");
    expect(roofAccessFromLocations([roof("Poor")])).toBe("Ladder");
    expect(roofAccessFromLocations([roof("Very Poor")])).toBe("None");
    expect(roofAccessFromLocations([roof("N/A")])).toBe("N/A");
    expect(roofAccessFromLocations([{ ...roof("Good"), scores: {} }])).toBe("");
  });
});

describe("W68 report: major/minor and the questionnaire table", () => {
  const source = reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!);
  const model = buildReportModel(source);

  it("major and minor scores, every minor group, every location with minor items", () => {
    expect(model.minor.major.score).not.toBeNull();
    expect(model.minor.minor.score).not.toBeNull();
    expect(model.minor.groups).toHaveLength(17);
    expect(model.groups.filter((g) => g.minor)).toHaveLength(17);
    for (const loc of model.minor.byLocation) expect(loc.items.length).toBeGreaterThan(0);
    expect(model.minor.shortcomings).toBe(1); // W71: the roof was answered "not clean" (Review page upkeep)
  });

  it("Poor and Very Poor minor ratings are counted as shortcomings, with the option label", () => {
    const shabby: ReportSource = {
      ...source,
      locations: source.locations.map((l) => (l.type === "Roof" ? { ...l, scores: { ...l.scores, [ROOF_ACCESS_ITEM]: "Very Poor" as Condition } } : l)),
    };
    const m = buildReportModel(shabby);
    expect(m.minor.shortcomings).toBe(2); // roof access None + the roof not clean
    const item = m.minor.byLocation.flatMap((l) => l.items).find((i) => i.label.startsWith("Access to roof"))!;
    expect(item).toMatchObject({ rating: "None", level: "veryPoor" });
  });

  it("questionnaire: Functionality, Safety, Aesthetics; the divisional scores add up to the overall", () => {
    const q = model.questionnaire;
    expect(q.rows.map((r) => r.division)[0]).toBe("Functionality");
    expect(q.rows).toHaveLength(RUBRIC_GROUPS.length);
    expect(q.divisions.map((d) => d.weight)).toEqual([45, 25, 30]);
    expect(q.rows.filter((r) => r.division === "Safety").reduce((s, r) => s + r.groupWeight, 0)).toBe(100);
    expect(q.total).toBeCloseTo(model.overall.score!, 6);
    const sum = q.divisions.reduce((s, d) => s + (d.contribution ?? 0), 0);
    // With N/A groups the overall re-normalises across all groups at once, so the divisions add up to it within a point.
    expect(Math.abs(sum - q.total!)).toBeLessThan(1);
    for (const r of q.rows) if (r.score !== null) expect(r.tick).not.toBeNull();
  });
});

describe("W68 School IDs: the plan tabs list School IDs, the app keys campuses by Campus ID", () => {
  // Campus 1036's unit has School ID 1424; School ID 1036 belongs to a different campus (2001).
  const grid = [
    ["Region", "Area", "Campus", "Campus ID", "School Name", "School ID", "Unit Status"],
    ["South", "A", "Sayada Zahra Alam Campus", "1036", "SZA Primary", "1424", "Active"],
    ["South", "A", "Sayada Zahra Alam Campus", "1036", "SZA Secondary", "1425", "Active"],
    ["North", "B", "GGPS Ali Garh", "2001", "GGPS Ali Garh Primary", "1036", "Active"],
  ];
  const schools = parseSchools(grid);

  it("each campus carries its units' School IDs", () => {
    expect(schools.map((s) => [s.schoolId, s.schoolIds])).toEqual([
      ["1036", ["1424", "1425"]],
      ["2001", ["1036"]],
    ]);
  });

  it("the R&M Plan marks the campus whose unit has the School ID, not the one whose Campus ID equals it", () => {
    const marked = markRmPlanned(schools, new Set(["1036"]));
    expect(marked.filter((s) => s.rmPlanned).map((s) => s.name)).toEqual(["GGPS Ali Garh"]);
  });

  it("the dashboard finds plan campuses and surveys by School ID", () => {
    const plan = parsePlan([
      { "School IDs": "1036", "E Compound No": "E1", Campus: "Ali Garh (plan name)", Region: "North", "Survey Category": "Survey with App", Assessment: "" },
      { "School IDs": "1424", "E Compound No": "E2", Campus: "SZA (plan name)", Region: "South", "Survey Category": "Survey with App", Assessment: "" },
      { "School IDs": "9999", "E Compound No": "E3", Campus: "Missing Campus", Region: "South", "Survey Category": "Survey with App", Assessment: "" },
    ]);
    const captured = { schoolId: "1036", surveyId: "s1", name: "Sayada Zahra Alam Campus", region: "South", area: "A", date: "2026-11-10", overall: 90, band: "Excellent", major: 90, minor: 90, criticalItems: {} } as CapturedSchool;
    const b = campusBreakup(plan, [captured], schools);
    expect(b.withApp.notInAppListCampuses!.map((c) => c.name)).toEqual(["Missing Campus"]);
    // The survey of campus 1036 counts for the plan row with School ID 1424, not the one with 1036.
    expect(b.withApp.surveyed).toBe(1);
    expect(b.regions?.South?.withApp.surveyed).toBe(1);
    expect(b.regions?.North?.withApp.surveyed).toBe(0);
  });
});

describe("W68 photos grouped Safety, Minor, Major, Site checks", () => {
  it("sorts by section first, then worst rating", () => {
    const source = reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!);
    const m = buildReportModel({
      ...source,
      photos: [
        { id: "site", itemName: "Roof clean", locationName: "" },
        { id: "major", itemName: "Paint", locationName: "KG A" },
        { id: "minor", itemName: "Furniture Condition", locationName: "KG A" },
        { id: "safety", itemName: "Ceiling Condition i.e. cracks & seepage", locationName: "Principal Room" },
      ],
    });
    expect(m.photos.map((p) => [p.id, p.section])).toEqual([
      ["safety", "Safety"],
      ["minor", "Minor"],
      ["major", "Major"],
      ["site", "Site"],
    ]);
  });
});
