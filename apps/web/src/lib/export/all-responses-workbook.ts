import ExcelJS from "exceljs";
import { CRITICAL_ITEMS, DETAIL_ITEM_GROUPS, RUBRIC_GROUPS, itemLabel } from "@mqi/shared";
import type { CampusDetailRow, ExportRowsResult, ExportSummaryResult, RatingBand, Tracker, TrackerLine } from "@mqi/shared";

/**
 * FR-EXP-2, W84: the exported workbook.
 *  - Tracker: a dashboard-like summary (campus plan progress by zone, region and surveyor; safety; bands).
 *  - Detail: one campus per row (latest App survey, or the plan's Safe/Unsafe for campuses done without
 *    the App) with every aggregated score, critical item, structural, risk and safety field, and each item
 *    group's standing.
 *  - Descriptive: the responses tab as it is (one row per surveyed location), as before.
 */

const NAVY = "FF123D24";
const HEAD: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E5C4D" } },
  alignment: { vertical: "middle", horizontal: "center", wrapText: true },
  border: { bottom: { style: "thin", color: { argb: "FFDDE5D9" } } },
};
const BAND_FILL: Record<RatingBand, string> = { Excellent: "FF0E5C4D", Good: "FF3D8F6B", Average: "FFC97A2E", Poor: "FFB23A3A" };
const SAFETY_FILL: Record<string, string> = { "Critically Unsafe": "FFB91C1C", "Partially Unsafe": "FFDC6803", Unsafe: "FFB91C1C" };
const BANDS: RatingBand[] = ["Excellent", "Good", "Average", "Poor"];

const round = (n: number | null) => (n === null ? "" : Math.round(n * 10) / 10);

function header(ws: ExcelJS.Worksheet, row: number, labels: string[], startCol = 1) {
  const r = ws.getRow(row);
  labels.forEach((l, i) => {
    const c = r.getCell(startCol + i);
    c.value = l;
    c.style = HEAD;
  });
  r.height = 32;
}

function title(ws: ExcelJS.Worksheet, row: number, text: string) {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 12, color: { argb: NAVY } };
}

// ---- Tracker ----

function trackerLines(ws: ExcelJS.Worksheet, start: number, first: string, lines: TrackerLine[], total: TrackerLine | null): number {
  const cols = [first, "Zone", "In plan", "Survey with App (target)", "Surveyed with App", "% of target", "Pending", "Done without App", "Exempt / deducted", "Critically unsafe", "Partially unsafe", "Unsafe (without App)", ...BANDS, "Average MQI %"];
  header(ws, start, cols);
  let r = start + 1;
  for (const l of [...lines, ...(total ? [total] : [])]) {
    const isTotal = l === total;
    ws.getRow(r).values = [
      l.name,
      l.zone,
      l.planned,
      l.target,
      l.surveyedApp,
      l.target ? Math.round(l.percentDone) / 100 : "",
      l.pending,
      l.withoutApp,
      l.exempt,
      l.critical,
      l.partial,
      l.unsafeWithoutApp,
      ...BANDS.map((b) => l.bands[b]),
      round(l.averageMqi),
    ];
    ws.getCell(r, 6).numFmt = "0%";
    if (l.critical) ws.getCell(r, 10).font = { bold: true, color: { argb: SAFETY_FILL["Critically Unsafe"] } };
    if (l.partial) ws.getCell(r, 11).font = { bold: true, color: { argb: SAFETY_FILL["Partially Unsafe"] } };
    if (isTotal) {
      ws.getRow(r).font = { bold: true };
      ws.getRow(r).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F4EE" } }));
    }
    r++;
  }
  return r + 1;
}

