import { describe, expect, it } from "vitest";
import { foundSurveyFromRows } from "./read-models";
import { buildReportModel, reportSourceFromFound } from "./report/model";
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from "./report/fixture-01a1911f";
import { RUBRIC_GROUPS } from "./rubric/items";
import { RUBRIC_VERSION } from "./rubric/rubric-version";
import { withDerivedScores } from "./rubric/derived";
import { scoreSurvey } from "./scoring";
import type { SurveyLocation } from "./types";

/** W66 (2026-11-10): the PDF report's model, on the acceptance fixture (survey 01a1911f). */
const found = foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!;
const source = reportSourceFromFound(found);
const model = buildReportModel(source);

describe("W66 report model — fixture 01a1911f", () => {
  it("keeps which parts were unsafe, and reads the current rubric's columns", () => {
    const principal = found.locations!.find((l) => l.name === "Principal Room")!;
    expect(principal.unsafeParts).toEqual({ "Wall/Column Condition i.e. cracks": ["Column"] });
    expect(principal.scores["Wall/Column Condition i.e. cracks"]).toBe("Very Poor");
  });

  it("shows a red banner with the unsafe ratings, the structural concern and the column crack", () => {
    expect(model.alerts).toEqual([
      "Concrete/Plaster Soundness unsafe in Exterior Facade 1",
      "Ceiling cracks/seepage unsafe in Principal Room (Ground)",
      "Wall/Column cracks unsafe in Principal Room (Ground): Column, crack > 3 mm, Schmidt Hammer 45 N/mm²",
      "Structural concern observed: YES",
    ]);
  });

  it("scores with the current rubric, exactly as the scoring engine does", () => {
    const locs = withDerivedScores(source.locations as unknown as SurveyLocation[], source.drillingCheck, source.siteChecks);
    const engine = scoreSurvey(locs);
    expect(model.rubricVersion).toBe(RUBRIC_VERSION);
    expect(model.overall.score).toBeCloseTo(engine.overall!, 6);
    expect(model.categories.map((c) => c.score)).toEqual([engine.categories.Safety.score, engine.categories.Functionality.score, engine.categories.Aesthetics.score]);
    // Re-scoring moved Safety off the stored 61 (the new derived groups count as Good here).
    expect(Math.round(model.categories[0]!.score!)).not.toBe(61);
    expect(model.flags.some((f) => f.includes(`re-scores it with the current rubric ${RUBRIC_VERSION}`))).toBe(true);
    expect(model.flags.some((f) => f.includes("Concrete/Plaster Soundness 15→12") && f.includes("Ceiling Condition i.e. cracks & seepage 20→16"))).toBe(true);
    expect(model.flags.some((f) => f.includes("overall 76%") && f.includes("Safety 61%"))).toBe(true);
  });

  it("points lost add up to what the overall score is short of 100", () => {
    const total = model.groups.reduce((s, g) => s + g.pointsLost, 0);
    expect(total).toBeCloseTo(100 - model.overall.score!, 6);
    expect(model.losses.length).toBeLessThanOrEqual(10);
    expect(model.losses.map((l) => l.pointsLost)).toEqual([...model.losses.map((l) => l.pointsLost)].sort((a, b) => b - a));
  });

  it("drilling panel: slab 150 + screed 50 = 200 mm, within both limits", () => {
    expect(model.structural.drilling.holes).toEqual([
      { label: "Hole 1", slabMm: 150, screedMm: 50, totalMm: 200, totalMeasured: false, assessment: "Ok", totalWithinLimit: true, screedWithinLimit: true },
    ]);
  });

  it("three risk factors selected", () => {
    expect(model.structural.risks.filter((r) => r.selected).map((r) => r.label)).toEqual([
      "Compromised construction quality",
      "Deteriorative environment (e.g. salinity)",
      "Plinth protection missing",
    ]);
  });

  it("line-graph flags: dotted around soundness and ceiling, solid with a marker at Wall/Column, gaps at unassessed groups", () => {
    const g = (n: string) => model.groups.find((x) => x.name === n)!;
    expect(g("Concrete/Plaster Soundness")).toMatchObject({ unsafe: true, solidWhenUnsafe: false });
    expect(g("Ceiling Condition i.e. cracks & seepage")).toMatchObject({ unsafe: true, solidWhenUnsafe: false });
    expect(g("Wall/Column Condition i.e. cracks")).toMatchObject({ unsafe: true, solidWhenUnsafe: true });
    for (const n of ["Distribution Board", "Wash Basin/Taps", "Flush Tanks", "Drinking Water Cooler & Filter", "LED/TV/UPS", "Toilet Flooring/tiles"])
      expect(g(n).score, n).toBeNull();
    expect(model.groups.map((x) => x.name)).toHaveLength(RUBRIC_GROUPS.length);
    expect(model.groups[0]!.category).toBe("Safety");
  });

  it("matrix: every recorded location is a column, floor order, blank where a group doesn't apply", () => {
    expect(model.matrix.columns.map((c) => c.name)).toEqual(["Exterior Facade 1", "External Development 1", "External Development 2", "KG A", "Principal Room", "Roof 1"]);
    const row = (n: string) => model.matrix.rows.find((r) => r.group === n)!;
    expect(row("Boundary wall").cells.map((c) => c.kind)).toEqual(["blank", "condition", "condition", "blank", "blank", "blank"]);
    expect(row("Wall/Column Condition i.e. cracks").cells[4]).toEqual({ kind: "binaryUnsafe", condition: "Very Poor", text: "Unsafe (Column)" });
    // Derived items sit on the Roof column.
    expect(row("Slab + Screeding/Waterproofing thickness assessment").cells[5]).toMatchObject({ kind: "binaryOk" });
    // Masonry applies at the facade and was recorded there.
    expect(row("Masonry").cells[0]).toMatchObject({ kind: "condition", condition: "Ok" });
  });

  it("narrative is built from the numbers", () => {
    expect(model.narrative[0]).toMatch(
      /^Overall condition is (Good|Average|Excellent) \(\d+%\), but 4 safety alerts need action: 3 safety items are rated unsafe and a structural concern was observed\. Safety scores \d+%\.$/,
    );
    expect(model.narrative[2]).toMatch(/^Principal Room \(Ground\) shows the poorest condition \(\d+%\)\.$/);
    expect(model.narrative[1]).toMatch(/^Most points were lost on .+, .+ and .+\.$/);
  });

  it("data-quality flags: blank team fields and coverage", () => {
    expect(model.flags).toContain("Team fields left blank: ASM and Principal.");
    expect(model.flags.some((f) => f.startsWith("Items covered:"))).toBe(true);
  });
});

