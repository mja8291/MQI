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
  type ReportGroup,
  type ReportModel,
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
    ["Survey ID", m.header.surveyId],
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

// ---------- page 3: line profile ----------

function pointColor(g: ReportGroup): RGB {
  if (g.binary) return g.unsafe ? hex(REPORT_CELL.binaryUnsafe.fill) : hex(REPORT_CELL.binaryOk.fill);
  return bandColor(g.band);
}

function profilePage(ctx: Ctx) {
  const m = ctx.model;
  const p = newPage(ctx, "Item condition profile");
  heading(p, ctx, "Item condition profile", H - BAR - 30, "Each item group's campus score, in rubric order. Gaps are groups not assessed; dotted segments touch an Unsafe rating.");
  const x0 = M + 34;
  const x1 = W - M - 6;
  const y0 = 200;
  const y1 = H - BAR - 66;
  const ys = (v: number) => y0 + ((y1 - y0) * v) / 100;
  const n = m.groups.length;
  const step = (x1 - x0) / n;
  const xs = (i: number) => x0 + step * (i + 0.5);
  // Band tints and grid.
  REPORT_BAND_FLOORS.forEach((b, i) => {
    const to = REPORT_BAND_FLOORS[i + 1]?.from ?? 100;
    p.drawRectangle({ x: x0, y: ys(b.from), width: x1 - x0, height: ys(to) - ys(b.from), color: hex(REPORT_BAND_COLOR[b.band]), opacity: 0.08 });
    text(p, ctx, b.band, x1 - width(ctx, b.band, 7) - 3, ys(b.from) + 3, 7, { color: hex(REPORT_BAND_COLOR[b.band]) });
  });
  for (const v of [0, 25, 50, 75, 100]) {
    line(p, x0, ys(v), x1, ys(v), C.rule, 0.4);
    textRight(p, ctx, `${v}%`, x0 - 4, ys(v) - 2.5, 7.5, { color: C.soft });
  }
  // Category separators and names.
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || m.groups[i]!.category !== m.groups[start]!.category) {
      const cat = m.groups[start]!.category;
      if (i < n) line(p, x0 + step * i, y0 - 4, x0 + step * i, y1 + 14, C.soft, 0.6);
      textCenter(p, ctx, `${cat} (${CATEGORY_WEIGHT[cat]}%)`, (x0 + step * start + x0 + step * i) / 2, y1 + 6, 8.5, { bold: true, color: catColor(cat) });
      start = i;
    }
  }
  rect(p, x0, y0, x1 - x0, y1 - y0, { border: C.rule, bw: 0.6 });
  // Line: breaks at unassessed groups; dotted next to an Unsafe point (except the solid exceptions).
  for (let i = 0; i < n - 1; i++) {
    const a = m.groups[i]!;
    const b = m.groups[i + 1]!;
    if (a.score === null || b.score === null) continue;
    const dotted = (a.unsafe && !a.solidWhenUnsafe) || (b.unsafe && !b.solidWhenUnsafe);
    line(p, xs(i), ys(a.score), xs(i + 1), ys(b.score), C.navy, 1.4, dotted ? [2, 2.2] : undefined);
  }
  m.groups.forEach((g, i) => {
    if (g.score === null) {
      p.drawCircle({ x: xs(i), y: y0, size: 2.6, borderColor: C.faint, borderWidth: 0.9, color: C.white });
      return;
    }
    p.drawCircle({ x: xs(i), y: ys(g.score), size: 3.4, color: pointColor(g), borderColor: C.white, borderWidth: 0.6 });
    if (g.unsafe) warning(p, xs(i), ys(g.score) + 13, 11, hex(REPORT_CELL.binaryUnsafe.fill), C.white);
  });
  // X labels.
  m.groups.forEach((g, i) => {
    text(p, ctx, fit(ctx, g.label, 7, 120), xs(i) + 2, y0 - 8, 7, { rotate: -60, color: g.score === null ? C.faint : C.ink });
  });
  // Legend.
  const ly = 30 + 12;
  let lx = M;
  line(p, lx, ly + 3, lx + 24, ly + 3, C.navy, 1.4);
  text(p, ctx, "Campus score", lx + 28, ly, 8);
  lx += 100;
  line(p, lx, ly + 3, lx + 24, ly + 3, C.navy, 1.4, [2, 2.2]);
  text(p, ctx, "Touches an Unsafe rating", lx + 28, ly, 8);
  lx += 140;
  warning(p, lx + 5, ly + 3, 11, hex(REPORT_CELL.binaryUnsafe.fill), C.white);
  text(p, ctx, "Rated Unsafe (Wall/Column keeps a solid line)", lx + 14, ly, 8);
  lx += 210;
  p.drawCircle({ x: lx + 4, y: ly + 3, size: 2.6, borderColor: C.faint, borderWidth: 0.9, color: C.white });
  text(p, ctx, "Not assessed (line breaks)", lx + 12, ly, 8);
  lx += 130;
  for (const b of ["Excellent", "Good", "Average", "Poor"] as RatingBand[]) {
    p.drawCircle({ x: lx + 3, y: ly + 3, size: 3, color: bandColor(b) });
    text(p, ctx, b, lx + 9, ly, 8);
    lx += width(ctx, b, 8) + 18;
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
    y -= 4;
    const scaleMax = Math.max(REPORT_THRESHOLDS.totalDepthMm + 40, ...s.drilling.holes.map((h) => (h.totalMm ?? 0) + 20));
    const bx = lx + 70;
    const bw = colW - 80;
    const sx = (mm: number) => bx + (bw * mm) / scaleMax;
    for (const h of s.drilling.holes) {
      const ok = h.totalWithinLimit !== false && h.screedWithinLimit !== false;
      text(p, ctx, h.label, lx, y - 8, 9, { bold: true });
      // Stacked bar: slab + screed against the total-depth limit.
      const top = y;
      rect(p, bx, top - 14, bw, 14, { fill: C.panel });
      if (h.slabMm !== null) rect(p, bx, top - 14, sx(h.slabMm) - bx, 14, { fill: hex("#64748B") });
      if (h.slabMm !== null && h.screedMm !== null) rect(p, sx(h.slabMm), top - 14, sx(h.slabMm + h.screedMm) - sx(h.slabMm), 14, { fill: C.teal });
      rect(p, bx, top - 14, bw, 14, { border: ok ? C.green : C.red, bw: 1.4 });
      if (h.slabMm !== null && sx(h.slabMm) - bx > 50) text(p, ctx, `slab ${h.slabMm} mm`, bx + 4, top - 10, 7.5, { color: C.white, bold: true });
      if (h.slabMm !== null && h.screedMm !== null && sx(h.slabMm + h.screedMm) - sx(h.slabMm) > 50)
        text(p, ctx, `screed ${h.screedMm} mm`, sx(h.slabMm) + 4, top - 10, 7.5, { color: C.white, bold: true });
      const lim = sx(REPORT_THRESHOLDS.totalDepthMm);
      line(p, lim, top + 4, lim, top - 18, C.red, 1, [2, 1.5]);
      text(p, ctx, `${REPORT_THRESHOLDS.totalDepthMm} mm total limit`, lim + 3, top + 2, 7, { color: C.red });
      // Screed alone against its own limit.
      const sy = top - 26;
      rect(p, bx, sy, bw, 7, { fill: C.panel });
      if (h.screedMm !== null) rect(p, bx, sy, sx(h.screedMm) - bx, 7, { fill: C.teal });
      const slim = sx(REPORT_THRESHOLDS.screedMm);
      line(p, slim, sy + 10, slim, sy - 3, C.red, 1, [2, 1.5]);
      text(p, ctx, `${REPORT_THRESHOLDS.screedMm} mm screed limit`, slim + 3, sy - 1, 7, { color: C.red });
      const mm = (v: number | null) => (v === null ? "—" : `${v} mm`);
      const summary = `Slab ${mm(h.slabMm)} + screed ${mm(h.screedMm)} = total ${mm(h.totalMm)}${h.totalMeasured ? " (total measured)" : ""} · slab assessment ${h.assessment}`;
      text(p, ctx, summary, bx, sy - 13, 8, { color: C.soft });
      if (ok) {
        p.drawCircle({ x: lx + 6, y: sy - 1, size: 5.5, color: C.green });
        check(p, lx + 6, sy - 1, C.white, 0.65);
        text(p, ctx, "Within limits", lx + 14, sy - 3.5, 7.5, { bold: true, color: C.green });
      } else {
        warning(p, lx + 6, sy, 10, C.red, C.white);
        text(p, ctx, "Over limit", lx + 14, sy - 3.5, 7.5, { bold: true, color: C.red });
      }
      y = sy - 26;
    }
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
  const loaded: { img: PDFImage; caption: string; severity: number }[] = [];
  for (const [i, ph] of m.photos.entries()) {
    try {
      const b = bytes[i];
      if (!b) continue;
      const img = /png/i.test(b.mimeType) ? await ctx.doc.embedPng(b.bytes) : /jpe?g/i.test(b.mimeType) ? await ctx.doc.embedJpg(b.bytes) : null;
      if (img) loaded.push({ img, caption: ph.caption, severity: ph.severity });
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
  for (let i = 0; i < loaded.length; i += cols * rowsPer) {
    const p = newPage(ctx, "Photo evidence");
    heading(p, ctx, "Photo evidence", H - BAR - 30, "Unsafe and Very Poor items first. Each caption gives the location, the item and its rating.");
    loaded.slice(i, i + cols * rowsPer).forEach((ph, k) => {
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
    text(p, ctx, fit(ctx, `${ctx.model.header.campusName} · Survey ${ctx.model.header.surveyId}`, 7.5, 330), M, FOOT - 17, 7.5, { color: C.soft });
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
  profilePage(ctx);
  matrixPages(ctx, "byItem");
  matrixPages(ctx, "byLocation");
  structuralPage(ctx);
  await photoPages(ctx, opts);
  methodologyPages(ctx);
  footers(ctx, opts.generatedAt ?? new Date());
  return doc.save();
}
