import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { CATEGORY_WEIGHT } from "@/lib/scoring";
import { formatDurationFriendly } from "@/lib/format-duration";
import type { Category, DrillingCheck, RubricItem, SiteChecks } from "@/lib/types";

export interface SingleSurveyPdfInput {
  surveyId: string;
  campusName: string;
  region: string;
  area: string;
  submittedAt: string;
  /** "" if this survey predates the Start/End Time columns. */
  startTime: string;
  endTime: string;
  timeTakenSeconds: number | null;
  /** v2 (W22): items covered, %; null = not recorded (older survey). */
  itemsCoveredPercent?: number | null;
  apm: string;
  asm: string;
  principal: string;
  powerSupply: string;
  /** "" for a survey submitted before these two questions existed. */
  structuralConcern: string;
  buildingStructure: string;
  typeOfStructure: string;
  centerBeam: string;
  /** Blank fields (a survey from before this check existed) all render as "—". */
  drillingCheck: DrillingCheck;
  /** v2 (W36): "Hole 2: …; Hole 3: …"; omitted when there are none. */
  additionalDrillHoles?: string;
  siteChecks: SiteChecks;
  complaints: string;
  overall: number | null;
  functionality: number | null;
  safety: number | null;
  aesthetics: number | null;
  ratingBand: string;
  /** Item name -> display value ("Aggregated (NN%)"). */
  itemValues: Record<string, string>;
  items: RubricItem[];
}

const INK = rgb(0.106, 0.141, 0.114); // #1B241D
const INK_SOFT = rgb(0.294, 0.361, 0.314); // #4B5C50
const BRAND_DEEP = rgb(0.071, 0.239, 0.141); // #123D24
const BORDER = rgb(0.867, 0.898, 0.851); // #DDE5D9

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;

/**
 * Generates a simple one-page(ish) printable report: respondent details,
 * overall score + rating band, category scores, item-by-item table — the
 * "clean printable summary" 02-ui-ux-and-design-system.md asks for on the
 * Done screen, distinct from the formula-driven Excel export.
 *
 * Was server-only until Round 3 Task 9's pre-submission export fallback
 * started calling this directly from the client (see single-survey-workbook.ts's
 * header comment for why that has to happen client-side) — pdf-lib is
 * isomorphic already, so no other change was needed to run it there.
 */
