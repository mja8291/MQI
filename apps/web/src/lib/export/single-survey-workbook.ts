import ExcelJS from "exceljs";
import { CATEGORY_WEIGHT } from "@/lib/scoring";
import { formatDurationFriendly } from "@/lib/format-duration";
import type { Category, RubricItem } from "@/lib/types";

export interface SingleSurveyExportInput {
  surveyId: string;
  campusName: string;
  method: 1 | 2;
  submittedAt: string;
  /** "" if this survey predates the Start/End Time columns. */
  startTime: string;
  endTime: string;
  timeTakenSeconds: number | null;
  /** Item name -> condition text ("Good"/"Ok"/"Poor"/"Very Poor"), omitted/blank means N/A / unscored. */
  conditions: Record<string, string>;
  /**
   * Optional pre-aggregated numeric score (0-100) per item, used for Method 2
   * groups where the value is already an average/worst-case across several
   * locations rather than a single pick — written as a literal instead of
   * going through the Good/Ok/Poor/Very Poor lookup formula.
   */
  aggregatedScores?: Record<string, number>;
  items: RubricItem[];
}

/**
 * Generates a "Single Survey - Calculated" workbook with real formulas (score
 * lookup + renormalizing category/overall weighting), matching
 * MQI_Illustrative_Workbook.xlsx's formula pattern exactly — not just
 * computed values — so it can be audited or adjusted in Excel afterward.
 *
 * Was server-only until Round 3 Task 9 added a pre-submission export
 * fallback: the whole point of that feature is producing a usable record
 * when submission itself is failing, which means it has to work from the
 * client with no network round trip — so this now also gets called
 * directly from src/lib/export/draft-export.ts, in addition to the
 * existing post-submission API routes. exceljs ships a browser build via
 * its package.json "browser" field, so this needed no other change to run
 * client-side.
 */
export function buildSingleSurveyWorkbook(input: SingleSurveyExportInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Single Survey - Calculated");

  sheet.columns = [
    { header: "Category", key: "category", width: 16 },
    { header: "Item", key: "item", width: 40 },
    { header: "Weight % (in category)", key: "weight", width: 20 },
    { header: "Category Weight %", key: "catWeight", width: 18 },
    { header: "Effective Weight", key: "effWeight", width: 16 },
    { header: "Condition", key: "condition", width: 14 },
    { header: "Score", key: "score", width: 10 },
    { header: "Weighted (in category)", key: "weightedCategory", width: 20 },
    { header: "Weighted (overall)", key: "weightedOverall", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  // Reference table used by the score lookup formula, per 01-data-and-scoring.md:
  // "Score lookup uses a small reference table via INDEX/MATCH, not hardcoded values inline."
  sheet.getCell("L1").value = "Condition";
  sheet.getCell("M1").value = "Score";
  const refTable: [string, number][] = [
    ["Good", 100],
    ["Ok", 75],
    ["Poor", 50],
    ["Very Poor", 25],
  ];
  refTable.forEach(([label, score], i) => {
    sheet.getCell(`L${i + 2}`).value = label;
    sheet.getCell(`M${i + 2}`).value = score;
  });
  sheet.getCell("O1").value = "Survey ID";
  sheet.getCell("P1").value = input.surveyId;
  sheet.getCell("O2").value = "Campus";
  sheet.getCell("P2").value = input.campusName;
  sheet.getCell("O3").value = "Method";
  sheet.getCell("P3").value = input.method;
  sheet.getCell("O4").value = "Submitted";
  sheet.getCell("P4").value = input.submittedAt;
  sheet.getCell("O5").value = "Start Time";
  sheet.getCell("P5").value = input.startTime ? new Date(input.startTime).toLocaleString() : "—";
  sheet.getCell("O6").value = "Finish Time";
  sheet.getCell("P6").value = input.endTime ? new Date(input.endTime).toLocaleString() : "—";
  sheet.getCell("O7").value = "Time Taken";
  sheet.getCell("P7").value =
    input.timeTakenSeconds === null ? "—" : formatDurationFriendly(input.timeTakenSeconds);

  const firstDataRow = 2;
  let r = firstDataRow;
  const rowsByCategory: Record<Category, number[]> = { Functionality: [], Safety: [], Aesthetics: [] };

  for (const item of input.items) {
    const condition = input.conditions[item.name] ?? "";
    const aggregated = input.aggregatedScores?.[item.name];
    sheet.getCell(`A${r}`).value = item.category;
    sheet.getCell(`B${r}`).value = item.name;
    sheet.getCell(`C${r}`).value = item.weight;
    sheet.getCell(`D${r}`).value = CATEGORY_WEIGHT[item.category];
    sheet.getCell(`E${r}`).value = { formula: `C${r}*D${r}/100` };
    if (aggregated !== undefined) {
      sheet.getCell(`F${r}`).value = `Aggregated (${Math.round(aggregated)}%)`;
      sheet.getCell(`G${r}`).value = aggregated;
    } else {
      sheet.getCell(`F${r}`).value = condition && condition !== "N/A" ? condition : "";
      sheet.getCell(`G${r}`).value = {
        formula: `IFERROR(INDEX($M$2:$M$5,MATCH(F${r},$L$2:$L$5,0)),"")`,
      };
    }
    sheet.getCell(`H${r}`).value = { formula: `IF(G${r}="","",G${r}*C${r})` };
    sheet.getCell(`I${r}`).value = { formula: `IF(G${r}="","",G${r}*E${r})` };
    rowsByCategory[item.category].push(r);
    r++;
  }
  const lastDataRow = r - 1;

  // Renormalizing category score, matching the live sheet's formula exactly:
  // SUMIF(scoreRange, "<>", weightedRange) / (SUM(weightRange) - SUMIF(scoreRange, "", weightRange))
  let summaryRow = r + 1;
  sheet.getCell(`A${summaryRow}`).value = "Category scores";
  sheet.getCell(`A${summaryRow}`).font = { bold: true };
  summaryRow++;
  for (const cat of Object.keys(rowsByCategory) as Category[]) {
    const rows = rowsByCategory[cat];
    if (rows.length === 0) continue;
    const first = rows[0];
    const last = rows[rows.length - 1];
    sheet.getCell(`A${summaryRow}`).value = cat;
    const cell = sheet.getCell(`B${summaryRow}`);
    cell.value = {
      formula: `SUMIF(G${first}:G${last},"<>",H${first}:H${last})/(SUM(C${first}:C${last})-SUMIF(G${first}:G${last},"",C${first}:C${last}))`,
    };
    cell.numFmt = "0.0";
    summaryRow++;
  }

  // Overall uses the identical renormalizing formula across the full item
  // set, weighted by Effective Weight (category weight * item weight / 100)
  // rather than combining the three category scores — mathematically
  // equivalent when nothing is N/A, but correct when it is.
  summaryRow++;
  sheet.getCell(`A${summaryRow}`).value = "Overall score";
  sheet.getCell(`A${summaryRow}`).font = { bold: true };
  const overallCell = sheet.getCell(`B${summaryRow}`);
  overallCell.value = {
    formula: `SUMIF(G${firstDataRow}:G${lastDataRow},"<>",I${firstDataRow}:I${lastDataRow})/(SUM(E${firstDataRow}:E${lastDataRow})-SUMIF(G${firstDataRow}:G${lastDataRow},"",E${firstDataRow}:E${lastDataRow}))`,
  };
  overallCell.font = { bold: true };
  overallCell.numFmt = "0.0";

  return wb;
}
