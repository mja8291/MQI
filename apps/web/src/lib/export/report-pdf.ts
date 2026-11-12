import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
  CATEGORY_WEIGHT,
  REPORT_BAND_COLOR,
  REPORT_BAND_FLOORS,
  REPORT_BRAND,
  REPORT_CATEGORY_COLOR,
  REPORT_CELL,
  REPORT_THRESHOLDS,
  RUBRIC_GROUPS,
  itemLabel,
  type Category,
  type RatingBand,
  type ReportCell,
  type ReportModel,
  type MinorLevel,
  type PhotoSection,
  PHOTO_SECTIONS,
} from "@mqi/shared";

/**
 * W66: draws the MQI campus report from a ReportModel (packages/shared/src/report/model.ts) and
 * nothing else, so the online download and the offline draft fallback print the same report.
 * A4 landscape; every chart is vector (lines, rectangles, paths); text is the PDF's own Helvetica.
 * Colour never carries meaning alone: cells carry labels or drawn symbols, bars carry values.
 */

export interface ReportPhotoBytes {
  bytes: Uint8Array;
  mimeType: string;
}
export interface RenderOptions {
  /** Loads one photo (already reduced in size by the caller); null when it can't be had. */
  loadPhoto?: (id: string) => Promise<ReportPhotoBytes | null>;
  generatedAt?: Date;
}

const W = 841.89;
const H = 595.28;
const M = 30;
const BAR = 26;
const FOOT = 26;

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const C = {
  navy: hex(REPORT_BRAND.navy),
  teal: hex(REPORT_BRAND.teal),
  ink: hex(REPORT_BRAND.ink),
  soft: hex(REPORT_BRAND.inkSoft),
  faint: hex(REPORT_BRAND.inkFaint),
  rule: hex(REPORT_BRAND.rule),
  panel: hex(REPORT_BRAND.panel),
  white: rgb(1, 1, 1),
  red: hex("#B91C1C"),
  redBg: hex("#FEF2F2"),
  green: hex("#15803D"),
  greenBg: hex("#F0FDF4"),
};
const bandColor = (b: RatingBand | null) => (b ? hex(REPORT_BAND_COLOR[b]) : C.faint);
const catColor = (c: Category) => hex(REPORT_CATEGORY_COLOR[c]);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

/** Helvetica (WinAnsi) can't draw every character; keep the meaning of the common ones. */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const REPLACE: Record<string, string> = { "→": "->", "≥": ">=", "≤": "<=", "−": "-", "✓": "", "⚠": "!", " ": " " };
export function safe(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n\t]+/g, " ")) {
    if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if ((ch.charCodeAt(0) < 0x80 && ch.charCodeAt(0) >= 0x20) || (ch.charCodeAt(0) >= 0xa0 && ch.charCodeAt(0) <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else out += "?";
  }
  return out;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  model: ReportModel;
}

// ---------- drawing helpers ----------

function text(p: PDFPage, ctx: Ctx, s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: RGB; rotate?: number } = {}) {
  p.drawText(safe(s), { x, y, size, font: o.bold ? ctx.bold : ctx.font, color: o.color ?? C.ink, ...(o.rotate ? { rotate: degrees(o.rotate) } : {}) });
}
function width(ctx: Ctx, s: string, size: number, bold = false) {
  return (bold ? ctx.bold : ctx.font).widthOfTextAtSize(safe(s), size);
}
function textRight(p: PDFPage, ctx: Ctx, s: string, xRight: number, y: number, size: number, o: { bold?: boolean; color?: RGB } = {}) {
  text(p, ctx, s, xRight - width(ctx, s, size, o.bold), y, size, o);
}
function textCenter(p: PDFPage, ctx: Ctx, s: string, xc: number, y: number, size: number, o: { bold?: boolean; color?: RGB } = {}) {
  text(p, ctx, s, xc - width(ctx, s, size, o.bold) / 2, y, size, o);
}
function fit(ctx: Ctx, s: string, size: number, max: number, bold = false): string {
  if (width(ctx, s, size, bold) <= max) return s;
  let t = s;
  while (t.length > 1 && width(ctx, `${t}…`, size, bold) > max) t = t.slice(0, -1);
  return `${t}…`;
}
function wrap(ctx: Ctx, s: string, size: number, max: number, bold = false): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of safe(s).split(/\s+/).filter(Boolean)) {
    const cand = cur ? `${cur} ${word}` : word;
    if (cur && width(ctx, cand, size, bold) > max) {
      lines.push(cur);
      cur = word;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function rect(p: PDFPage, x: number, y: number, w: number, h: number, o: { fill?: RGB; border?: RGB; bw?: number; dash?: number[] } = {}) {
  p.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    ...(o.fill ? { color: o.fill } : {}),
    ...(o.border ? { borderColor: o.border, borderWidth: o.bw ?? 0.6 } : {}),
    ...(o.dash ? { borderDashArray: o.dash } : {}),
  });
}
function line(p: PDFPage, x1: number, y1: number, x2: number, y2: number, color: RGB, thickness = 0.6, dash?: number[]) {
  p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness, ...(dash ? { dashArray: dash } : {}) });
}
/** A tick mark centred on (cx, cy). */
function check(p: PDFPage, cx: number, cy: number, color: RGB, s = 1) {
  p.drawSvgPath("M 0 4 L 3 7 L 8 0", { x: cx - 4 * s, y: cy + 3.5 * s, borderColor: color, borderWidth: 1.5 * s, scale: s });
}
/** A warning triangle with an exclamation mark, centred on (cx, cy), `h` tall. */
function warning(p: PDFPage, cx: number, cy: number, h: number, fill: RGB, mark: RGB) {
  const s = h / 10;
  p.drawSvgPath("M 5.5 0 L 11 10 L 0 10 Z", { x: cx - 5.5 * s, y: cy + 5 * s, color: fill, scale: s });
  line(p, cx, cy + 2.4 * s, cx, cy - 1.6 * s, mark, 1.1 * s);
  p.drawCircle({ x: cx, y: cy - 3.2 * s, size: 0.65 * s, color: mark });
}
/** Diagonal hatch inside a rectangle. */
function hatch(p: PDFPage, x: number, y: number, w: number, h: number, color: RGB, step = 3.5) {
  for (let k = -h; k < w; k += step) {
    const lo = Math.max(0, -k);
    const hi = Math.min(h, w - k);
    if (lo < hi) line(p, x + k + lo, y + lo, x + k + hi, y + hi, color, 0.6);
  }
}

function newPage(ctx: Ctx, title: string): PDFPage {
  const p = ctx.doc.addPage([W, H]);
  rect(p, 0, H - BAR, W, BAR, { fill: C.navy });
  text(p, ctx, "TCF Maintenance Quality Index — Campus Report", M, H - 17, 10, { bold: true, color: C.white });
  textRight(p, ctx, title, W - M, H - 17, 10, { color: C.white });
  return p;
}
function heading(p: PDFPage, ctx: Ctx, s: string, y: number, sub?: string) {
  text(p, ctx, s, M, y, 15, { bold: true, color: C.navy });
  if (sub) text(p, ctx, sub, M, y - 14, 8.5, { color: C.soft });
}

// ---------- page 1: summary ----------

function summaryPage(ctx: Ctx) {
  const m = ctx.model;
  const p = newPage(ctx, "Campus summary");
  let y = H - BAR - 26;
  text(p, ctx, fit(ctx, m.header.campusName, 20, 520, true), M, y, 20, { bold: true, color: C.navy });
  if (m.header.draft) {
    const tag = "DRAFT — NOT SUBMITTED";
    const tw = width(ctx, tag, 9, true) + 12;
    rect(p, W - M - tw, y - 3, tw, 17, { fill: C.red });
    text(p, ctx, tag, W - M - tw + 6, y + 2, 9, { bold: true, color: C.white });
  }
  y -= 16;
  text(p, ctx, m.header.regionArea, M, y, 11, { color: C.teal, bold: true });

  // Header grid: 4 columns x 3 rows.
  const fields: [string, string][] = [
    ["Survey date", m.header.date],
    ["Method", m.header.method],
    ["Items covered", m.header.itemsCovered],
    ["Engineering staff", m.header.staff],
    ["ASM", m.header.asm],
    ["Principal", m.header.principal],
    ["Time taken", m.header.timeTaken],
    ["Start", m.header.start],
    ["Finish", m.header.finish],
    ["Rubric", `${m.rubricVersion}${m.submittedRubricVersion !== m.rubricVersion ? ` (submitted under ${m.submittedRubricVersion || "pre-2026-10-27"})` : ""}`],
  ];
  const colW = (W - 2 * M) / 4;
  y -= 10;
  rect(p, M, y - 3 * 25 - 4, W - 2 * M, 3 * 25 + 4, { fill: C.panel });
  fields.forEach(([label, value], i) => {
    const cx = M + 8 + (i % 4) * colW;
    const cy = y - 11 - Math.floor(i / 4) * 25;
    text(p, ctx, label.toUpperCase(), cx, cy, 7, { color: C.soft, bold: true });
    text(p, ctx, fit(ctx, value, 9, colW - 14), cx, cy - 11, 9);
  });
  y -= 3 * 25 + 14;

  // Safety banner: first, above the score.
  const alertLines = m.alerts.flatMap((a) => wrap(ctx, a, 9.5, W - 2 * M - 70).map((l, i) => ({ l, first: i === 0 })));
  const bh = m.alerts.length ? 30 + alertLines.length * 13 : 30;
  const red = m.alerts.length > 0;
  rect(p, M, y - bh, W - 2 * M, bh, { fill: red ? C.redBg : C.greenBg, border: red ? C.red : C.green, bw: 1 });
  rect(p, M, y - bh, 6, bh, { fill: red ? C.red : C.green });
  if (red) {
    warning(p, M + 26, y - 15, 15, C.red, C.white);
    text(p, ctx, `SAFETY ALERTS (${m.alerts.length}) — action needed regardless of the overall score`, M + 42, y - 19, 11, { bold: true, color: C.red });
    let ly = y - 33;
    for (const { l, first } of alertLines) {
      if (first) p.drawCircle({ x: M + 48, y: ly + 3, size: 1.8, color: C.red });
      text(p, ctx, l, M + 56, ly, 9.5);
      ly -= 13;
    }
  } else {
    p.drawCircle({ x: M + 26, y: y - 15, size: 8, color: C.green });
    check(p, M + 26, y - 15, C.white, 1);
    text(p, ctx, "No safety alerts", M + 42, y - 19, 11, { bold: true, color: C.green });
  }
  y -= bh + 16;

  // Gauge (left) and category cards (right).
  const gcx = M + 150;
  const r = 92;
  const gcy = Math.max(y - r - 18, FOOT + 120);
  gauge(p, ctx, gcx, gcy, r, m.overall.score, m.overall.band);

  const cardX = M + 320;
  const cardW = (W - M - cardX - 20) / 3;
  const cardH = 92;
  const cardTop = Math.min(y, gcy + r + 12);
  m.categories.forEach((c, i) => {
    const x = cardX + i * (cardW + 10);
    const yb = cardTop - cardH;
    rect(p, x, yb, cardW, cardH, { border: C.rule, bw: 0.8, fill: C.white });
    rect(p, x, cardTop - 5, cardW, 5, { fill: bandColor(c.band) });
    text(p, ctx, c.category, x + 10, cardTop - 20, 11, { bold: true, color: C.navy });
    textRight(p, ctx, `weight ${c.weight}%`, x + cardW - 10, cardTop - 20, 8, { color: C.soft });
    text(p, ctx, pct(c.score), x + 10, cardTop - 50, 24, { bold: true, color: C.ink });
    text(p, ctx, c.band ?? "Not scored", x + 12 + width(ctx, pct(c.score), 24, true), cardTop - 50, 10, { bold: true, color: bandColor(c.band) });
    const bw = cardW - 20;
    rect(p, x + 10, yb + 14, bw, 7, { fill: C.panel, border: C.rule, bw: 0.4 });
    if (c.score !== null) rect(p, x + 10, yb + 14, (bw * Math.max(0, Math.min(100, c.score))) / 100, 7, { fill: bandColor(c.band) });
    for (const f of [50, 67, 84]) line(p, x + 10 + (bw * f) / 100, yb + 12, x + 10 + (bw * f) / 100, yb + 23, C.soft, 0.4);
  });

  // Narrative.
  let ny = cardTop - cardH - 22;
  text(p, ctx, "IN SHORT", cardX, ny, 8, { bold: true, color: C.teal });
  ny -= 14;
  for (const para of m.narrative) {
    for (const l of wrap(ctx, para, 10.5, W - M - cardX)) {
      if (ny < FOOT + 8) break;
      text(p, ctx, l, cardX, ny, 10.5);
      ny -= 14;
    }
    ny -= 3;
  }
}