describe("W66 report model — other cases", () => {
  it("green when nothing is unsafe; a draft and a training survey are flagged", () => {
    const clean = buildReportModel({
      ...source,
      draft: true,
      purpose: "Checking/Training",
      structuralConcern: "NO",
      submittedRubricVersion: RUBRIC_VERSION,
      locations: source.locations.map((l) => ({
        ...l,
        unsafeParts: {},
        scores: Object.fromEntries(Object.entries(l.scores).map(([k, v]) => [k, v === "Very Poor" ? "Good" : v])),
      })),
    });
    expect(clean.alerts).toEqual([]);
    expect(clean.flags[0]).toMatch(/^Draft export/);
    expect(clean.flags.some((f) => f.includes("Checking/Training"))).toBe(true);
    expect(clean.flags.some((f) => f.includes("re-scores"))).toBe(false);
  });

  it("drilling over the limits and an unsafe slab assessment raise alerts", () => {
    const m = buildReportModel({
      ...source,
      drillingCheck: { ...source.drillingCheck, totalDepthMm: "280", screedThicknessMm: "120", slabAssessment: "Unsafe" },
    });
    expect(m.structural.drilling.holes[0]).toMatchObject({ totalMm: 280, totalMeasured: true, totalWithinLimit: false, screedWithinLimit: false });
    expect(m.alerts).toContain("Slab + Screeding/Waterproofing thickness assessed Unsafe (hole 1)");
    expect(m.alerts.some((a) => a.includes("over 260 mm"))).toBe(true);
    expect(m.alerts.some((a) => a.includes("110 mm or more"))).toBe(true);
  });

  it("photos: Unsafe first, then Very Poor, captions name location, item and rating", () => {
    const m = buildReportModel({
      ...source,
      photos: [
        { id: "a", itemName: "Roof clean of dirt and vegetation", locationName: "" },
        { id: "b", itemName: "Internal Flooring condition", locationName: "KG A" },
        { id: "c", itemName: "Ceiling Condition i.e. cracks & seepage", locationName: "Principal Room" },
      ],
    });
    // W71: the roof-clean photo (answered No) is upkeep: grouped with the minor items, before major ones.
    expect(m.photos.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(m.photos[0]!.caption).toBe("Principal Room (Ground) · Ceiling Condition i.e. cracks & seepage · Unsafe");
    expect(m.structural.roof.find((r) => r.label.startsWith("Roof clean"))).toMatchObject({ bad: true, photo: true });
  });
});
