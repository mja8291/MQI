/**
 * MQI PDF report (W66): every colour, threshold and rule the report uses, in one place so they can
 * be changed without touching the model or the renderer. Colours are hex strings; the renderer
 * converts them.
 */

/** Brand colours of the report (navy and teal on white). */
export const REPORT_BRAND = { navy: "#1E2761", teal: "#028090", ink: "#1F2937", inkSoft: "#4B5563", inkFaint: "#9CA3AF", rule: "#D1D5DB", panel: "#F3F4F6" };

/** Category colours (score-loss bars, line-graph bands, matrix header rows). */
export const REPORT_CATEGORY_COLOR = { Safety: "#B91C1C", Functionality: "#028090", Aesthetics: "#7C3AED" } as const;

/** MQI band colours (gauge, cards, totals). Bands themselves come from scoring.ts ratingBand. */
export const REPORT_BAND_COLOR = { Excellent: "#15803D", Good: "#65A30D", Average: "#D97706", Poor: "#DC2626" } as const;
/** Lower bound of each band, % (the same cut-offs as scoring.ts ratingBand). */
export const REPORT_BAND_FLOORS = [
  { band: "Poor", from: 0 },
  { band: "Average", from: 50 },
  { band: "Good", from: 67 },
  { band: "Excellent", from: 84 },
] as const;

/** Matrix cell styles: a short label and a fill, so the matrix still reads in black-and-white print. */
export const REPORT_CELL = {
  Good: { label: "G", fill: "#16A34A", text: "#FFFFFF" },
  Ok: { label: "O", fill: "#86EFAC", text: "#14532D" },
  Poor: { label: "P", fill: "#F59E0B", text: "#451A03" },
  "Very Poor": { label: "VP", fill: "#DC2626", text: "#FFFFFF" },
  binaryOk: { label: "OK", fill: "#16A34A", text: "#FFFFFF" },
  binaryUnsafe: { label: "UNSAFE", fill: "#7F1D1D", text: "#FFFFFF" },
  na: { label: "N/A", fill: "#E5E7EB", text: "#6B7280" },
  unrecorded: { label: "—", fill: "#FFFFFF", text: "#9CA3AF" },
} as const;

/** Drilling-check guideline thresholds (rubric content.ts TOTAL_DEPTH_GUIDANCE and types.ts SCREED_UNSAFE_MM). */
export const REPORT_THRESHOLDS = {
  /** Total depth (slab + screed) above this: remove the screed and inspect. */
  totalDepthMm: 260,
  /** Screed this thick or more: Roof Screeding is Unsafe. */
  screedMm: 110,
  /** Column crack wider than this calls for a Schmidt Hammer test. */
  crackMm: 3,
};

/**
 * Line graph: groups whose Unsafe point keeps solid segments (it still gets the warning marker).
 * Names are rubric group names.
 */
export const UNSAFE_SOLID_EXCEPTIONS: readonly string[] = ["Wall/Column Condition i.e. cracks"];

/** How many groups the score-loss chart and the strengths list show. */
export const REPORT_TOP_LOSSES = 10;
export const REPORT_TOP_STRENGTHS = 3;
