import { describe, expect, it } from "vitest";
import { campusDetail, campusTracker } from "@mqi/shared";
import { buildAllResponsesWorkbook } from "./all-responses-workbook";

/** W84: Tracker, Detail and Descriptive (Tracker and Detail come worked out from the server). */
describe("exported workbook", () => {
  const header = ["Survey ID", "Timestamp", "Campus Name", "School ID", "Region", "Area", "Overall Score", "Location Name", "Floor Level", "Location Type", "Rubric Version", "Paint"];
  const rows = [["s1", "2026-11-10T05:00:00.000Z", "OGS Trust Campus", "947", "South West", "Gadap", "72", "Class 1 A", "Ground", "Classroom", "2026-11-18", "Good"]];

  it("has Tracker, Detail and Descriptive", () => {
    const detail = campusDetail(rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]!]))), [], []);
    const wb = buildAllResponsesWorkbook({ header, rows }, { detail, tracker: campusTracker(detail, []), generatedAt: "" }, new Date("2026-11-21T00:00:00Z"));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tracker", "Detail", "Descriptive"]);
    const sheet = wb.getWorksheet("Detail")!;
    expect(sheet.getRow(1).getCell(3).value).toBe("Campus");
    expect(sheet.getRow(2).getCell(3).value).toBe("OGS Trust Campus");
  });

  it("without the server's summary, still every response under Descriptive", () => {
    const wb = buildAllResponsesWorkbook({ header, rows }, null);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Descriptive"]);
    expect(wb.getWorksheet("Descriptive")!.rowCount).toBe(2);
  });
});
