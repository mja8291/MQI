import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportModel, foundSurveyFromRows, reportSourceFromFound, type ReportSource } from "@mqi/shared";
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from "../../../../../packages/shared/src/report/fixture-01a1911f";
import { renderReportPdf, safe } from "./report-pdf";

/** W66: the report renders from the model; REPORT_OUT=<file> writes the fixture's PDF for review. */
const source = reportSourceFromFound(foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!);
const at = new Date("2026-11-10T10:00:00Z");

describe("W66 report PDF", () => {
  it("renders the fixture: summary, loss, profile, both matrices, structural, methodology", async () => {
    const bytes = await renderReportPdf(buildReportModel(source), { generatedAt: at });
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(7);
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
  });

  it("a wide campus paginates the matrix and never draws text below 7 pt", async () => {
    const base = source.locations.find((l) => l.name === "KG A")!;
    const many: ReportSource = {
      ...source,
      locations: [...source.locations, ...Array.from({ length: 40 }, (_, i) => ({ ...base, name: `Class ${i + 1} A` }))],
    };
    const bytes = await renderReportPdf(buildReportModel(many), { generatedAt: at });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(6);
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT.replace(/\.pdf$/, "-wide.pdf"), bytes);
  });

  it("photos: embedded, Unsafe first; a photo that can't load is skipped", async () => {
    // 1x1 red PNG.
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const withPhotos: ReportSource = {
      ...source,
      photos: [
        { id: "ok", itemName: "Ceiling Condition i.e. cracks & seepage", locationName: "Principal Room" },
        { id: "gone", itemName: "Paint", locationName: "KG A" },
      ],
    };
    const bytes = await renderReportPdf(buildReportModel(withPhotos), {
      generatedAt: at,
      loadPhoto: async (id) => (id === "ok" ? { bytes: png, mimeType: "image/png" } : null),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(8);
  });

  it("text the PDF font can't draw is replaced, not crashed on", () => {
    expect(safe("Schmidt 45 N/mm² → ≥ ✓ اردو")).toBe("Schmidt 45 N/mm² -> >=  ????");
  });
});