export async function buildSingleSurveyPdf(input: SingleSurveyPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPageIfNeeded(need: number) {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function text(str: string, x: number, size: number, f: PDFFont = font, color = INK) {
    page.drawText(str, { x, y, size, font: f, color });
  }

  function line() {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: BORDER });
  }

  // Header. submittedAt is usually a real ISO timestamp, but the
  // pre-submission draft export (Round 3 Task 9) passes a plain "not yet
  // submitted" label instead — new Date() on that is Invalid Date, so fall
  // back to showing the label itself rather than the string "Invalid Date".
  text("TCF Maintenance Quality Index — Survey Report", MARGIN, 16, bold, BRAND_DEEP);
  y -= 20;
  const submittedDate = input.submittedAt ? new Date(input.submittedAt) : null;
  const submittedLabel =
    submittedDate && !Number.isNaN(submittedDate.getTime())
      ? submittedDate.toLocaleString()
      : input.submittedAt || new Date().toLocaleString();
  text(submittedLabel, MARGIN, 9, font, INK_SOFT);
  y -= 18;
  line();
  y -= 18;

  // Respondent / campus block
  const rows: [string, string][] = [
    ["Campus", `${input.campusName} (${input.region} · ${input.area})`],
    ["Survey ID", input.surveyId],
    ...(input.itemsCoveredPercent != null ? ([["Items covered", `${Math.round(input.itemsCoveredPercent)}%`]] as [string, string][]) : []),
    ["Engineering Staff", input.apm || "—"],
    ["ASM", input.asm || "—"],
    ["Principal", input.principal || "—"],
    ["Power Supply", input.powerSupply || "—"],
    ["Structural concern observed", input.structuralConcern || "—"],
    ["Suggested structural type", input.buildingStructure || "—"],
    // Only older surveys answered this; v2 no longer asks it (W17).
    ...(input.typeOfStructure ? ([["Type of structure (visual)", input.typeOfStructure]] as [string, string][]) : []),
    ["Center beam in classrooms", input.centerBeam || "—"],
    ["Drilling check done", input.drillingCheck.done || "—"],
    ["Drilling point marked", input.drillingCheck.pointMarked || "—"],
    ["Slab thickness", input.drillingCheck.slabThicknessMm ? `${input.drillingCheck.slabThicknessMm} mm` : "—"],
    ["Slab thickness assessment", input.drillingCheck.slabAssessment || "—"],
    ["Roof screeding thickness", input.drillingCheck.screedThicknessMm ? `${input.drillingCheck.screedThicknessMm} mm` : "—"],
    ["Hole repaired (grout/epoxy)", input.drillingCheck.holeRepaired || "—"],
    ...(input.additionalDrillHoles ? ([["Additional drill holes", input.additionalDrillHoles]] as [string, string][]) : []),
    ["Roof access (type)", input.siteChecks.roofAccessType || "—"],
    ["Overflow disposal system", input.siteChecks.overflowDisposal || "—"],
    ["Roof clean (dirt/vegetation)", input.siteChecks.roofClean || "—"],
    ["Rain spouts clear", input.siteChecks.rainSpoutsClear || "—"],
    [
      "Building risk factors",
      input.siteChecks.riskFactors.length
        ? input.siteChecks.riskFactors
            .map((r) => (r === "Any other" && input.siteChecks.riskFactorOther ? `Any other: ${input.siteChecks.riskFactorOther}` : r))
            .join("; ")
        : "—",
    ],
    ["Start Time", input.startTime ? new Date(input.startTime).toLocaleString() : "—"],
    ["Finish Time", input.endTime ? new Date(input.endTime).toLocaleString() : "—"],
    ["Time Taken", input.timeTakenSeconds === null ? "—" : formatDurationFriendly(input.timeTakenSeconds)],
  ];
  // Values wrap at ~72 characters (the column right of the label) — most are
  // short, but the building risk-factors list can run to a couple of lines.
  function wrap(str: string, max = 72): string[] {
    const lines: string[] = [];
    let current = "";
    for (const word of str.split(/\s+/)) {
      if (current && (current + " " + word).length > max) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }
  for (const [k, v] of rows) {
    const valueLines = wrap(v);
    text(k, MARGIN, 9, font, INK_SOFT);
    text(valueLines[0] ?? "", MARGIN + 140, 9, bold, INK);
    y -= 15;
    for (const extra of valueLines.slice(1)) {
      text(extra, MARGIN + 140, 9, bold, INK);
      y -= 12;
    }
  }
  y -= 8;

  // Overall score. drawText's y is the glyph baseline, so a size-26 line
  // needs its own baseline well clear of the size-10 label's baseline above
  // it (roughly the big line's ascent) or the two visually collide.
  const band = input.ratingBand || "—";
  const overallStr = input.overall === null ? "—" : `${Math.round(input.overall)}%`;
  text("Overall MQI Score", MARGIN, 10, bold, INK);
  y -= 30;
  text(`${overallStr}  (${band})`, MARGIN, 26, bold, BRAND_DEEP);
  y -= 26;

  // Category scores. drawRectangle's y is the BOTTOM-left corner (extends
  // upward by `height`), so the bar must be placed a full line below the
  // label's baseline, not just offset by a few points from it.
  const cats: Category[] = ["Functionality", "Safety", "Aesthetics"];
  const catScores: Record<Category, number | null> = {
    Functionality: input.functionality,
    Safety: input.safety,
    Aesthetics: input.aesthetics,
  };
  for (const cat of cats) {
    const score = catScores[cat];
    const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
    text(`${cat} (${CATEGORY_WEIGHT[cat]}%)`, MARGIN, 9, font, INK_SOFT);
    text(score === null ? "—" : `${Math.round(score)}%`, MARGIN + 400, 9, bold, INK);
    y -= 14;
    page.drawRectangle({ x: MARGIN, y, width: 360, height: 6, color: BORDER });
    page.drawRectangle({ x: MARGIN, y, width: (360 * pct) / 100, height: 6, color: BRAND_DEEP });
    y -= 14;
  }
  y -= 4;

  if (input.complaints.trim()) {
    text("Major complaints / additional remarks", MARGIN, 9, bold, INK);
    y -= 13;
    for (const chunk of wrapText(input.complaints, font, 9, PAGE_W - MARGIN * 2)) {
      newPageIfNeeded(13);
      text(chunk, MARGIN, 9, font, INK_SOFT);
      y -= 13;
    }
    y -= 6;
  }

  line();
  y -= 18;

  // Item-by-item table
  text("Item-by-item breakdown", MARGIN, 10, bold, INK);
  y -= 16;
  const colItem = MARGIN;
  const colCategory = MARGIN + 260;
  const colWeight = MARGIN + 360;
  const colValue = MARGIN + 410;
  text("Item", colItem, 8, bold, INK_SOFT);
  text("Category", colCategory, 8, bold, INK_SOFT);
  text("Weight", colWeight, 8, bold, INK_SOFT);
  text("Rating", colValue, 8, bold, INK_SOFT);
  y -= 10;
  line();
  y -= 12;

  for (const item of input.items) {
    newPageIfNeeded(12);
    const name = truncate(item.name, font, 8, colCategory - colItem - 6);
    text(name, colItem, 8, font, INK);
    text(item.category, colCategory, 8, font, INK_SOFT);
    text(`${item.weight}%`, colWeight, 8, font, INK_SOFT);
    text(input.itemValues[item.name] || "N/A", colValue, 8, font, INK);
    y -= 12;
  }

  return doc.save();
}

function wrapText(str: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(str: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