function trackerSheet(wb: ExcelJS.Workbook, t: Tracker, generated: Date) {
  const ws = wb.addWorksheet("Tracker", { views: [{ showGridLines: false }] });
  ws.getCell("A1").value = "MQI survey — tracker";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.getCell("A2").value = `Report date: ${generated.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · from the App's surveys and the Campus Survey Plan · each campus counted once (its latest survey; training surveys left out)`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF4B5C50" } };

  // KPI tiles.
  const k = t.totals;
  const tiles: [string, string | number, string, string][] = [
    ["Campuses in plan", k.planned, `${k.target} to survey with App`, "FF123D24"],
    ["Surveyed with App", k.surveyedApp, `${Math.round(k.percentDone)}% of target`, "FF0E5C4D"],
    ["Pending", k.pending, "of the App target", "FF475467"],
    ["Done without App", k.withoutApp, `${k.unsafeWithoutApp} unsafe`, "FF155EEF"],
    ["Exempt / deducted", k.exempt, "last 5 years, PSSP/PSRP", "FF667085"],
    ["Critically unsafe", k.critical, "App surveys", "FFB91C1C"],
    ["Partially unsafe", k.partial, "App surveys", "FFDC6803"],
    ["Average MQI", k.averageMqi === null ? "—" : `${Math.round(k.averageMqi)}%`, "App surveys", "FF3D8F6B"],
  ];
  tiles.forEach(([label, value, sub, colour], i) => {
    const col = 1 + i * 2;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 5, col + 1);
    ws.mergeCells(6, col, 6, col + 1);
    const fill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: colour } };
    for (const [r, v, size, bold] of [
      [4, label, 10, true],
      [5, value, 20, true],
      [6, sub, 9, false],
    ] as const) {
      const c = ws.getCell(r, col);
      c.value = v;
      c.fill = fill;
      c.font = { bold, size, color: { argb: "FFFFFFFF" } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    }
  });
  ws.getRow(5).height = 30;

  let r = 8;
  title(ws, r, "Zone-wise summary");
  r = trackerLines(ws, r + 1, "Zone", t.zones, t.totals);
  title(ws, r, "Region-wise summary");
  r = trackerLines(ws, r + 1, "Region", t.regions, t.totals);

  title(ws, r, "Surveyor-wise summary");
  header(ws, r + 1, ["Surveyor", "Campuses surveyed", "Average MQI %", "Critically unsafe", "Partially unsafe"]);
  r += 2;
  for (const s of t.surveyors) {
    ws.getRow(r).values = [s.name, s.surveys, round(s.averageMqi), s.critical, s.partial];
    r++;
  }
  r++;
  title(ws, r, "Campuses surveyed per week");
  header(ws, r + 1, ["Week", "Campuses surveyed"]);
  r += 2;
  for (const w of t.weeks) {
    ws.getRow(r).values = [w.week, w.surveys];
    r++;
  }
  ws.getColumn(1).width = 26;
  for (let c = 2; c <= 17; c++) ws.getColumn(c).width = 13;
}

// ---- Detail ----

