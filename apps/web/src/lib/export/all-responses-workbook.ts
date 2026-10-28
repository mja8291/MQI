import ExcelJS from "exceljs";
import { RESPONSES_TAB } from "@mqi/shared";
import type { ExportRowsResult } from "@mqi/shared";

/**
 * FR-EXP-2: the responses tab, in the sheet's own column order (v2 reads it through
 * export.rows; v1 built the same workbook on the server).
 */
function addSheet(wb: ExcelJS.Workbook, name: string, data: Pick<ExportRowsResult, "header" | "rows">) {
  const sheet = wb.addWorksheet(name);
  if (data.rows.length === 0) {
    sheet.addRow(["No responses yet"]);
    return;
  }
  sheet.columns = data.header.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length, 12), 40) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of data.rows) sheet.addRow(data.header.map((_, i) => row[i] ?? ""));
}

export function buildAllResponsesWorkbook(responses: Pick<ExportRowsResult, "header" | "rows">): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, RESPONSES_TAB, responses);
  return wb;
}
