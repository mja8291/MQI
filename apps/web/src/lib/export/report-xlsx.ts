import type ExcelJS from "exceljs";
import {
  CATEGORY_WEIGHT,
  REPORT_BAND_COLOR,
  REPORT_BRAND,
  REPORT_CATEGORY_COLOR,
  REPORT_CELL,
  REPORT_THRESHOLDS,
  PHOTO_SECTIONS,
  type ReportCell,
  type ReportModel,
} from "@mqi/shared";
import { buildSingleSurveyWorkbook, type SingleSurveyExportInput } from "./single-survey-workbook";

/**
 * W67: the Excel download as a campus report, built from the same model as the PDF
 * (packages/shared/src/report/model.ts, current rubric). Sheets: Summary, Score by group, Matrix
 * by item, Matrix by location, Structural, Photos, Notes; then v1's "Single Survey - Calculated"
 * sheet (live formulas, the rubric the survey was submitted under) for checking the arithmetic.
 * No photos are loaded, so it builds in a moment, even offline.
 */

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: argb(REPORT_BRAND.rule) } },
  left: { style: "thin", color: { argb: argb(REPORT_BRAND.rule) } },
  bottom: { style: "thin", color: { argb: argb(REPORT_BRAND.rule) } },
  right: { style: "thin", color: { argb: argb(REPORT_BRAND.rule) } },
};
const pct = (n: number | null) => (n === null ? "—" : Math.round(n * 10) / 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

function title(ws: ExcelJS.Worksheet, text: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.fill = fill(REPORT_BRAND.navy);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { italic: true, size: 9, color: { argb: argb(REPORT_BRAND.inkSoft) } };
}

function headerRow(ws: ExcelJS.Worksheet, r: number, labels: string[]) {
  const row = ws.getRow(r);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(REPORT_BRAND.teal);
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = thin;
  });
  row.height = 30;
}

function bandCell(c: ExcelJS.Cell, band: string | null) {
  if (!band) return;
  const color = REPORT_BAND_COLOR[band as keyof typeof REPORT_BAND_COLOR];
  if (color) c.font = { bold: true, color: { argb: argb(color) } };
}

function styleMatrixCell(c: ExcelJS.Cell, cell: ReportCell) {
  const style =
    cell.kind === "condition" && cell.condition
      ? REPORT_CELL[cell.condition]
      : cell.kind === "binaryOk"
        ? REPORT_CELL.binaryOk
        : cell.kind === "binaryUnsafe"
          ? REPORT_CELL.binaryUnsafe
          : cell.kind === "na"
            ? REPORT_CELL.na
            : cell.kind === "unrecorded"
              ? REPORT_CELL.unrecorded
              : null;
  c.value = cell.text || (cell.kind === "blank" ? "" : style?.label ?? "");
  c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  c.border = thin;
  if (style && cell.kind !== "blank") {
    c.fill = fill(style.fill);
    c.font = { size: 9, bold: cell.kind === "binaryUnsafe" || cell.condition === "Very Poor", color: { argb: argb(style.text) } };
  } else {
    c.fill = fill(REPORT_BRAND.panel);
  }
}

function summarySheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 26 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 40 }];
  title(ws, `MQI campus report — ${m.header.campusName}`, `Scored with rubric ${m.rubricVersion}${m.header.draft ? " · DRAFT (not submitted)" : ""}`, 5);
  let r = 4;
  const kv = (k: string, v: string) => {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.inkSoft) } };
    ws.mergeCells(r, 2, r, 5);
    ws.getCell(r, 2).value = v || "—";
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    r++;
  };
  const h = m.header;
  kv("Region · Area", h.regionArea);
  kv("Survey ID", h.surveyId);
  kv("Date", h.date);
  kv("Method", h.method);
  kv("Surveyed by", h.staff);
  kv("ASM", h.asm);
  kv("Principal", h.principal);
  kv("Start", h.start);
  kv("Finish", h.finish);
  kv("Time taken", h.timeTaken);
  kv("Items covered", h.itemsCovered);
  r++;

  // Safety first, whatever the score (as in the PDF).
  ws.mergeCells(r, 1, r, 5);
  const sa = ws.getCell(r, 1);
  sa.value = m.alerts.length ? `SAFETY ALERTS (${m.alerts.length})` : "No safety alerts";
  sa.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sa.fill = fill(m.alerts.length ? REPORT_CATEGORY_COLOR.Safety : REPORT_BAND_COLOR.Excellent);
  r++;
  for (const a of m.alerts) {
    ws.mergeCells(r, 1, r, 5);
    const c = ws.getCell(r, 1);
    c.value = `⚠ ${a}`;
    c.font = { color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) }, bold: true };
    c.alignment = { wrapText: true };
    r++;
  }
  r++;

  headerRow(ws, r, ["Score", "Score %", "Band", "Weight %", ""]);
  r++;
  const scoreRow = (label: string, score: number | null, band: string | null, weight: string, big = false) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, size: big ? 13 : 11 };
    const s = ws.getCell(r, 2);
    s.value = pct(score);
    s.numFmt = "0.0";
    s.font = { bold: true, size: big ? 13 : 11 };
    const b = ws.getCell(r, 3);
    b.value = band ?? "—";
    bandCell(b, band);
    ws.getCell(r, 4).value = weight;
    for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = thin;
    r++;
  };
  scoreRow("Overall MQI", m.overall.score, m.overall.band, "100", true);
  for (const c of m.categories) scoreRow(c.category, c.score, c.band, String(c.weight));
  r++;

  if (m.narrative.length) {
    ws.getCell(r, 1).value = "Summary";
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.teal) } };
    r++;
    for (const n of m.narrative) {
      ws.mergeCells(r, 1, r, 5);
      const c = ws.getCell(r, 1);
      c.value = n;
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = Math.max(15, Math.ceil(n.length / 110) * 15);
      r++;
    }
    r++;
  }
  if (m.losses.length) {
    ws.getCell(r, 1).value = "Most points lost";
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.teal) } };
    r++;
    for (const l of m.losses) {
      ws.mergeCells(r, 1, r, 3);
      ws.getCell(r, 1).value = l.label;
      ws.getCell(r, 4).value = round1(l.pointsLost);
      ws.getCell(r, 4).numFmt = "0.0";
      ws.getCell(r, 5).value = l.category;
      ws.getCell(r, 5).font = { color: { argb: argb(REPORT_CATEGORY_COLOR[l.category]) } };
      r++;
    }
    r++;
  }
  if (m.strengths.length) {
    ws.getCell(r, 1).value = "Strengths";
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.teal) } };
    r++;
    for (const s of m.strengths) {
      ws.mergeCells(r, 1, r, 5);
      ws.getCell(r, 1).value = `${s.label} (${s.category}, weight ${s.weight}%)`;
      r++;
    }
    r++;
  }
  if (m.complaints) {
    ws.getCell(r, 1).value = "Complaints / remarks";
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.teal) } };
    r++;
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = m.complaints;
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(15, Math.ceil(m.complaints.length / 110) * 15);
  }
}

function groupsSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = wb.addWorksheet("Score by group", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = [{ width: 14 }, { width: 44 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 11 }, { width: 40 }];
  title(ws, "Score by item group", `Rubric ${m.rubricVersion}. Points lost add up to 100 − overall. Safety takes the worst location; the rest the average.`, 9);
  headerRow(ws, 3, ["Category", "Item group", "Weight in category %", "Effective weight %", "Combined by", "Rating", "Score %", "Points lost", "Note"]);
  let r = 4;
  for (const g of m.groups) {
    const row = ws.getRow(r);
    row.getCell(1).value = g.category;
    row.getCell(1).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR[g.category]) } };
    row.getCell(2).value = g.minor ? `${g.label} *` : g.label;
    row.getCell(3).value = g.weight;
    row.getCell(4).value = round1((g.weight * CATEGORY_WEIGHT[g.category]) / 100);
    row.getCell(5).value = g.aggregation === "worst" ? "Worst location" : "Average";
    row.getCell(6).value = g.ratingLabel;
    bandCell(row.getCell(6), g.band);
    if (g.unsafe) {
      row.getCell(6).fill = fill(REPORT_CELL.binaryUnsafe.fill);
      row.getCell(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
    row.getCell(7).value = pct(g.score);
    row.getCell(7).numFmt = "0.0";
    row.getCell(8).value = round1(g.pointsLost);
    row.getCell(8).numFmt = "0.0";
    row.getCell(9).value = g.statusNote;
    row.getCell(9).alignment = { wrapText: true };
    for (let c = 1; c <= 9; c++) row.getCell(c).border = thin;
    r++;
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: r - 1, column: 9 } };
}

function matrixByItemSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const cols = m.matrix.columns;
  const ws = wb.addWorksheet("Matrix by item", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
  ws.getColumn(1).width = 13;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 10;
  cols.forEach((_, i) => (ws.getColumn(i + 4).width = 13));
  title(ws, "Condition matrix by item", "Each column is a location; Total is the combined campus score of the item group.", Math.max(4, cols.length + 3));
  const floors = ws.getRow(3);
  const types = ws.getRow(4);
  const names = ws.getRow(5);
  ["", "", ""].forEach((_, i) => {
    floors.getCell(i + 1).value = i === 0 ? "Floor" : "";
    types.getCell(i + 1).value = i === 0 ? "Type" : "";
  });
  names.getCell(1).value = "Category";
  names.getCell(2).value = "Item group";
  names.getCell(3).value = "Total %";
  cols.forEach((c, i) => {
    floors.getCell(i + 4).value = c.floor;
    types.getCell(i + 4).value = c.typeLabel;
    names.getCell(i + 4).value = c.name;
  });
  for (const row of [floors, types, names]) {
    for (let k = 1; k <= cols.length + 3; k++) {
      const c = row.getCell(k);
      c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      c.fill = fill(row === names ? REPORT_BRAND.teal : REPORT_BRAND.navy);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = thin;
    }
  }
  names.height = 30;
  const byName = new Map(m.groups.map((g) => [g.name, g]));
  let r = 6;
  for (const mr of m.matrix.rows) {
    const g = byName.get(mr.group);
    const row = ws.getRow(r);
    row.getCell(1).value = g?.category ?? "";
    if (g) row.getCell(1).font = { bold: true, size: 9, color: { argb: argb(REPORT_CATEGORY_COLOR[g.category]) } };
    row.getCell(2).value = g?.label ?? mr.group;
    row.getCell(2).alignment = { wrapText: true, vertical: "middle" };
    const t = row.getCell(3);
    t.value = pct(g?.score ?? null);
    t.numFmt = "0";
    bandCell(t, g?.band ?? null);
    t.alignment = { horizontal: "center" };
    for (let k = 1; k <= 3; k++) row.getCell(k).border = thin;
    mr.cells.forEach((cell, i) => styleMatrixCell(row.getCell(i + 4), cell));
    r++;
  }
  // The location scores under the matrix.
  const sr = ws.getRow(r);
  sr.getCell(2).value = "Location score %";
  sr.getCell(2).font = { bold: true };
  cols.forEach((c, i) => {
    const cell = sr.getCell(i + 4);
    cell.value = pct(c.score);
    cell.numFmt = "0";
    cell.alignment = { horizontal: "center" };
    bandCell(cell, c.band);
    cell.border = thin;
  });
}

function matrixByLocationSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const cols = m.matrix.columns;
  const rows = m.matrix.rows;
  const byName = new Map(m.groups.map((g) => [g.name, g]));
  const ws = wb.addWorksheet("Matrix by location", { views: [{ state: "frozen", xSplit: 4, ySplit: 4 }] });
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 10;
  rows.forEach((_, i) => (ws.getColumn(i + 5).width = 12));
  title(ws, "Condition matrix by location", "Every location is a row; columns are item groups (Safety, Functionality, Aesthetics).", Math.max(5, rows.length + 4));
  const cat = ws.getRow(3);
  const head = ws.getRow(4);
  ["Floor", "Type", "Location", "Score %"].forEach((l, i) => {
    head.getCell(i + 1).value = l;
  });
  rows.forEach((mr, i) => {
    const g = byName.get(mr.group);
    cat.getCell(i + 5).value = g?.category ?? "";
    cat.getCell(i + 5).fill = fill(g ? REPORT_CATEGORY_COLOR[g.category] : REPORT_BRAND.navy);
    head.getCell(i + 5).value = g?.label ?? mr.group;
  });
  for (let k = 1; k <= rows.length + 4; k++) {
    const c = head.getCell(k);
    c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    c.fill = fill(REPORT_BRAND.teal);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true, textRotation: k > 4 ? 90 : 0 };
    c.border = thin;
    const cc = cat.getCell(k);
    cc.font = { bold: true, size: 8, color: { argb: "FFFFFFFF" } };
    cc.alignment = { horizontal: "center" };
    if (k <= 4) cc.fill = fill(REPORT_BRAND.navy);
  }
  head.height = 150;
  cols.forEach((c, j) => {
    const row = ws.getRow(5 + j);
    row.getCell(1).value = c.floor;
    row.getCell(2).value = c.typeLabel;
    row.getCell(3).value = c.name;
    const s = row.getCell(4);
    s.value = pct(c.score);
    s.numFmt = "0";
    bandCell(s, c.band);
    for (let k = 1; k <= 4; k++) row.getCell(k).border = thin;
    rows.forEach((mr, i) => styleMatrixCell(row.getCell(i + 5), mr.cells[j] ?? { kind: "blank", text: "" }));
  });
}

function structuralSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const s = m.structural;
  const ws = wb.addWorksheet("Structural", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 22 }];
  title(ws, "Structural checks", `Guidelines: total depth ≤ ${REPORT_THRESHOLDS.totalDepthMm} mm, screed < ${REPORT_THRESHOLDS.screedMm} mm, column crack ≤ ${REPORT_THRESHOLDS.crackMm} mm.`, 6);
  let r = 4;
  const section = (t: string) => {
    ws.mergeCells(r, 1, r, 6);
    const c = ws.getCell(r, 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(REPORT_BRAND.navy);
    r++;
  };
  const kv = (k: string, v: string, bad = false) => {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { bold: true, color: { argb: argb(REPORT_BRAND.inkSoft) } };
    ws.mergeCells(r, 2, r, 6);
    ws.getCell(r, 2).value = v || "—";
    if (bad) ws.getCell(r, 2).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) } };
    r++;
  };
  section("Building");
  for (const b of s.building) kv(b.label, b.value);
  r++;
  section("Drilling");
  kv("Drilling done", s.drilling.done);
  kv("Point marked", s.drilling.pointMarked);
  kv("Hole repaired", s.drilling.holeRepaired);
  kv("Measurements typed in", s.drilling.unitTyped);
  if (s.drilling.holes.length) {
    headerRow(ws, r, ["Hole", "Slab mm", "Screed mm", "Total mm", "Assessment", "Within guideline"]);
    r++;
    for (const hl of s.drilling.holes) {
      const row = ws.getRow(r);
      row.getCell(1).value = hl.label;
      row.getCell(2).value = hl.slabMm ?? "—";
      row.getCell(3).value = hl.screedMm ?? "—";
      row.getCell(4).value = hl.totalMm === null ? "—" : hl.totalMeasured ? hl.totalMm : `${hl.totalMm} (slab + screed)`;
      row.getCell(5).value = hl.assessment || "—";
      const ok = hl.totalWithinLimit !== false && hl.screedWithinLimit !== false;
      row.getCell(6).value = hl.totalWithinLimit === null && hl.screedWithinLimit === null ? "—" : ok ? "Yes" : "No";
      if (!ok) {
        row.getCell(6).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) } };
        if (hl.screedWithinLimit === false) row.getCell(3).fill = fill(REPORT_CELL["Very Poor"].fill);
        if (hl.totalWithinLimit === false) row.getCell(4).fill = fill(REPORT_CELL["Very Poor"].fill);
      }
      if (/unsafe/i.test(hl.assessment)) row.getCell(5).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) } };
      for (let k = 1; k <= 6; k++) row.getCell(k).border = thin;
      r++;
    }
  }
  r++;
  if (s.columns.length) {
    section("Wall/Column checks");
    headerRow(ws, r, ["Location", "Unsafe parts", `Crack > ${REPORT_THRESHOLDS.crackMm} mm`, "Schmidt Hammer", "Reading (N/mm²)", ""]);
    r++;
    for (const c of s.columns) {
      const row = ws.getRow(r);
      [c.location, c.parts, c.crackOver3mm, c.hammerAvailable, c.reading].forEach((v, i) => {
        row.getCell(i + 1).value = v || "—";
        row.getCell(i + 1).border = thin;
        if (c.highlight) row.getCell(i + 1).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) } };
      });
      r++;
    }
    r++;
  }
  section("Roof and site");
  for (const x of s.roof) kv(x.label, `${x.value}${x.photo ? " (photo)" : ""}`, x.bad);
  r++;
  section("Building risk factors");
  for (const k of s.risks) kv(k.label, k.selected ? "Yes" : "—", k.selected);
  if (s.riskOther) kv("Other", s.riskOther, true);
}

function photosSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  if (!m.photos.length) return;
  const ws = wb.addWorksheet("Photos", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 44 }, { width: 60 }, { width: 40 }];
  title(ws, `Photo evidence (${m.photos.length})`, "Photos are in the PDF report and in the survey's Drive folder. Grouped Safety, Minor (*), Major, Site checks; Unsafe and Very Poor first in each.", 5);
  headerRow(ws, 3, ["#", "Location", "Item", "Caption", "Section"]);
  m.photos.forEach((p, i) => {
    const row = ws.getRow(4 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = p.locationName || "Site / roof";
    row.getCell(3).value = p.itemName;
    row.getCell(4).value = p.caption;
    row.getCell(5).value = PHOTO_SECTIONS.find((x) => x.section === p.section)?.title ?? "";
    if (p.severity <= 1) for (let k = 1; k <= 5; k++) row.getCell(k).font = { bold: true, color: { argb: argb(REPORT_CATEGORY_COLOR.Safety) } };
    for (let k = 1; k <= 5; k++) row.getCell(k).border = thin;
  });
}

function notesSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = wb.addWorksheet("Notes", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 120 }];
  title(ws, "Method and data quality", `Rubric ${m.rubricVersion}${m.submittedRubricVersion !== m.rubricVersion ? ` (submitted under ${m.submittedRubricVersion})` : ""}`, 1);
  const lines: [string, boolean][] = [
    ["Rating scale", true],
    ["Good 100% · Ok 75% · Poor 50% · Very Poor 25% · N/A is left out and the remaining weights re-normalise.", false],
    ["Two-answer items (OK/Unsafe, Available/Not available, Yes/No) score 100% and 25%.", false],
    ["Combining locations", true],
    ["Safety groups take the worst rating at any location; Functionality and Aesthetics take the average.", false],
    ["Overall MQI = 0.45 × Functionality + 0.25 × Safety + 0.30 × Aesthetics (weight = category weight × group weight).", false],
    ["Bands: Poor below 50% · Average 50–67% · Good 67–84% · Excellent 84% and above.", false],
    ["This file", true],
    ["Summary, Score by group and both matrices use the current rubric, like the PDF report. The last sheet, “Single Survey - Calculated”, keeps live formulas with the rubric the survey was submitted under.", false],
    ["Data quality", true],
    ...(m.flags.length ? m.flags.map((f): [string, boolean] => [`• ${f}`, false]) : [["No data-quality issues found.", false] as [string, boolean]]),
  ];
  lines.forEach(([t, head], i) => {
    const c = ws.getCell(4 + i, 1);
    c.value = t;
    c.alignment = { wrapText: true, vertical: "top" };
    if (head) c.font = { bold: true, color: { argb: argb(REPORT_BRAND.teal) } };
  });
}