const DETAIL_COLS: { head: string; get: (d: CampusDetailRow) => string | number; width?: number; pct?: boolean }[] = [
  { head: "Source", get: (d) => d.source, width: 16 },
  { head: "Campus ID", get: (d) => d.campusId, width: 10 },
  { head: "Campus", get: (d) => d.campus, width: 34 },
  { head: "Zone", get: (d) => d.zone },
  { head: "Region", get: (d) => d.region },
  { head: "Area", get: (d) => d.area, width: 18 },
  { head: "Cluster", get: (d) => d.cluster, width: 16 },
  { head: "School IDs", get: (d) => d.schoolIds },
  { head: "Unit IDs", get: (d) => d.unitIds },
  { head: "E-compound no.", get: (d) => d.eCompoundNo },
  { head: "E-compound", get: (d) => d.eCompound, width: 26 },
  { head: "School type", get: (d) => d.schoolType, width: 18 },
  { head: "Programme · sub programme", get: (d) => d.programme, width: 18 },
  { head: "Build donor", get: (d) => d.buildDonor, width: 22 },
  { head: "Build year (established)", get: (d) => d.established },
  { head: "Plan category", get: (d) => d.planCategory, width: 18 },
  { head: "Safety status", get: (d) => d.safetyStatus, width: 16 },
  { head: "Unsafe items", get: (d) => d.unsafeItems, width: 30 },
  { head: "Overall MQI %", get: (d) => round(d.overall), pct: true },
  { head: "Rating band", get: (d) => d.band },
  { head: "Functionality %", get: (d) => round(d.functionality), pct: true },
  { head: "Safety %", get: (d) => round(d.safety), pct: true },
  { head: "Aesthetics %", get: (d) => round(d.aesthetics), pct: true },
  { head: "Major items %", get: (d) => round(d.major), pct: true },
  { head: "Minor items %", get: (d) => round(d.minor), pct: true },
  ...CRITICAL_ITEMS.map((c) => ({ head: `Critical: ${c} %`, get: (d: CampusDetailRow) => round(d.critical[c] ?? null), pct: true })),
  { head: "Structural concern observed", get: (d) => d.structuralConcern },
  { head: "Suggested structural type", get: (d) => d.suggestedStructure },
  { head: "Type of structure (visual)", get: (d) => d.structureType },
  { head: "Center beam in classrooms", get: (d) => d.centerBeam },
  { head: "Drilling check done", get: (d) => d.drillingDone },
  { head: "Slab thickness assessment", get: (d) => d.slabAssessment, width: 20 },
  { head: "Roof access", get: (d) => d.roofAccess },
  { head: "Overflow disposal", get: (d) => d.overflowDisposal },
  { head: "Roof clean", get: (d) => d.roofClean },
  { head: "Rain spouts clear", get: (d) => d.rainSpoutsClear },
  { head: "Building risk factors", get: (d) => d.riskFactors, width: 30 },
  { head: "Items covered %", get: (d) => round(d.itemsCovered), pct: true },
  ...DETAIL_ITEM_GROUPS.map((name) => {
    const g = RUBRIC_GROUPS.find((x) => x.name === name)!;
    return { head: `${itemLabel(g)} (${g.category}) %`, get: (d: CampusDetailRow) => round(d.items[name] ?? null), pct: true };
  }),
  { head: "Survey date", get: (d) => d.surveyDate },
  { head: "Surveyed by", get: (d) => d.surveyedBy, width: 18 },
  { head: "Rubric version", get: (d) => d.rubricVersion },
  { head: "Survey ID", get: (d) => d.surveyId, width: 38 },
];

function detailSheet(wb: ExcelJS.Workbook, rows: CampusDetailRow[]) {
  const ws = wb.addWorksheet("Detail", { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
  header(ws, 1, DETAIL_COLS.map((c) => c.head));
  ws.getRow(1).height = 60;
  DETAIL_COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? 12));
  const safetyCol = DETAIL_COLS.findIndex((c) => c.head === "Safety status") + 1;
  const bandCol = DETAIL_COLS.findIndex((c) => c.head === "Rating band") + 1;
  rows.forEach((d, i) => {
    const r = ws.getRow(i + 2);
    r.values = DETAIL_COLS.map((c) => c.get(d));
    const fill = SAFETY_FILL[d.safetyStatus];
    if (fill) {
      const c = r.getCell(safetyCol);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
    if (d.band) {
      const c = r.getCell(bandCol);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL[d.band] } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
    if (d.source !== "MQI App") r.font = { italic: true, color: { argb: "FF475467" } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DETAIL_COLS.length } };
}

// ---- Descriptive (the responses tab as it is) ----

function descriptiveSheet(wb: ExcelJS.Workbook, data: Pick<ExportRowsResult, "header" | "rows">) {
  const sheet = wb.addWorksheet("Descriptive", { views: [{ state: "frozen", ySplit: 1 }] });
  if (data.rows.length === 0) {
    sheet.addRow(["No responses yet"]);
    return;
  }
  sheet.columns = data.header.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length, 12), 40) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of data.rows) sheet.addRow(data.header.map((_, i) => row[i] ?? ""));
}

/**
 * W84: Tracker and Detail come worked out from the server (export.summary); the phone only writes them.
 * Without a summary (an older server, or busy) the file still has every response under Descriptive.
 */
export function buildAllResponsesWorkbook(
  responses: Pick<ExportRowsResult, "header" | "rows">,
  summary: ExportSummaryResult | null = null,
  generated = new Date(),
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TCF MQI App";
  if (summary) {
    trackerSheet(wb, summary.tracker, generated);
    detailSheet(wb, summary.detail);
  }
  descriptiveSheet(wb, responses);
  return wb;
}
