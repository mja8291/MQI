import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildReportModel, foundSurveyFromRows, reportSourceFromFound } from "@mqi/shared";
import { FIXTURE_ROWS, FIXTURE_SURVEY_ID } from "../../../../../packages/shared/src/report/fixture-01a1911f";
import { buildReportWorkbook } from "./report-xlsx";
import { mapPool } from "./report-pdf";
import { workbookInput } from "./submitted";
import { itemPhotoHint, photoCountAdvice, spaceAdvice } from "@/lib/photo-limits";

/** W67: Excel campus report, faster PDF photo loading, photo and storage limits. */
const found = foundSurveyFromRows(FIXTURE_SURVEY_ID, FIXTURE_ROWS)!;
const model = buildReportModel(reportSourceFromFound(found));

describe("W67 Excel report", () => {
  it("has the report sheets first and the formula sheet last, and reopens", async () => {
    const started = Date.now();
    const buf = await buildReportWorkbook(model, workbookInput(found)).xlsx.writeBuffer();
    expect(Date.now() - started).toBeLessThan(5000);
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT.replace(/\.pdf$/, "") + ".xlsx", Buffer.from(buf as ArrayBuffer));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Score by group",
      "Matrix by item",
      "Matrix by location",
      "Structural",
      "Notes",
      "Single Survey - Calculated",
    ]);
    const summary = wb.getWorksheet("Summary")!;
    const texts: string[] = [];
    summary.eachRow((row) => row.eachCell((c) => texts.push(String(c.value ?? ""))));
    expect(texts).toContain("Overall MQI");
    expect(texts.some((t) => t.includes(found.campusName))).toBe(true);
    // One row per item group, and one row per location.
    expect(wb.getWorksheet("Score by group")!.actualRowCount).toBe(model.groups.length + 3);
    expect(wb.getWorksheet("Matrix by location")!.getCell(5 + model.matrix.columns.length - 1, 3).value).toBe(model.matrix.columns.at(-1)!.name);
    // The formula sheet is v1's, untouched.
    expect(wb.getWorksheet("Single Survey - Calculated")!.getCell("A1").value).toBe("Category");
  });

  it("lists photos in a Photos sheet when the survey has any", async () => {
    const withPhotos = buildReportModel({ ...reportSourceFromFound(found), photos: [{ id: "a", itemName: "Paint", locationName: "KG A" }] });
    const wb = buildReportWorkbook(withPhotos, workbookInput(found));
    expect(wb.getWorksheet("Photos")!.getCell(4, 2).value).toBe("KG A");
  });
});

describe("W67 PDF photo loading", () => {
  it("loads several at once and keeps the order", async () => {
    let running = 0;
    let most = 0;
    const out = await mapPool([5, 1, 4, 2, 3, 0], 4, async (n) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, n * 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(most).toBe(4);
  });
});

describe("W67 photo and storage limits", () => {
  it("photo count: quiet to 60, a notice past 60, a warning past 100", () => {
    expect(photoCountAdvice(60, 15e6)).toBeNull();
    expect(photoCountAdvice(61, 15e6)?.level).toBe("notice");
    expect(photoCountAdvice(101, 30e6)?.level).toBe("warn");
  });
  it("free space: quiet from 200 MB, a notice below, a warning below 50 MB", () => {
    expect(spaceAdvice(null)).toBeNull();
    expect(spaceAdvice(200)).toBeNull();
    expect(spaceAdvice(199)?.level).toBe("notice");
    expect(spaceAdvice(49)?.level).toBe("warn");
  });
  it("per item: a hint from the 4th photo", () => {
    expect(itemPhotoHint(3)).toBeNull();
    expect(itemPhotoHint(4)).toMatch(/1–3/);
  });
});