/** W68: major vs minor ("*") items, and every location's minor items with Poor and worse highlighted. */
function minorSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const mi = m.minor;
  const ws = wb.addWorksheet("Major and minor", { views: [{ state: "frozen", ySplit: 0 }] });
  ws.columns = [{ width: 42 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }];
  title(ws, "Major and minor items", "Minor (*) items are maintained by the school itself; major items by the Engineering Department. Same scoring, each set on its own.", 9);
  headerRow(ws, 4, ["Set", "Score %", "Band", "", "", "", "", "", ""]);
  const scoreLine = (r: number, label: string, score: number | null, band: string | null) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = pct(score);
    ws.getCell(r, 2).numFmt = "0.0";
    ws.getCell(r, 3).value = band ?? "—";
    bandCell(ws.getCell(r, 3), band);
  };
  scoreLine(5, "Major items (Engineering Department)", mi.major.score, mi.major.band);
  scoreLine(6, "Minor items * (maintained by the school)", mi.minor.score, mi.minor.band);
  ws.getCell(7, 1).value = `Minor shortcomings (Poor or Very Poor, all locations): ${mi.shortcomings}`;
  ws.getCell(7, 1).font = { bold: true, color: { argb: argb(mi.shortcomings ? REPORT_CATEGORY_COLOR.Safety : REPORT_BAND_COLOR.Excellent) } };

  headerRow(ws, 9, ["Minor item *", "Category", "Campus score %", "Very Poor", "Poor", "Ok", "Good", "N/A", "Not recorded"]);
  let r = 10;
  for (const g of mi.groups) {
    const row = ws.getRow(r);
    row.getCell(1).value = `${g.label} *`;
    row.getCell(2).value = g.category;
    row.getCell(2).font = { color: { argb: argb(REPORT_CATEGORY_COLOR[g.category]) } };
    row.getCell(3).value = pct(g.score);
    row.getCell(3).numFmt = "0.0";
    bandCell(row.getCell(3), g.band);
    const counts = [g.counts.veryPoor, g.counts.poor, g.counts.ok, g.counts.good, g.counts.na, g.counts.unrecorded];
    counts.forEach((n, i) => {
      const c = row.getCell(4 + i);
      c.value = n || "";
      c.alignment = { horizontal: "center" };
      if (n && i < 2) {
        c.fill = fill(i === 0 ? REPORT_CELL["Very Poor"].fill : REPORT_CELL.Poor.fill);
        c.font = { bold: true, color: { argb: argb(i === 0 ? REPORT_CELL["Very Poor"].text : REPORT_CELL.Poor.text) } };
      }
    });
    for (let k = 1; k <= 9; k++) row.getCell(k).border = thin;
    r++;
  }

  r += 1;
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value = "Minor items by location (Poor and Very Poor highlighted)";
  ws.getCell(r, 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(r, 1).fill = fill(REPORT_BRAND.navy);
  r++;
  headerRow(ws, r, ["Location", "Minor score %", "Minor item *", "Rating", "", "", "", "", ""]);
  r++;
  for (const loc of mi.byLocation) {
    const first = r;
    for (const it of loc.items) {
      const row = ws.getRow(r);
      row.getCell(1).value = r === first ? loc.label : "";
      row.getCell(1).font = { bold: true };
      if (r === first) {
        row.getCell(2).value = pct(loc.score);
        row.getCell(2).numFmt = "0";
      }
      row.getCell(3).value = it.label;
      const c = row.getCell(4);
      c.value = it.rating;
      if (it.level === "veryPoor" || it.level === "poor") {
        const st = it.level === "veryPoor" ? REPORT_CELL["Very Poor"] : REPORT_CELL.Poor;
        c.fill = fill(st.fill);
        c.font = { bold: true, color: { argb: argb(st.text) } };
        row.getCell(3).font = { bold: true };
      } else if (it.level === "ok") c.fill = fill(REPORT_CELL.Ok.fill);
      for (const k of [1, 2, 3, 4]) row.getCell(k).border = thin;
      r++;
    }
  }
  ws.getColumn(3).width = 40;
}