function gauge(p: PDFPage, ctx: Ctx, cx: number, cy: number, r: number, score: number | null, band: RatingBand | null) {
  const ang = (v: number) => Math.PI * (1 - v / 100);
  const pt = (v: number, rr: number) => ({ x: rr * Math.cos(ang(v)), y: -rr * Math.sin(ang(v)) }); // svg coords (y down)
  const arc = (a: number, b: number, rr: number) => {
    const s = pt(a, rr);
    const e = pt(b, rr);
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${rr} ${rr} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const floors = REPORT_BAND_FLOORS.map((b) => b.from);
  REPORT_BAND_FLOORS.forEach((b, i) => {
    const to = floors[i + 1] ?? 100;
    p.drawSvgPath(arc(b.from, to, r), { x: cx, y: cy, borderColor: hex(REPORT_BAND_COLOR[b.band]), borderWidth: 18, borderOpacity: 0.28 });
  });
  if (score !== null) p.drawSvgPath(arc(0, Math.max(0.5, Math.min(100, score)), r), { x: cx, y: cy, borderColor: bandColor(band), borderWidth: 18 });
  // Thresholds.
  for (const f of [0, 50, 67, 84, 100]) {
    const a = ang(f);
    line(p, cx + (r - 11) * Math.cos(a), cy + (r - 11) * Math.sin(a), cx + (r + 13) * Math.cos(a), cy + (r + 13) * Math.sin(a), C.ink, 0.8);
    const lx = cx + (r + 22) * Math.cos(a);
    const ly = cy + (r + 22) * Math.sin(a);
    textCenter(p, ctx, `${f}`, lx, ly - 3, 7.5, { color: C.soft });
  }
  if (score !== null) {
    const a = ang(Math.max(0, Math.min(100, score)));
    line(p, cx, cy, cx + (r - 26) * Math.cos(a), cy + (r - 26) * Math.sin(a), C.navy, 2.2);
    p.drawCircle({ x: cx, y: cy, size: 4, color: C.navy });
  }
  textCenter(p, ctx, pct(score), cx, cy - 30, 28, { bold: true, color: C.navy });
  textCenter(p, ctx, band ? `${band.toUpperCase()} — overall MQI` : "Not scored", cx, cy - 44, 9, { bold: true, color: bandColor(band) });
  textCenter(p, ctx, "Poor <50 · Average 50-67 · Good 67-84 · Excellent 84+", cx, cy - 58, 7.5, { color: C.soft });
}

// ---------- page 2: score loss ----------

function lossPage(ctx: Ctx) {
  const m = ctx.model;
  const p = newPage(ctx, "Where the score was lost");
  const lost = m.overall.score === null ? 0 : 100 - m.overall.score;
  heading(p, ctx, "Where the score was lost", H - BAR - 30, `Points of the overall MQI lost on each item group, top ${m.losses.length}. All groups together lose ${lost.toFixed(1)} points (100 - ${pct(m.overall.score)}).`);
  const x0 = M;
  const labelW = 210;
  const barX = x0 + labelW;
  const barMax = 300;
  const maxLoss = Math.max(1, ...m.losses.map((l) => l.pointsLost));
  let y = H - BAR - 70;
  const rowH = 30;
  for (const l of m.losses) {
    text(p, ctx, fit(ctx, l.label, 9.5, labelW - 10, true), x0, y + 6, 9.5, { bold: true });
    text(p, ctx, l.category, x0, y - 5, 7.5, { color: catColor(l.category) });
    const w = (barMax * l.pointsLost) / maxLoss;
    rect(p, barX, y - 4, w, 16, { fill: catColor(l.category) });
    text(p, ctx, `${l.pointsLost.toFixed(1)} pts`, barX + w + 6, y + 1, 9, { bold: true });
    y -= rowH;
  }
  if (!m.losses.length) text(p, ctx, "No points were lost.", x0, y, 10);
  // Legend.
  let lx = x0;
  const ly = y - 6;
  for (const cat of ["Safety", "Functionality", "Aesthetics"] as Category[]) {
    rect(p, lx, ly, 10, 10, { fill: catColor(cat) });
    text(p, ctx, `${cat} (${CATEGORY_WEIGHT[cat]}%)`, lx + 14, ly + 2, 8.5);
    lx += 110;
  }

  // Right column: strengths and not assessed.
  const rx = barX + barMax + 90;
  const rw = W - M - rx;
  let ry = H - BAR - 70;
  text(p, ctx, "STRENGTHS", rx, ry + 8, 9, { bold: true, color: C.green });
  ry -= 8;
  text(p, ctx, "Highest-weighted groups rated Good", rx, ry, 7.5, { color: C.soft });
  ry -= 16;
  if (!m.strengths.length) {
    text(p, ctx, "No group was rated Good everywhere.", rx, ry, 9);
    ry -= 14;
  }
  for (const s of m.strengths) {
    p.drawCircle({ x: rx + 6, y: ry + 3, size: 6, color: C.green });
    check(p, rx + 6, ry + 3, C.white, 0.75);
    text(p, ctx, fit(ctx, s.label, 9.5, rw - 20, true), rx + 18, ry, 9.5, { bold: true });
    text(p, ctx, `${s.category}, weight ${s.weight}%`, rx + 18, ry - 10, 7.5, { color: C.soft });
    ry -= 26;
  }
  ry -= 10;
  text(p, ctx, `NOT ASSESSED (${m.notAssessed.length})`, rx, ry, 9, { bold: true, color: C.soft });
  ry -= 8;
  text(p, ctx, "Left out of the score; the other weights fill the gap", rx, ry, 7.5, { color: C.soft });
  ry -= 15;
  for (const n of m.notAssessed) {
    if (ry < FOOT + 20) break;
    text(p, ctx, fit(ctx, n.label, 8.5, rw, true), rx, ry, 8.5, { bold: true });
    text(p, ctx, fit(ctx, n.note, 7.5, rw), rx, ry - 9.5, 7.5, { color: C.soft });
    ry -= 23;
  }
}

// ---------- page 4+: condition matrix ----------

interface Axis {
  label: string;
  /** Rows: the section header it sits under. Columns: the top header it sits under. */
  group: string;
  groupColor?: RGB;
  total: { score: number | null; band: RatingBand | null };
}

function drawCell(p: PDFPage, ctx: Ctx, cell: ReportCell, x: number, y: number, w: number, h: number) {
  const ix = x + 1;
  const iy = y + 1;
  const iw = w - 2;
  const ih = h - 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (cell.kind) {
    case "blank":
      return;
    case "unrecorded":
      rect(p, ix + 0.5, iy + 0.5, iw - 1, ih - 1, { border: C.faint, bw: 0.6, dash: [1.5, 1.5] });
      textCenter(p, ctx, REPORT_CELL.unrecorded.label, cx, cy - 2.5, 7, { color: C.faint });
      return;
    case "na":
      rect(p, ix, iy, iw, ih, { fill: hex(REPORT_CELL.na.fill) });
      textCenter(p, ctx, "N/A", cx, cy - 2.5, 7, { color: hex(REPORT_CELL.na.text) });
      return;
    case "binaryOk":
      rect(p, ix, iy, iw, ih, { fill: hex(REPORT_CELL.binaryOk.fill) });
      check(p, cx, cy, C.white, 0.85);
      return;
    case "binaryUnsafe":
      rect(p, ix, iy, iw, ih, { fill: hex(REPORT_CELL.binaryUnsafe.fill) });
      hatch(p, ix, iy, iw, ih, hex("#DC2626"));
      warning(p, cx, cy, Math.min(9, ih - 1), C.white, hex(REPORT_CELL.binaryUnsafe.fill));
      return;
    case "condition": {
      const st = REPORT_CELL[cell.condition!];
      rect(p, ix, iy, iw, ih, { fill: hex(st.fill) });
      textCenter(p, ctx, st.label, cx, cy - 2.5, 7, { bold: true, color: hex(st.text) });
    }
  }
}

function drawTotal(p: PDFPage, ctx: Ctx, t: Axis["total"], x: number, y: number, w: number, h: number) {
  if (t.score === null) {
    textCenter(p, ctx, "—", x + w / 2, y + h / 2 - 2.5, 7, { color: C.faint });
    return;
  }
  rect(p, x + 1, y + 1, w - 2, h - 2, { fill: bandColor(t.band) });
  textCenter(p, ctx, w < 24 ? `${Math.round(t.score)}` : pct(t.score), x + w / 2, y + h / 2 - 2.5, 7, { bold: true, color: C.white });
}

/**
 * Two views of the same cells: items as rows and locations as columns ("by item"), then
 * locations as rows and items as columns ("by location", W66 follow-up 2026-11-10).
 */
function matrixPages(ctx: Ctx, view: "byItem" | "byLocation") {
  const m = ctx.model;
  const groupsByName = new Map(m.groups.map((g) => [g.name, g]));
  // Label "name|detail": the detail is the type (skipped when the name already says it) or the weight.
  const locAxis: Axis[] = m.matrix.columns.map((c) => ({
    label: c.name.startsWith(c.typeLabel) ? c.name : `${c.name}|${c.typeLabel}`,
    group: c.floor,
    total: { score: c.score, band: c.band },
  }));
  const groupAxis: Axis[] = m.matrix.rows.map((r) => {
    const g = groupsByName.get(r.group)!;
    return { label: `${g.label}|${g.weight}%`, group: g.category, groupColor: catColor(g.category), total: { score: g.score, band: g.band } };
  });
  const normal = { rows: groupAxis, cols: locAxis, cell: (r: number, c: number) => m.matrix.rows[r]!.cells[c]!, rowTotal: "Campus", colTotal: "Location score" };
  const transposed = { rows: locAxis, cols: groupAxis, cell: (r: number, c: number) => m.matrix.rows[c]!.cells[r]!, rowTotal: "Location", colTotal: "Campus score" };
  const chosen = view === "byItem" ? normal : transposed;
  // By location: 33 narrow item columns fit one page across; rows are taller since there are fewer.
  const lay = view === "byItem" ? matrixLayout(chosen.rows, chosen.cols, { labelW: 196, minColW: 30, rowH: 9.6, nameH: 92 }) : matrixLayout(chosen.rows, chosen.cols, { labelW: 150, minColW: 16, rowH: 13, nameH: 150 });
  const title = view === "byItem" ? "Condition matrix — by item" : "Condition matrix — by location";

  let pageNo = 0;
  for (const cols of lay.colChunks) {
    for (const rows of lay.rowChunks) {
      pageNo++;
      const p = newPage(ctx, title);
      text(p, ctx, title, M, H - BAR - 22, 13, { bold: true, color: C.navy });
      text(
        p,
        ctx,
        `${view === "byItem" ? "Item groups down, locations across" : "Locations down, item groups across"}${lay.pages > 1 ? ` (part ${pageNo} of ${lay.pages}; names repeat on each part)` : ""}. Blank = not scored at that location type.`,
        M + width(ctx, title, 13, true) + 12,
        H - BAR - 22,
        8,
        { color: C.soft },
      );
      drawMatrix(p, ctx, chosen, rows, cols, lay);
      matrixLegend(p, ctx);
    }
  }
}

const MX = { totalW: 40, topH: 13, secH: 10.5 };

function matrixLayout(rows: Axis[], cols: Axis[], o: { labelW: number; minColW: number; rowH: number; nameH: number }) {
  const avail = W - 2 * M - o.labelW - MX.totalW;
  // Few locations get wider columns (up to 56 pt); many get the minimum and paginate.
  const colW = Math.max(o.minColW, Math.min(56, avail / Math.max(1, cols.length)));
  const perPage = Math.max(1, Math.floor(avail / colW));
  const colChunks: number[][] = [];
  for (let i = 0; i < cols.length; i += perPage) colChunks.push(cols.slice(i, i + perPage).map((_, k) => i + k));
  if (!colChunks.length) colChunks.push([]);
  // Rows: section headers count; the total row goes on the last chunk.
  const top = H - BAR - 32 - MX.topH - o.nameH;
  const bottom = FOOT + 30;
  const rowChunks: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  let lastGroup = "";
  rows.forEach((r, i) => {
    const need = o.rowH + (r.group !== lastGroup || cur.length === 0 ? MX.secH : 0);
    if (top - used - need - o.rowH < bottom && cur.length) {
      rowChunks.push(cur);
      cur = [];
      used = 0;
      lastGroup = "";
    }
    used += o.rowH + (r.group !== lastGroup ? MX.secH : 0);
    lastGroup = r.group;
    cur.push(i);
  });
  rowChunks.push(cur);
  return { colChunks, rowChunks, pages: colChunks.length * rowChunks.length, top, colW, labelW: o.labelW, rowH: o.rowH, nameH: o.nameH };
}

function drawMatrix(
  p: PDFPage,
  ctx: Ctx,
  t: { rows: Axis[]; cols: Axis[]; cell: (r: number, c: number) => ReportCell; rowTotal: string; colTotal: string },
  rows: number[],
  cols: number[],
  lay: ReturnType<typeof matrixLayout>,
) {
  const x0 = M;
  const cx0 = x0 + lay.labelW;
  const totalX = cx0 + cols.length * lay.colW;
  let y = lay.top + lay.nameH + MX.topH;
  // Level 1: column groups (floor, or category when transposed).
  let i = 0;
  while (i < cols.length) {
    let j = i;
    while (j + 1 < cols.length && t.cols[cols[j + 1]!]!.group === t.cols[cols[i]!]!.group) j++;
    const gx = cx0 + i * lay.colW;
    const gw = (j - i + 1) * lay.colW;
    const color = t.cols[cols[i]!]!.groupColor ?? C.navy;
    rect(p, gx + 0.5, y - MX.topH, gw - 1, MX.topH - 1, { fill: color });
    textCenter(p, ctx, fit(ctx, t.cols[cols[i]!]!.group, 7.5, gw - 4, true), gx + gw / 2, y - MX.topH + 4, 7.5, { bold: true, color: C.white });
    i = j + 1;
  }
  rect(p, totalX + 0.5, y - MX.topH, MX.totalW - 1, MX.topH - 1, { fill: C.teal });
  textCenter(p, ctx, "Total", totalX + MX.totalW / 2, y - MX.topH + 4, 7.5, { bold: true, color: C.white });
  y -= MX.topH;
  // Level 2: rotated names, with the type (or weight) on a second line.
  cols.forEach((c, k) => {
    const [name, detail] = t.cols[c]!.label.split("|");
    const left = cx0 + k * lay.colW;
    // Two rotated lines when the column is wide enough, else the name with its detail in brackets.
    const two = Boolean(detail) && lay.colW >= 24;
    const mid = left + lay.colW / 2;
    const first = two ? name! : detail ? `${name} (${detail})` : name!;
    text(p, ctx, fit(ctx, first, 7, lay.nameH - 6, two), two ? mid - 2.5 : mid + 2.5, y - lay.nameH + 4, 7, { rotate: 90, bold: two });
    if (two) text(p, ctx, fit(ctx, detail!, 7, lay.nameH - 6), mid + 7.5, y - lay.nameH + 4, 7, { rotate: 90, color: C.soft });
    line(p, left, y, left, y - lay.nameH, C.rule, 0.4);
  });
  text(p, ctx, t.rowTotal, totalX + MX.totalW / 2 + 2.5, y - lay.nameH + 4, 7, { rotate: 90, bold: true });
  y -= lay.nameH;
  line(p, x0, y, totalX + MX.totalW, y, C.ink, 0.8);

  let lastGroup = "";
  for (const r of rows) {
    const axis = t.rows[r]!;
    if (axis.group !== lastGroup) {
      rect(p, x0, y - MX.secH, totalX + MX.totalW - x0, MX.secH, { fill: C.panel });
      text(p, ctx, axis.group.toUpperCase(), x0 + 4, y - MX.secH + 3.5, 7.5, { bold: true, color: axis.groupColor ?? C.navy });
      y -= MX.secH;
      lastGroup = axis.group;
    }
    const [name, weight] = axis.label.split("|");
    text(p, ctx, fit(ctx, name!, 7.5, lay.labelW - 34), x0 + 6, y - lay.rowH + 3.2, 7.5);
    if (weight) textRight(p, ctx, weight, x0 + lay.labelW - 4, y - lay.rowH + 3.2, 7, { color: C.soft });
    cols.forEach((c, k) => drawCell(p, ctx, t.cell(r, c), cx0 + k * lay.colW, y - lay.rowH, lay.colW, lay.rowH));
    drawTotal(p, ctx, axis.total, totalX, y - lay.rowH, MX.totalW, lay.rowH);
    line(p, x0, y - lay.rowH, totalX + MX.totalW, y - lay.rowH, C.rule, 0.3);
    y -= lay.rowH;
  }
  if (rows[rows.length - 1] === t.rows.length - 1) {
    // Bottom row: the column totals.
    line(p, x0, y, totalX + MX.totalW, y, C.ink, 0.8);
    text(p, ctx, t.colTotal, x0 + 6, y - lay.rowH - 0.8, 7.5, { bold: true });
    cols.forEach((c, k) => drawTotal(p, ctx, t.cols[c]!.total, cx0 + k * lay.colW, y - lay.rowH - 2, lay.colW, lay.rowH + 2));
    y -= lay.rowH + 2;
  }
  // Grid verticals.
  const tableTop = lay.top;
  for (let k = 0; k <= cols.length; k++) line(p, cx0 + k * lay.colW, tableTop, cx0 + k * lay.colW, y, C.rule, 0.3);
  line(p, totalX + MX.totalW, tableTop, totalX + MX.totalW, y, C.rule, 0.3);
}

function matrixLegend(p: PDFPage, ctx: Ctx) {
  const y = FOOT + 8;
  let x = M;
  const items: [ReportCell, string][] = [
    [{ kind: "condition", condition: "Good", text: "" }, "Good"],
    [{ kind: "condition", condition: "Ok", text: "" }, "Ok"],
    [{ kind: "condition", condition: "Poor", text: "" }, "Poor"],
    [{ kind: "condition", condition: "Very Poor", text: "" }, "Very Poor"],
    [{ kind: "binaryOk", text: "" }, "OK / Available / Yes"],
    [{ kind: "binaryUnsafe", text: "" }, "Unsafe / Not available / No"],
    [{ kind: "na", text: "" }, "Rated N/A"],
    [{ kind: "unrecorded", text: "" }, "Applicable, not recorded"],
  ];
  for (const [cell, label] of items) {
    rect(p, x, y - 1, 24, 13, { border: C.rule, bw: 0.3 });
    drawCell(p, ctx, cell, x, y - 1, 24, 13);
    text(p, ctx, label, x + 28, y + 2.5, 7.5);
    x += 28 + width(ctx, label, 7.5) + 9;
  }
  text(p, ctx, "Blank: not scored there", x, y + 2.5, 7.5, { color: C.soft });
}

// ---------- structural & safety checks ----------

function structuralPage(ctx: Ctx) {
  const m = ctx.model;
  const s = m.structural;
  const p = newPage(ctx, "Structural & safety checks");
  heading(p, ctx, "Structural & safety checks", H - BAR - 30);
  const colW = (W - 2 * M - 30) / 2;
  const lx = M;
  const rx = M + colW + 30;
  let y = H - BAR - 58;

  const sub = (x: number, yy: number, t: string) => {
    text(p, ctx, t.toUpperCase(), x, yy, 8.5, { bold: true, color: C.teal });
    line(p, x, yy - 4, x + colW, yy - 4, C.rule, 0.6);
    return yy - 17;
  };
  const kv = (x: number, yy: number, k: string, v: string, bad = false) => {
    text(p, ctx, k, x, yy, 8.5, { color: C.soft });
    text(p, ctx, fit(ctx, v, 9, colW - 170, true), x + 165, yy, 9, { bold: true, color: bad ? C.red : C.ink });
    return yy - 13;
  };

  y = sub(lx, y, "Building");
  for (const b of s.building) y = kv(lx, y, b.label, b.value, b.label.startsWith("Structural concern") && b.value === "YES");
  y -= 8;

  y = sub(lx, y, "Drilling check");
  y = kv(lx, y, "Drilling check done", s.drilling.done);
  if (s.drilling.done === "YES") {
    y = kv(lx, y, "Drilling point marked", s.drilling.pointMarked);
    y = kv(lx, y, "Hole repaired (grout/epoxy)", s.drilling.holeRepaired, s.drilling.holeRepaired === "NO");
    y = kv(lx, y, "Readings typed in", s.drilling.unitTyped);
    y -= 2;
    // W70: the readings are drawn standard vs actual on the "Drilling check" page.
    for (const h of s.drilling.holes) {
      const ok = h.totalWithinLimit !== false && h.screedWithinLimit !== false;
      const mm = (v: number | null) => (v === null ? "—" : `${v} mm`);
      if (ok) {
        p.drawCircle({ x: lx + 5, y: y + 3, size: 5, color: C.green });
        check(p, lx + 5, y + 3, C.white, 0.6);
      } else warning(p, lx + 5, y + 4, 10, C.red, C.white);
      text(p, ctx, fit(ctx, `${h.label}: total ${mm(h.totalMm)}, screeding ${mm(h.screedMm)} · ${ok ? "within standard" : "exceeds standard"}`, 8.5, colW - 16, !ok), lx + 14, y, 8.5, { bold: !ok, color: ok ? C.ink : C.red });
      y -= 13;
    }
    text(p, ctx, "Standard vs actual drawings: see the Drilling check page.", lx, y, 7.5, { color: C.soft });
    y -= 14;
  }

  // Right column.
  let ry = H - BAR - 58;
  ry = sub(rx, ry, "Column checks (Wall/Column marked Column Unsafe)");
  if (!s.columns.length) {
    text(p, ctx, "No column was marked unsafe.", rx, ry, 9, { color: C.soft });
    ry -= 16;
  } else {
    const cw = [colW * 0.36, colW * 0.16, colW * 0.18, colW * 0.3];
    const heads = ["Location", "Part", "Crack > 3 mm", "Schmidt Hammer"];
    let hx = rx;
    heads.forEach((h, i) => {
      text(p, ctx, h, hx + 3, ry, 7.5, { bold: true, color: C.soft });
      hx += cw[i]!;
    });
    ry -= 5;
    for (const c of s.columns) {
      if (c.highlight) rect(p, rx, ry - 13, colW, 13, { fill: C.redBg, border: C.red, bw: 0.6 });
      let cx = rx;
      [c.location, c.parts, c.crackOver3mm, c.reading].forEach((v, i) => {
        text(p, ctx, fit(ctx, v, 8.5, cw[i]! - 6, i === 2 && c.highlight), cx + 3, ry - 9.5, 8.5, { bold: i === 2 && c.highlight, color: i === 2 && c.highlight ? C.red : C.ink });
        cx += cw[i]!;
      });
      ry -= 15;
    }
    ry -= 4;
  }
  ry -= 8;
  ry = sub(rx, ry, "Roof and drainage");
  for (const r of s.roof) {
    text(p, ctx, r.label, rx, ry, 8.5, { color: C.soft });
    const v = `${r.value}${r.bad && r.photo ? " — photo in Photo evidence" : r.bad ? " — no photo" : ""}`;
    if (r.bad) warning(p, rx + 170, ry + 3, 9, C.red, C.white);
    text(p, ctx, v, rx + (r.bad ? 178 : 165), ry, 9, { bold: true, color: r.bad ? C.red : C.ink });
    ry -= 14;
  }
  ry -= 10;
  ry = sub(rx, ry, "Building risk factors");
  let chipX = rx;
  for (const r of s.risks) {
    const label = r.selected ? `${r.label}` : r.label;
    const tw = width(ctx, label, 8, r.selected) + (r.selected ? 22 : 12);
    if (chipX + tw > rx + colW) {
      chipX = rx;
      ry -= 20;
    }
    if (r.selected) {
      rect(p, chipX, ry - 5, tw, 15, { fill: C.red });
      check(p, chipX + 8, ry + 2.5, C.white, 0.6);
      text(p, ctx, label, chipX + 16, ry, 8, { bold: true, color: C.white });
    } else {
      rect(p, chipX, ry - 5, tw, 15, { border: C.faint, bw: 0.7 });
      text(p, ctx, label, chipX + 6, ry, 8, { color: C.soft });
    }
    chipX += tw + 6;
  }
  ry -= 22;
  if (s.riskOther) {
    text(p, ctx, `Any other: ${s.riskOther}`, rx, ry, 8.5);
    ry -= 14;
  }
  text(p, ctx, `${s.risks.filter((r) => r.selected).length} of ${s.risks.length} selected (filled, with a tick)`, rx, ry, 7.5, { color: C.soft });
  ry -= 20;

  if (m.complaints) {
    const bottom = Math.min(y, ry);
    let cy = bottom - 6;
    if (cy > FOOT + 40) {
      text(p, ctx, "MAJOR COMPLAINTS / ADDITIONAL REMARKS", M, cy, 8.5, { bold: true, color: C.teal });
      cy -= 14;
      for (const l of wrap(ctx, m.complaints, 9, W - 2 * M)) {
        if (cy < FOOT + 6) break;
        text(p, ctx, l, M, cy, 9);
        cy -= 12;
      }
    }
  }
}

// ---------- W70: drilling check, standard vs actual ----------

const SLAB_FILL = hex("#94A3B8");
const SCREED_FILL = hex("#5EEAD4");
const SCREED_EDGE = hex("#0F766E");

/** A vertical dimension line with end ticks and a label, from y1 (bottom) to y2 (top). */
function dimension(p: PDFPage, ctx: Ctx, x: number, y1: number, y2: number, label: string, color: RGB, right = true) {
  line(p, x, y1, x, y2, color, 0.8);
  line(p, x - 3, y1, x + 3, y1, color, 0.8);
  line(p, x - 3, y2, x + 3, y2, color, 0.8);
  const t = fit(ctx, label, 7.5, 90, true);
  const tx = right ? x + 5 : x - 5 - width(ctx, t, 7.5, true);
  text(p, ctx, t, tx, (y1 + y2) / 2 - 2.5, 7.5, { bold: true, color });
}

/** One layer of a cross-section: a filled block, concrete hatched. */
function layer(p: PDFPage, x: number, y: number, w: number, h: number, fill: RGB, edge: RGB, hatched: boolean) {
  if (h <= 0) return;
  rect(p, x, y, w, h, { fill });
  if (hatched) hatch(p, x, y, w, h, hex("#64748B"), 5);
  rect(p, x, y, w, h, { border: edge, bw: 0.8 });
}

function drillingPages(ctx: Ctx) {
  const d = ctx.model.structural.drilling;
  if (d.done !== "YES" || !d.holes.length) return;
  const T = REPORT_THRESHOLDS;
  const mm = (v: number | null) => (v === null ? "—" : `${v} mm`);
  const rowH = 228;
  let p: PDFPage | null = null;
  let top = 0;
  d.holes.forEach((h, i) => {
    if (!p || top - rowH < FOOT + 6) {
      p = newPage(ctx, "Drilling check");
      heading(p, ctx, "Drilling check: standard vs actual", H - BAR - 30, `Drawn to scale. Total of slab + roof screeding must be ${T.totalDepthMm} mm or less; roof screeding must be under ${T.screedMm} mm. Readings typed in ${d.unitTyped || "mm"}.`);
      top = H - BAR - 56;
    }
    const pg: PDFPage = p;
    const totalOk = h.totalWithinLimit !== false;
    const screedOk = h.screedWithinLimit !== false;
    // Row title.
    text(pg, ctx, `${h.label}`, M, top - 10, 11, { bold: true, color: C.navy });
    text(pg, ctx, `Slab ${mm(h.slabMm)} + roof screeding ${mm(h.screedMm)} = total ${mm(h.totalMm)}${h.totalMeasured ? " (total measured)" : " (slab + screeding)"} · slab assessment ${h.assessment || "—"}`, M + 60, top - 10, 8.5, { color: C.soft });
    const panelTop = top - 22;
    const panelH = rowH - 34;
    const panelW = (W - 2 * M - 24) / 2;
    const drawH = panelH - 52;
    const base = panelTop - panelH + 22;

    const panel = (px: number, title: string, ok: boolean) => {
      rect(pg, px, panelTop - panelH, panelW, panelH, { fill: ok ? C.white : C.redBg, border: ok ? C.rule : C.red, bw: ok ? 0.6 : 1.2 });
      text(pg, ctx, title, px + 10, panelTop - 14, 9.5, { bold: true, color: C.navy });
      const verdict = ok ? "Within standard" : "Exceeds standard";
      const vw = width(ctx, verdict, 8, true) + 22;
      rect(pg, px + panelW - vw - 8, panelTop - 19, vw, 14, { fill: ok ? C.green : C.red });
      if (ok) check(pg, px + panelW - vw + 1, panelTop - 12, C.white, 0.6);
      else warning(pg, px + panelW - vw + 1, panelTop - 11.5, 8, C.white, C.red);
      text(pg, ctx, verdict, px + panelW - vw + 8, panelTop - 15, 8, { bold: true, color: C.white });
      line(pg, px + 10, base, px + panelW - 10, base, C.ink, 0.8);
    };

    // Panel 1: total thickness (slab + screeding).
    const p1 = M;
    panel(p1, "Total thickness: slab + roof screeding", totalOk);
    const totalActual = h.totalMm ?? (h.slabMm ?? 0) + (h.screedMm ?? 0);
    const scale1 = drawH / Math.max(T.totalDepthMm * 1.15, totalActual * 1.08, 1);
    const colW = 70;
    // Standard: one block of the allowed total.
    const sx1 = p1 + 60;
    const stdH = T.totalDepthMm * scale1;
    layer(pg, sx1, base, colW, stdH, C.panel, C.soft, false);
    rect(pg, sx1, base, colW, stdH, { border: C.green, bw: 1, dash: [3, 2] });
    textCenter(pg, ctx, "slab + screeding", sx1 + colW / 2, base + stdH / 2 + 2, 7.5, { color: C.soft });
    textCenter(pg, ctx, "STANDARD", sx1 + colW / 2, base - 13, 8, { bold: true, color: C.green });
    dimension(pg, ctx, sx1 - 8, base, base + stdH, `max ${T.totalDepthMm} mm`, C.green, false);
    // Actual: slab with screeding on top.
    const ax1 = p1 + panelW - colW - 110;
    const slabH = (h.slabMm ?? 0) * scale1;
    const screedH = (h.screedMm ?? 0) * scale1;
    layer(pg, ax1, base, colW, slabH, SLAB_FILL, hex("#475569"), true);
    layer(pg, ax1, base + slabH, colW, screedH, SCREED_FILL, SCREED_EDGE, false);
    if (h.slabMm !== null && slabH > 12) textCenter(pg, ctx, `slab ${h.slabMm}`, ax1 + colW / 2, base + slabH / 2 - 3, 7.5, { bold: true, color: C.white });
    if (h.screedMm !== null && screedH > 12) textCenter(pg, ctx, `screed ${h.screedMm}`, ax1 + colW / 2, base + slabH + screedH / 2 - 3, 7.5, { bold: true, color: SCREED_EDGE });
    textCenter(pg, ctx, "ACTUAL", ax1 + colW / 2, base - 13, 8, { bold: true, color: totalOk ? C.ink : C.red });
    dimension(pg, ctx, ax1 + colW + 8, base, base + totalActual * scale1, `total ${mm(h.totalMm)}`, totalOk ? C.ink : C.red);
    // The limit across both columns.
    const lim1 = base + stdH;
    line(pg, sx1 - 2, lim1, ax1 + colW + 4, lim1, C.red, 0.9, [3, 2]);
    text(pg, ctx, `${T.totalDepthMm} mm limit`, sx1 + colW + 6, lim1 + 3, 7, { color: C.red });

    // Panel 2: roof screeding thickness.
    const p2 = M + panelW + 24;
    panel(p2, "Roof screeding thickness", screedOk);
    const scale2 = drawH / Math.max(T.screedMm * 1.6, (h.screedMm ?? 0) * 1.1, 1);
    const sx2 = p2 + 60;
    const stdH2 = T.screedMm * scale2;
    layer(pg, sx2, base, colW, stdH2, C.panel, C.soft, false);
    rect(pg, sx2, base, colW, stdH2, { border: C.green, bw: 1, dash: [3, 2] });
    textCenter(pg, ctx, "screeding", sx2 + colW / 2, base + stdH2 / 2 + 2, 7.5, { color: C.soft });
    textCenter(pg, ctx, "STANDARD", sx2 + colW / 2, base - 13, 8, { bold: true, color: C.green });
    dimension(pg, ctx, sx2 - 8, base, base + stdH2, `under ${T.screedMm} mm`, C.green, false);
    const ax2 = p2 + panelW - colW - 110;
    const actH2 = (h.screedMm ?? 0) * scale2;
    layer(pg, ax2, base, colW, actH2, SCREED_FILL, SCREED_EDGE, false);
    if (h.screedMm !== null && actH2 > 12) textCenter(pg, ctx, `${h.screedMm} mm`, ax2 + colW / 2, base + actH2 / 2 - 3, 7.5, { bold: true, color: SCREED_EDGE });
    textCenter(pg, ctx, "ACTUAL", ax2 + colW / 2, base - 13, 8, { bold: true, color: screedOk ? C.ink : C.red });
    dimension(pg, ctx, ax2 + colW + 8, base, base + actH2, `screed ${mm(h.screedMm)}`, screedOk ? C.ink : C.red);
    const lim2 = base + stdH2;
    line(pg, sx2 - 2, lim2, ax2 + colW + 4, lim2, C.red, 0.9, [3, 2]);
    text(pg, ctx, `${T.screedMm} mm limit`, sx2 + colW + 6, lim2 + 3, 7, { color: C.red });

    top -= rowH;
    void i;
  });
}

// ---------- photos ----------

const PHOTO_FETCHES = 4;

/** Runs `fn` over `items` with at most `limit` at once; results keep the items' order. */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function photoPages(ctx: Ctx, opts: RenderOptions) {
  const m = ctx.model;
  if (!m.photos.length || !opts.loadPhoto) return;
  // W67: photos are fetched PHOTO_FETCHES at a time (one by one made a large survey's report slow),
  // then embedded in report order.
  const load = opts.loadPhoto;
  const bytes = await mapPool(m.photos, PHOTO_FETCHES, (ph) => load(ph.id).catch(() => null));
  const loaded: { img: PDFImage; caption: string; severity: number; section: PhotoSection }[] = [];
  for (const [i, ph] of m.photos.entries()) {
    try {
      const b = bytes[i];
      if (!b) continue;
      const img = /png/i.test(b.mimeType) ? await ctx.doc.embedPng(b.bytes) : /jpe?g/i.test(b.mimeType) ? await ctx.doc.embedJpg(b.bytes) : null;
      if (img) loaded.push({ img, caption: ph.caption, severity: ph.severity, section: ph.section });
    } catch {
      // A photo that can't be read is left out; the report still prints.
    }
  }
  if (!loaded.length) return;
  const cols = 4;
  const rowsPer = 2;
  const gap = 14;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ih = 150;
  const cellH = ih + 40;
  // W68: one run of pages per section (Safety, Minor, Major, Site checks), worst ratings first in each.
  for (const { section, title } of PHOTO_SECTIONS) {
    const inSection = loaded.filter((ph) => ph.section === section);
    for (let i = 0; i < inSection.length; i += cols * rowsPer) {
    const p = newPage(ctx, `Photo evidence · ${title}`);
    const n = inSection.length;
    heading(p, ctx, `Photo evidence: ${title}${i ? " (continued)" : ""}`, H - BAR - 30, `${n} photo${n === 1 ? "" : "s"}. Unsafe and Very Poor first. Each caption gives the location, the item and its rating.`);
    inSection.slice(i, i + cols * rowsPer).forEach((ph, k) => {
      const x = M + (k % cols) * (cw + gap);
      const yTop = H - BAR - 64 - Math.floor(k / cols) * (cellH + 10);
      const sc = Math.min(cw / ph.img.width, ih / ph.img.height);
      const w = ph.img.width * sc;
      const h = ph.img.height * sc;
      rect(p, x, yTop - ih, cw, ih, { fill: C.panel });
      p.drawImage(ph.img, { x: x + (cw - w) / 2, y: yTop - ih + (ih - h) / 2, width: w, height: h });
      const bad = ph.severity <= 1;
      rect(p, x, yTop - ih, cw, ih, { border: bad ? C.red : C.rule, bw: bad ? 1.6 : 0.6 });
      if (bad) {
        const tag = ph.severity === 0 ? "UNSAFE" : "VERY POOR";
        const tw = width(ctx, tag, 7.5, true) + 16;
        rect(p, x, yTop - 13, tw, 13, { fill: C.red });
        warning(p, x + 6, yTop - 6.5, 8, C.white, C.red);
        text(p, ctx, tag, x + 12, yTop - 10, 7.5, { bold: true, color: C.white });
      }
      wrap(ctx, ph.caption, 8, cw)
        .slice(0, 3)
        .forEach((l, j) => text(p, ctx, l, x, yTop - ih - 11 - j * 10, 8, { bold: j === 0 }));
    });
    }
  }
}

// ---------- W68: major and minor items ----------

const LEVEL_STYLE: Record<MinorLevel, { fill: RGB; text: RGB; label: string; strong: boolean }> = {
  veryPoor: { fill: hex(REPORT_CELL["Very Poor"].fill), text: hex(REPORT_CELL["Very Poor"].text), label: "Very Poor", strong: true },
  poor: { fill: hex(REPORT_CELL.Poor.fill), text: hex(REPORT_CELL.Poor.text), label: "Poor", strong: true },
  ok: { fill: hex(REPORT_CELL.Ok.fill), text: hex(REPORT_CELL.Ok.text), label: "Ok", strong: false },
  good: { fill: hex(REPORT_CELL.Good.fill), text: hex(REPORT_CELL.Good.text), label: "Good", strong: false },
  na: { fill: hex(REPORT_CELL.na.fill), text: hex(REPORT_CELL.na.text), label: "N/A", strong: false },
  unrecorded: { fill: C.white, text: C.faint, label: "Not recorded", strong: false },
};
const LEVEL_ORDER: MinorLevel[] = ["veryPoor", "poor", "ok", "good", "na"];
const bandOf = (score: number | null): RatingBand | null =>
  score === null ? null : ((REPORT_BAND_FLOORS.slice().reverse().find((f) => score >= f.from)?.band as RatingBand | undefined) ?? null);

function scoreCard(p: PDFPage, ctx: Ctx, x: number, yTop: number, w: number, title: string, sub: string, score: number | null, band: RatingBand | null) {
  const h = 74;
  rect(p, x, yTop - h, w, h, { fill: C.panel, border: C.rule });
  rect(p, x, yTop - h, 4, h, { fill: bandColor(band) });
  text(p, ctx, title, x + 12, yTop - 16, 10, { bold: true, color: C.navy });
  text(p, ctx, fit(ctx, sub, 7.5, w - 20), x + 12, yTop - 28, 7.5, { color: C.soft });
  text(p, ctx, pct(score), x + 12, yTop - 58, 24, { bold: true, color: bandColor(band) });
  text(p, ctx, band ?? "Not scored", x + 12 + width(ctx, pct(score), 24, true) + 8, yTop - 56, 10, { bold: true, color: bandColor(band) });
}

function legendWidth(ctx: Ctx): number {
  return LEVEL_ORDER.reduce((w, lv) => w + 12 + width(ctx, LEVEL_STYLE[lv].label, 7.5) + 10, 0) - 10;
}
function legendLevels(p: PDFPage, ctx: Ctx, x: number, y: number) {
  let lx = x;
  for (const lv of LEVEL_ORDER) {
    const s = LEVEL_STYLE[lv];
    rect(p, lx, y - 2, 9, 9, { fill: s.fill, border: C.rule, bw: 0.4 });
    text(p, ctx, s.label, lx + 12, y, 7.5, { color: C.soft });
    lx += 12 + width(ctx, s.label, 7.5) + 10;
  }
}

function minorPages(ctx: Ctx) {
  const mi = ctx.model.minor;
  if (!mi.groups.length) return;
  let p = newPage(ctx, "Major and minor items");
  heading(p, ctx, "Major and minor items", H - BAR - 30, "Minor (*) items are maintained by the school itself; major items by the Engineering Department. Same scoring, each set on its own.");
  const top = H - BAR - 58;
  scoreCard(p, ctx, M, top, 190, "Major items", "Engineering Department", mi.major.score, mi.major.band);
  scoreCard(p, ctx, M, top - 86, 190, "Minor items (*)", "Maintained by the school", mi.minor.score, mi.minor.band);
  const sc = mi.shortcomings;
  const sy = top - 172;
  rect(p, M, sy - 40, 190, 40, { fill: sc ? C.redBg : C.greenBg, border: sc ? C.red : C.green, bw: 0.8 });
  text(p, ctx, sc ? `${sc} minor shortcoming${sc === 1 ? "" : "s"}` : "No minor shortcomings", M + 10, sy - 18, 10, { bold: true, color: sc ? C.red : C.green });
  text(p, ctx, "ratings of Poor or Very Poor, all locations", M + 10, sy - 31, 7.5, { color: C.soft });

  // Chart: every minor item's campus score, and how its locations were rated.
  const cx = M + 220;
  const labelW = 180;
  const barX = cx + labelW + 6;
  const barW = 200;
  const cntX = barX + barW + 36;
  const segW = W - M - cntX;
  text(p, ctx, "Minor items: campus score, and ratings at its locations", cx, top - 4, 10, { bold: true, color: C.navy });
  legendLevels(p, ctx, W - M - legendWidth(ctx), top - 18);
  const rowH = Math.min(17, (top - 30 - (FOOT + 20)) / mi.groups.length);
  let y = top - 30;
  for (const g of mi.groups) {
    const yc = y - rowH / 2;
    text(p, ctx, fit(ctx, `${g.label} *`, 8, labelW), cx, yc - 3, 8, { color: catColor(g.category) });
    rect(p, barX, yc - 5, barW, 10, { fill: C.panel });
    if (g.score !== null) rect(p, barX, yc - 5, (barW * g.score) / 100, 10, { fill: bandColor(g.band) });
    text(p, ctx, g.score === null ? "N/A" : pct(g.score), barX + barW + 5, yc - 3, 8, { bold: true, color: g.score === null ? C.faint : bandColor(g.band) });
    const levels: MinorLevel[] = [...LEVEL_ORDER, "unrecorded"];
    const total = levels.reduce((s, lv) => s + g.counts[lv], 0);
    let sx = cntX;
    for (const lv of levels) {
      const n = g.counts[lv];
      if (!n || !total) continue;
      const w = (segW * n) / total;
      rect(p, sx, yc - 5, w, 10, { fill: LEVEL_STYLE[lv].fill, border: C.white, bw: 0.4 });
      if (w > 9) textCenter(p, ctx, String(n), sx + w / 2, yc - 3, 7, { bold: true, color: LEVEL_STYLE[lv].text });
      sx += w;
    }
    if (!total) text(p, ctx, "no location of its type", cntX, yc - 3, 7, { color: C.faint });
    y -= rowH;
  }

  // Location-wise detail: every location's minor items, Poor and worse highlighted.
  p = newPage(ctx, "Minor items by location");
  heading(p, ctx, "Minor items by location", H - BAR - 30, "Each location's minor (*) items with their rating; Poor and Very Poor are highlighted. The % is the location's minor-items score.");
  legendLevels(p, ctx, W - M - legendWidth(ctx), H - BAR - 30);
  const locW = 200;
  const scoreW = 40;
  const chipX = M + locW + scoreW + 10;
  const chipMax = W - M - chipX;
  const chipH = 12;
  y = H - BAR - 64;
  for (const loc of mi.byLocation) {
    const chips: { x: number; line: number; w: number; label: string; lv: MinorLevel }[] = [];
    let lx = 0;
    let ln = 0;
    for (const it of loc.items) {
      const label = `${it.label}: ${it.rating}`;
      const w = Math.min(chipMax, width(ctx, label, 7.5, LEVEL_STYLE[it.level].strong) + 10);
      if (lx > 0 && lx + w > chipMax) {
        ln++;
        lx = 0;
      }
      chips.push({ x: lx, line: ln, w, label, lv: it.level });
      lx += w + 4;
    }
    const nameLines = wrap(ctx, loc.label, 8, locW - 6, true).slice(0, 2);
    const rowH = Math.max((ln + 1) * (chipH + 3), nameLines.length * 10 + 2) + 8;
    if (y - rowH < FOOT + 8) {
      p = newPage(ctx, "Minor items by location");
      y = H - BAR - 24;
    }
    line(p, M, y, W - M, y, C.rule, 0.5);
    const bad = loc.items.some((it) => it.level === "poor" || it.level === "veryPoor");
    nameLines.forEach((l, i) => text(p, ctx, l, M, y - 12 - i * 10, 8, { bold: true, color: bad ? C.red : C.ink }));
    text(p, ctx, pct(loc.score), M + locW, y - 12, 8.5, { bold: true, color: bandColor(bandOf(loc.score)) });
    for (const c of chips) {
      const s = LEVEL_STYLE[c.lv];
      const cy = y - 4 - (c.line + 1) * (chipH + 3);
      // Poor and Very Poor: solid colour, bold. Ok: light green. Good: white with a green edge. N/A: grey.
      const plain = c.lv === "good";
      if (s.strong) rect(p, chipX + c.x, cy, c.w, chipH, { fill: s.fill });
      else rect(p, chipX + c.x, cy, c.w, chipH, { fill: plain ? C.white : s.fill, border: plain ? s.fill : C.rule, bw: 0.6 });
      text(p, ctx, fit(ctx, c.label, 7.5, c.w - 8, s.strong), chipX + c.x + 5, cy + 3.3, 7.5, { bold: s.strong, color: s.strong || c.lv === "ok" ? s.text : plain ? C.ink : s.text });
    }
    y -= rowH;
  }
}

// ---------- W68: questionnaire and scoring (the pre-App "ACM individual form" table) ----------

function questionnairePage(ctx: Ctx) {
  const q = ctx.model.questionnaire;
  const p = newPage(ctx, "Questionnaire and scoring");
  heading(p, ctx, "Survey questionnaire and scoring mechanism", H - BAR - 30, "In the format of the pre-App reports. The rating ticked is the one nearest the item's combined campus score. * = minor item, maintained by the school.");
  const cols = [
    { k: "div", t: "Work division", w: 70 },
    { k: "sno", t: "S. No", w: 26 },
    { k: "item", t: "Item group", w: 232 },
    { k: "Good", t: "Good", w: 32 },
    { k: "Ok", t: "Ok", w: 32 },
    { k: "Poor", t: "Poor", w: 32 },
    { k: "Very Poor", t: "Very Poor", w: 36 },
    { k: "score", t: "Score", w: 42 },
    { k: "dw", t: "Divisional weightage", w: 54 },
    { k: "gw", t: "Category weightage", w: 54 },
    { k: "cw", t: "Cumulative weightage", w: 56 },
    { k: "sw", t: "Scored weightage", w: 50 },
    { k: "ds", t: "Divisional score", w: 50 },
    { k: "ts", t: "Total score", w: 46 },
  ];
  const xs: number[] = [];
  let x = M;
  for (const c of cols) {
    xs.push(x);
    x += c.w;
  }
  const right = x;
  const col = (k: string) => cols.findIndex((c) => c.k === k);
  const mid = (k: string) => xs[col(k)]! + cols[col(k)]!.w / 2;
  const headTop = H - BAR - 58;
  const headH = 24;
  rect(p, M, headTop - headH, right - M, headH, { fill: C.navy });
  cols.forEach((c, i) => {
    const lines = wrap(ctx, c.t, 7, c.w - 4, true).slice(0, 2);
    lines.forEach((l, j) => textCenter(p, ctx, l, xs[i]! + c.w / 2, headTop - 10 - j * 8 - (lines.length === 1 ? 4 : 0), 7, { bold: true, color: C.white }));
  });
  const rowsTop = headTop - headH;
  const rowH = Math.min(13, (rowsTop - (FOOT + 30)) / q.rows.length);
  const fmt = (n: number | null, d = 1) => (n === null ? "" : `${n.toFixed(d)}%`);
  const divStart = new Map<string, number>();
  q.rows.forEach((r, i) => {
    const yb = rowsTop - (i + 1) * rowH;
    const tint = r.division === "Safety" ? hex("#FDECEC") : r.division === "Functionality" ? hex("#E6F4F1") : hex("#FBF5E6");
    rect(p, xs[1]!, yb, xs[col("dw")]! - xs[1]!, rowH, { fill: tint });
    rect(p, xs[col("gw")]!, yb, xs[col("ds")]! - xs[col("gw")]!, rowH, { fill: tint });
    line(p, xs[1]!, yb, xs[col("dw")]!, yb, C.rule, 0.4);
    line(p, xs[col("gw")]!, yb, xs[col("ds")]!, yb, C.rule, 0.4);
    const ty = yb + rowH / 2 - 2.6;
    if (!divStart.has(r.division)) divStart.set(r.division, i);
    textCenter(p, ctx, String(r.sno), mid("sno"), ty, 7.5);
    text(p, ctx, fit(ctx, `${r.label}${r.minor ? " *" : ""}`, 7.5, cols[2]!.w - 6, r.minor), xs[2]! + 3, ty, 7.5, { bold: r.minor });
    for (const cond of ["Good", "Ok", "Poor", "Very Poor"] as const) {
      const bx = mid(cond) - 4;
      rect(p, bx, yb + rowH / 2 - 4, 8, 8, { fill: C.white, border: C.soft, bw: 0.6 });
      if (r.tick === cond) check(p, bx + 4, yb + rowH / 2 - 0.5, cond === "Poor" || cond === "Very Poor" ? C.red : C.green, 0.75);
    }
    textCenter(p, ctx, r.score === null ? "N/A" : fmt(r.score), mid("score"), ty, 7.5, { color: r.score === null ? C.faint : C.ink });
    textCenter(p, ctx, `${r.groupWeight}%`, mid("gw"), ty, 7.5, { bold: true });
    textCenter(p, ctx, fmt(r.cumulative), mid("cw"), ty, 7.5);
    textCenter(p, ctx, r.scored === null ? "-" : fmt(r.scored), mid("sw"), ty, 7.5);
  });
  const tableBottom = rowsTop - q.rows.length * rowH;
  // Merged cells: division name, divisional weightage and divisional score; one total.
  for (const d of q.divisions) {
    const first = divStart.get(d.division);
    if (first === undefined) continue;
    const n = q.rows.filter((r) => r.division === d.division).length;
    const yTop = rowsTop - first * rowH;
    const yb = yTop - n * rowH;
    const ym = (yTop + yb) / 2;
    rect(p, M, yb, cols[0]!.w, n * rowH, { fill: catColor(d.division) });
    textCenter(p, ctx, d.division, M + cols[0]!.w / 2, ym - 3, 8.5, { bold: true, color: C.white });
    rect(p, xs[col("dw")]!, yb, cols[col("dw")]!.w, n * rowH, { fill: C.panel, border: C.rule, bw: 0.5 });
    textCenter(p, ctx, `${d.weight}%`, mid("dw"), ym - 3, 9, { bold: true });
    rect(p, xs[col("ds")]!, yb, cols[col("ds")]!.w, n * rowH, { fill: C.panel, border: C.rule, bw: 0.5 });
    textCenter(p, ctx, d.contribution === null ? "-" : fmt(d.contribution, 0), mid("ds"), ym, 11, { bold: true, color: bandColor(bandOf(d.score)) });
    textCenter(p, ctx, `(${pct(d.score)} of ${d.weight})`, mid("ds"), ym - 11, 6.5, { color: C.soft });
    line(p, M, yb, right, yb, C.navy, 0.8);
  }
  const ti = col("ts");
  const ob = bandOf(q.total);
  rect(p, xs[ti]!, tableBottom, cols[ti]!.w, rowsTop - tableBottom, { fill: hex("#DCE6F5"), border: C.rule, bw: 0.5 });
  textCenter(p, ctx, pct(q.total), mid("ts"), (rowsTop + tableBottom) / 2, 14, { bold: true, color: bandColor(ob) });
  if (ob) textCenter(p, ctx, ob, mid("ts"), (rowsTop + tableBottom) / 2 - 13, 7.5, { bold: true, color: bandColor(ob) });
  rect(p, M, tableBottom, right - M, rowsTop - tableBottom, { border: C.navy, bw: 0.8 });
  text(
    p,
    ctx,
    "Scored weightage = cumulative weightage x score. Items rated N/A or not assessed are left out and the remaining weights re-normalise, so a divisional score is its scored weightage over the weight actually scored.",
    M,
    tableBottom - 12,
    7,
    { color: C.soft },
  );
}

// ---------- methodology & data quality ----------

function methodologyPages(ctx: Ctx) {
  const m = ctx.model;
  let p = newPage(ctx, "Methodology & data quality");
  heading(p, ctx, "How this was measured", H - BAR - 30, `Rubric ${m.rubricVersion} (MQI Assessment Rubrics sheet).`);
  const weightsBottom = weightsTable(ctx, p);
  const colW = (W - 2 * M - 30) / 2;
  // One flow through slots: the left column, then under the weights on the right, then new pages.
  const slots = [
    { x: M, top: H - BAR - 64 },
    { x: M + colW + 30, top: weightsBottom - 12 },
  ];
  let slot = 0;
  let lx = slots[0]!.x;
  let y = slots[0]!.top;
  const para = (s: string, size = 8.5, bold = false, color = C.ink) => {
    for (const l of wrap(ctx, s, size, colW, bold)) {
      if (y < FOOT + 10) {
        slot++;
        if (slot < slots.length) {
          lx = slots[slot]!.x;
          y = slots[slot]!.top;
        } else {
          p = newPage(ctx, "Methodology & data quality");
          lx = slot % 2 === 0 ? M : M + colW + 30;
          y = H - BAR - 30;
          if (slot % 2 === 0) slots.push({ x: M + colW + 30, top: y });
        }
      }
      text(p, ctx, l, lx, y, size, { bold, color });
      y -= size + 3.5;
    }
    y -= 3;
  };
  const sub = (s: string) => {
    y -= 4;
    para(s.toUpperCase(), 8.5, true, C.teal);
  };
  sub("Rating scale");
  para("Good 100% · Ok 75% · Poor 50% · Very Poor 25% · N/A is left out of the score.");
  para("Two-answer items score their good answer 100% and their bad answer 25%: OK / Unsafe (Concrete/Plaster Soundness, Ceiling, Wall/Column, Roof Screeding, Window Shades, Slab + Screeding assessment), Available / Not available (Access to roof area), Yes / No (Overflow disposal).");
  sub("Combining locations");
  para("Each item group is rated at every location of the types it applies to. Safety groups take the worst rating found at any location, so one hazard is never averaged away; Functionality and Aesthetics groups take the average of their locations. In this report's matrix, the Total column is that combined campus score.");
  sub("Category and overall scores");
  para(`Category score = the weighted average of its groups (weights below). Overall MQI = 0.45 × Functionality + 0.25 × Safety + 0.30 × Aesthetics, computed over all groups at once with weight = category weight × group weight.`);
  para("N/A handling: a group with no score (rated N/A, or no location of its type) is left out and the remaining weights are re-normalised, both within its category and overall.");
  sub("MQI bands");
  para("Poor below 50% · Average 50-67% · Good 67-84% · Excellent 84% and above.");
  sub("Points lost");
  para("Points lost on a group = its share of the scored weight (category weight × group weight, re-normalised) × (100 − its score). All groups' points lost add up to 100 − the overall score.");
  sub("Safety alerts");
  para(`Shown first, whatever the overall score: any two-answer Safety group at its unsafe answer (per location), structural concern = YES, a column crack wider than ${REPORT_THRESHOLDS.crackMm} mm (with its Schmidt Hammer reading), a slab assessment of Unsafe, total drilled depth over ${REPORT_THRESHOLDS.totalDepthMm} mm, or screed of ${REPORT_THRESHOLDS.screedMm} mm or more.`);

  sub("Data quality");
  if (!m.flags.length) para("No data-quality issues found.");
  for (const f of m.flags) para(`• ${f}`);
}

/** Right column of the first methodology page: the rubric's group weights (the current sheet). */
function weightsTable(ctx: Ctx, rp: PDFPage): number {
  const m = ctx.model;
  const colW = (W - 2 * M - 30) / 2;
  let ry = H - BAR - 64;
  const rx = M + colW + 30;
  text(rp, ctx, `ITEM GROUP WEIGHTS — RUBRIC ${m.rubricVersion}`, rx, ry, 8.5, { bold: true, color: C.teal });
  ry -= 14;
  for (const cat of ["Safety", "Functionality", "Aesthetics"] as Category[]) {
    rect(rp, rx, ry - 3, colW, 12, { fill: C.panel });
    text(rp, ctx, `${cat} — ${CATEGORY_WEIGHT[cat]}% of overall`, rx + 4, ry, 8, { bold: true, color: catColor(cat) });
    ry -= 12;
    for (const g of RUBRIC_GROUPS.filter((x) => x.category === cat)) {
      text(rp, ctx, fit(ctx, itemLabel(g), 7.5, colW - 110), rx + 8, ry, 7.5);
      textRight(rp, ctx, `${g.weight}`, rx + colW - 74, ry, 7.5, { bold: true });
      text(rp, ctx, g.aggregation === "worst" ? "worst case" : "average", rx + colW - 66, ry, 7, { color: C.soft });
      ry -= 9.6;
    }
    ry -= 3;
  }
  return ry;
}

// ---------- footer ----------

function footers(ctx: Ctx, generatedAt: Date) {
  const pages = ctx.doc.getPages();
  const gen = generatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  pages.forEach((p, i) => {
    line(p, M, FOOT - 6, W - M, FOOT - 6, C.rule, 0.5);
    // W70: no survey ID on the pages.
    text(p, ctx, fit(ctx, `${ctx.model.header.campusName} · ${ctx.model.header.date}`, 7.5, 330), M, FOOT - 17, 7.5, { color: C.soft });
    textCenter(p, ctx, `Page ${i + 1} of ${pages.length}`, W / 2, FOOT - 17, 7.5, { color: C.soft });
    textRight(p, ctx, `Generated ${gen}`, W - M, FOOT - 17, 7.5, { color: C.soft });
  });
}

export async function renderReportPdf(model: ReportModel, opts: RenderOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`MQI report — ${model.header.campusName}`));
  doc.setSubject(`Survey ${model.header.surveyId}`);
  doc.setCreator("TCF MQI App");
  const ctx: Ctx = { doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), model };
  summaryPage(ctx);
  lossPage(ctx);
  minorPages(ctx);
  matrixPages(ctx, "byItem");
  matrixPages(ctx, "byLocation");
  structuralPage(ctx);
  drillingPages(ctx);
  questionnairePage(ctx);
  await photoPages(ctx, opts);
  methodologyPages(ctx);
  footers(ctx, opts.generatedAt ?? new Date());
  return doc.save();
}

