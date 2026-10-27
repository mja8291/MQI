import ExcelJS from "exceljs";
import type { ExportRowsResult } from "@mqi/shared";

/**
 * FR-EXP-2: both response tabs, in the sheet's own column order (v2 reads them through
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

export function buildAllResponsesWorkbook(
  method1: Pick<ExportRowsResult, "header" | "rows">,
  method2: Pick<ExportRowsResult, "header" | "rows">
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, "Method 1 Responses", method1);
  addSheet(wb, "Method 2 Responses", method2);
  return wb;
}