/** W68: the pre-App "ACM individual form" table. */
function questionnaireSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const q = m.questionnaire;
  const ws = wb.addWorksheet("Questionnaire", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = [{ width: 14 }, { width: 6 }, { width: 44 }, { width: 7 }, { width: 7 }, { width: 7 }, { width: 9 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 10 }];
  title(ws, "Survey questionnaire and scoring mechanism", "In the format of the pre-App reports. The rating ticked is the one nearest the item's combined campus score. * = minor item, maintained by the school.", 14);
  headerRow(ws, 3, ["Work division", "S. No", "Item group", "Good", "Ok", "Poor", "Very Poor", "Score", "Divisional weightage", "Category weightage", "Cumulative weightage", "Scored weightage", "Divisional score", "Total score"]);
  let r = 4;
  const startOf = new Map<string, number>();
  for (const row of q.rows) {
    if (!startOf.has(row.division)) startOf.set(row.division, r);
    const x = ws.getRow(r);
    x.getCell(1).value = row.division;
    x.getCell(2).value = row.sno;
    x.getCell(3).value = `${row.label}${row.minor ? " *" : ""}`;
    if (row.minor) x.getCell(3).font = { bold: true };
    (["Good", "Ok", "Poor", "Very Poor"] as const).forEach((cond, i) => {
      const c = x.getCell(4 + i);
      c.value = row.tick === cond ? "✓" : "☐";
      c.alignment = { horizontal: "center" };
      if (row.tick === cond) c.font = { bold: true, color: { argb: argb(i >= 2 ? REPORT_CATEGORY_COLOR.Safety : REPORT_BAND_COLOR.Excellent) } };
    });
    x.getCell(8).value = row.score === null ? "N/A" : row.score / 100;
    x.getCell(8).numFmt = "0.0%";
    x.getCell(9).value = row.divisionWeight / 100;
    x.getCell(9).numFmt = "0%";
    x.getCell(10).value = row.groupWeight / 100;
    x.getCell(10).numFmt = "0%";
    x.getCell(11).value = row.cumulative / 100;
    x.getCell(11).numFmt = "0.0%";
    x.getCell(12).value = row.scored === null ? "-" : row.scored / 100;
    x.getCell(12).numFmt = "0.0%";
    for (let k = 1; k <= 14; k++) x.getCell(k).border = thin;
    r++;
  }
  // Division and total cells merged, as in the old form.
  for (const d of q.divisions) {
    const first = startOf.get(d.division);
    if (first === undefined) continue;
    const last = first + q.rows.filter((x) => x.division === d.division).length - 1;
    ws.mergeCells(first, 1, last, 1);
    const dc = ws.getCell(first, 1);
    dc.fill = fill(REPORT_CATEGORY_COLOR[d.division]);
    dc.font = { bold: true, color: { argb: "FFFFFFFF" } };
    dc.alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(first, 9, last, 9);
    ws.getCell(first, 9).alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(first, 13, last, 13);
    const ds = ws.getCell(first, 13);
    ds.value = d.contribution === null ? "-" : d.contribution / 100;
    ds.numFmt = "0%";
    ds.font = { bold: true, size: 12 };
    ds.alignment = { vertical: "middle", horizontal: "center" };
  }
  ws.mergeCells(4, 14, r - 1, 14);
  const t = ws.getCell(4, 14);
  t.value = q.total === null ? "-" : q.total / 100;
  t.numFmt = "0%";
  t.font = { bold: true, size: 14 };
  t.alignment = { vertical: "middle", horizontal: "center" };
  t.fill = fill("#DCE6F5");
  ws.getCell(r + 1, 1).value =
    "Scored weightage = cumulative weightage × score. Items rated N/A or not assessed are left out and the remaining weights re-normalise, so a divisional score is its scored weightage over the weight actually scored.";
  ws.getCell(r + 1, 1).font = { italic: true, size: 9, color: { argb: argb(REPORT_BRAND.inkSoft) } };
}

/** The report workbook: report sheets from the model, then the formula sheet. */
export function buildReportWorkbook(model: ReportModel, calculated: SingleSurveyExportInput): ExcelJS.Workbook {
  // The formula sheet is v1's builder, unchanged (v1 parity suite); the report sheets go in front.
  const wb = buildSingleSurveyWorkbook(calculated);
  const formulas = wb.getWorksheet("Single Survey - Calculated")!;
  summarySheet(wb, model);
  groupsSheet(wb, model);
  minorSheet(wb, model);
  matrixByItemSheet(wb, model);
  matrixByLocationSheet(wb, model);
  structuralSheet(wb, model);
  questionnaireSheet(wb, model);
  photosSheet(wb, model);
  notesSheet(wb, model);
  // Sheet order: report sheets first, formulas last.
  // exceljs writes sheets by `orderNo` (not in its typings).
  const ordered = (ws: ExcelJS.Worksheet) => ws as unknown as { orderNo: number };
  let order = 1;
  for (const ws of wb.worksheets) if (ws !== formulas) ordered(ws).orderNo = order++;
  ordered(formulas).orderNo = order;
  wb.creator = "TCF MQI";
  wb.title = `MQI report ${model.header.campusName}`;
  return wb;
}