// ---------- W70: the principal's minor-items report ----------

/**
 * W70 (2026-11-13): a short report for the campus principal — only the minor (*) items, which the
 * school maintains itself, that were rated Poor or Very Poor, location by location, and their
 * photos. Same model and scoring as the campus report.
 */
export async function renderMinorReportPdf(model: ReportModel, opts: RenderOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Minor maintenance items — ${model.header.campusName}`));
  doc.setCreator("TCF MQI App");
  const ctx: Ctx = { doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), model };
  const mi = model.minor;
  const rows = mi.byLocation
    .map((l) => ({ ...l, items: l.items.filter((it) => it.level === "poor" || it.level === "veryPoor") }))
    .filter((l) => l.items.length);
  const vp = rows.reduce((n, l) => n + l.items.filter((it) => it.level === "veryPoor").length, 0);
  const poor = rows.reduce((n, l) => n + l.items.filter((it) => it.level === "poor").length, 0);
  const title = "Minor maintenance items — for the Principal";
  const page = () => {
    const pg = ctx.doc.addPage([W, H]);
    rect(pg, 0, H - BAR, W, BAR, { fill: C.navy });
    text(pg, ctx, "TCF Maintenance Quality Index — Minor maintenance items", M, H - 17, 10, { bold: true, color: C.white });
    textRight(pg, ctx, fit(ctx, model.header.campusName, 10, 300), W - M, H - 17, 10, { color: C.white });
    return pg;
  };

  // Page 1: summary and the list.
  let p = page();
  let y = H - BAR - 30;
  text(p, ctx, fit(ctx, model.header.campusName, 20, W - 2 * M, true), M, y, 20, { bold: true, color: C.navy });
  y -= 16;
  text(p, ctx, `${model.header.regionArea} · Survey date ${model.header.date}${model.header.principal && model.header.principal !== "—" ? ` · Principal: ${model.header.principal}` : ""}`, M, y, 10, { color: C.teal, bold: true });
  y -= 22;
  const intro = [
    "Dear Principal,",
    "The items below are minor items, maintained by the school itself. During the MQI survey they were rated Poor or Very Poor. Please arrange their repair or replacement; Very Poor items first.",
  ];
  for (const l of intro) {
    for (const w of wrap(ctx, l, 10, W - 2 * M - 230)) {
      text(p, ctx, w, M, y, 10);
      y -= 13;
    }
    y -= 3;
  }
  // Cards on the right: minor score and counts.
  const cx = W - M - 210;
  const cTop = H - BAR - 62;
  rect(p, cx, cTop - 66, 210, 66, { fill: C.panel, border: C.rule });
  rect(p, cx, cTop - 66, 4, 66, { fill: bandColor(mi.minor.band) });
  text(p, ctx, "Minor items score", cx + 12, cTop - 15, 9, { bold: true, color: C.navy });
  text(p, ctx, pct(mi.minor.score), cx + 12, cTop - 48, 24, { bold: true, color: bandColor(mi.minor.band) });
  text(p, ctx, mi.minor.band ?? "Not scored", cx + 16 + width(ctx, pct(mi.minor.score), 24, true), cTop - 46, 10, { bold: true, color: bandColor(mi.minor.band) });
  const boxY = cTop - 76;
  const half = 103;
  rect(p, cx, boxY - 40, half, 40, { fill: vp ? hex(REPORT_CELL["Very Poor"].fill) : C.panel });
  text(p, ctx, String(vp), cx + 10, boxY - 22, 16, { bold: true, color: vp ? C.white : C.soft });
  text(p, ctx, "Very Poor", cx + 10, boxY - 34, 8, { bold: true, color: vp ? C.white : C.soft });
  rect(p, cx + half + 4, boxY - 40, half, 40, { fill: poor ? hex(REPORT_CELL.Poor.fill) : C.panel });
  text(p, ctx, String(poor), cx + half + 14, boxY - 22, 16, { bold: true, color: poor ? hex(REPORT_CELL.Poor.text) : C.soft });
  text(p, ctx, "Poor", cx + half + 14, boxY - 34, 8, { bold: true, color: poor ? hex(REPORT_CELL.Poor.text) : C.soft });
  y = Math.min(y, boxY - 52);

  if (!rows.length) {
    rect(p, M, y - 40, W - 2 * M, 40, { fill: C.greenBg, border: C.green, bw: 0.8 });
    text(p, ctx, "No minor item was rated Poor or Very Poor. Thank you for keeping the campus well maintained.", M + 12, y - 24, 11, { bold: true, color: C.green });
  } else {
    const cols = [
      { t: "Location", w: 260 },
      { t: "Item", w: 330 },
      { t: "Rating", w: W - 2 * M - 590 },
    ];
    const head = (yy: number) => {
      rect(p, M, yy - 16, W - 2 * M, 16, { fill: C.navy });
      let hx = M;
      for (const c of cols) {
        text(p, ctx, c.t, hx + 6, yy - 11.5, 8.5, { bold: true, color: C.white });
        hx += c.w;
      }
      return yy - 16;
    };
    y = head(y);
    const rowH = 15;
    for (const loc of rows) {
      // Very Poor first within a location.
      const items = [...loc.items].sort((a, b) => (a.level === b.level ? 0 : a.level === "veryPoor" ? -1 : 1));
      items.forEach((it, k) => {
        if (y - rowH < FOOT + 10) {
          p = page();
          y = head(H - BAR - 24);
        }
        const st = it.level === "veryPoor" ? REPORT_CELL["Very Poor"] : REPORT_CELL.Poor;
        line(p, M, y - rowH, W - M, y - rowH, C.rule, 0.4);
        if (k === 0) text(p, ctx, fit(ctx, loc.label, 8.5, cols[0]!.w - 10, true), M + 6, y - 10.5, 8.5, { bold: true });
        text(p, ctx, fit(ctx, it.label, 8.5, cols[1]!.w - 10), M + cols[0]!.w + 6, y - 10.5, 8.5);
        const rx = M + cols[0]!.w + cols[1]!.w;
        rect(p, rx + 4, y - rowH + 2, cols[2]!.w - 8, rowH - 4, { fill: hex(st.fill) });
        text(p, ctx, fit(ctx, it.rating, 8.5, cols[2]!.w - 16, true), rx + 10, y - 10.5, 8.5, { bold: true, color: hex(st.text) });
        y -= rowH;
      });
    }
  }

  // Photos of those items: minor items rated Poor or Very Poor (or their bad answer).
  const wanted = model.photos.filter((ph) => ph.section === "Minor" && ph.severity <= 2);
  if (wanted.length && opts.loadPhoto) {
    const load = opts.loadPhoto;
    const bytes = await mapPool(wanted, PHOTO_FETCHES, (ph) => load(ph.id).catch(() => null));
    const loaded: { img: PDFImage; caption: string; severity: number }[] = [];
    for (const [i, ph] of wanted.entries()) {
      try {
        const b = bytes[i];
        if (!b) continue;
        const img = /png/i.test(b.mimeType) ? await ctx.doc.embedPng(b.bytes) : /jpe?g/i.test(b.mimeType) ? await ctx.doc.embedJpg(b.bytes) : null;
        if (img) loaded.push({ img, caption: ph.caption, severity: ph.severity });
      } catch {
        // left out
      }
    }
    const cols = 3;
    const gap = 16;
    const cw = (W - 2 * M - gap * (cols - 1)) / cols;
    const ih = 170;
    for (let i = 0; i < loaded.length; i += cols * 2) {
      const pg = page();
      text(pg, ctx, "Photos of these items", M, H - BAR - 30, 15, { bold: true, color: C.navy });
      text(pg, ctx, `${loaded.length} photo${loaded.length === 1 ? "" : "s"}, Very Poor first.`, M, H - BAR - 44, 8.5, { color: C.soft });
      loaded.slice(i, i + cols * 2).forEach((ph, k) => {
        const x = M + (k % cols) * (cw + gap);
        const yTop = H - BAR - 58 - Math.floor(k / cols) * (ih + 52);
        const sc = Math.min(cw / ph.img.width, ih / ph.img.height);
        rect(pg, x, yTop - ih, cw, ih, { fill: C.panel });
        pg.drawImage(ph.img, { x: x + (cw - ph.img.width * sc) / 2, y: yTop - ih + (ih - ph.img.height * sc) / 2, width: ph.img.width * sc, height: ph.img.height * sc });
        const vpPhoto = ph.severity <= 1;
        const st = vpPhoto ? REPORT_CELL["Very Poor"] : REPORT_CELL.Poor;
        rect(pg, x, yTop - ih, cw, ih, { border: hex(st.fill), bw: 1.6 });
        const tag = vpPhoto ? "VERY POOR" : "POOR";
        rect(pg, x, yTop - 13, width(ctx, tag, 7.5, true) + 12, 13, { fill: hex(st.fill) });
        text(pg, ctx, tag, x + 6, yTop - 10, 7.5, { bold: true, color: hex(st.text) });
        wrap(ctx, ph.caption, 8.5, cw)
          .slice(0, 3)
          .forEach((l, j) => text(pg, ctx, l, x, yTop - ih - 12 - j * 11, 8.5, { bold: j === 0 }));
      });
    }
  }

  const gen = (opts.generatedAt ?? new Date()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const pages = ctx.doc.getPages();
  pages.forEach((pg, i) => {
    line(pg, M, FOOT - 6, W - M, FOOT - 6, C.rule, 0.5);
    text(pg, ctx, fit(ctx, `${model.header.campusName} · ${model.header.date} · ${title}`, 7.5, 420), M, FOOT - 17, 7.5, { color: C.soft });
    textCenter(pg, ctx, `Page ${i + 1} of ${pages.length}`, W / 2, FOOT - 17, 7.5, { color: C.soft });
    textRight(pg, ctx, `Generated ${gen}`, W - M, FOOT - 17, 7.5, { color: C.soft });
  });
  return ctx.doc.save();
}
