import type { RatingBand } from '../types';
import type { UnsafeLevel } from '../safety-levels';

/**
 * R&M Budget, Build 1 (2026-11-18). Amounts are in Rs million throughout.
 * The engine (engine.ts) is pure: no sheet, network or UI code.
 */

/** One campus as the budget sees it: the SMS master joined with its latest MQI survey in the cycle's window. */
export interface BudgetCampus {
  campusId: string;
  name: string;
  region: string;
  area: string;
  cluster?: string;
  /** Campuses sharing a non-empty eCompoundNo are siblings. */
  eCompoundNo: string;
  schoolIds?: string[];
  schoolType?: string;
  programme?: string;
  builtYear?: string;
  buildDonor?: string;
  /** Latest survey in the window; null when the campus has none. */
  score: number | null;
  band: RatingBand | null;
  /** From the app's own classification (safety-levels.ts), never re-derived here. */
  unsafe: UnsafeLevel | null;
  surveyId?: string;
  surveyDate?: string;
  /** W92: on the R&M Plan 2026-27 list (matched on its School IDs). */
  rmPlanned?: boolean;
  /** W96: its Campus Survey Plan category ('' when listed without one); absent when not in the plan. */
  planCategory?: string;
  /** W96: "Safe"/"Unsafe" for a campus done without the App. */
  planAssessment?: string;
}

/** How a campus-backed category picks its campuses. Stored as data in the scenario. */
export type CategoryRule =
  | { type: 'unsafe'; level: UnsafeLevel }
  | { type: 'band'; bands: RatingBand[] }
  /** min ≤ score < max (max 100 includes 100). */
  | { type: 'scoreRange'; min: number; max: number }
  /** The N lowest-scoring campuses of a band (not already taken by a higher category). */
  | { type: 'bottomN'; band: RatingBand; n: number }
  | { type: 'manual'; campusIds: string[] };

export interface BudgetCategory {
  id: string;
  name: string;
  kind: 'campus' | 'anticipated';
  /** Campus-backed only. Precedence = position among campus-backed categories in the scenario. */
  rule?: CategoryRule;
  /** Last year's actual cost per campus (Rs M), entered by the Cost Manager; null = not set yet. */
  lastYearRate: number | null;
  /** Overrides the scenario's inflation for this category (percent); null/undefined = scenario default. */
  inflationPct?: number | null;
  /** Anticipated: number of items costed at the rate. */
  count?: number;
  /** Anticipated: a lump sum (Rs M) instead of count × rate. */
  lumpSum?: number | null;
  /** Projects assumed but not yet tied to a campus, costed at the category rate. */
  tbdCount?: number;
  /** Optional split of the TBD slots by region (counts should add up to tbdCount). */
  tbdByRegion?: Record<string, number>;
  /** Blank (null/undefined) = no cap on the number of projects (W91: optional). */
  capCount?: number | null;
  /** Blank (null/undefined) = no cap on the amount (W91: optional). */
  capRs?: number | null;
  colour?: string;
  /**
   * W91: adjustments made in a category's list. `includeIds` are put in this category whatever its rule
   * (first category in precedence wins); `excludeIds` never land in it, by rule or as a sibling, and
   * fall through to the next category they qualify for.
   */
  includeIds?: string[];
  excludeIds?: string[];
  /** W100 (replaced by ScenarioConfig.siblingBandRates in W102; kept so older saves still load). */
  siblingLastYearRate?: number | null;
}

/** Where a figure came from (assumption register). */
export interface AssumptionMeta {
  source: string;
  owner: string;
  date: string;
  note: string;
}

export interface ScenarioConfig {
  /** Default inflation, percent. */
  inflationPct: number;
  /** Optional overall ceiling (Rs M). */
  ceilingRs?: number | null;
  /** Last year's total (Rs M), for "change vs last year". */
  lastYearTotal?: number | null;
  categories: BudgetCategory[];
  /** Assumption register entries keyed by assumptionKey(). */
  assumptions: Record<string, AssumptionMeta>;
  /**
   * W92: R&M Plan campuses that share an e-compound and are in no category are costed in their own
   * table, by the category their own MQI matches. These two rates (last year's cost per campus, Rs M,
   * default inflation applied) cover the ones no category matches and the ones with no survey.
   */
  /**
   * W102: last year's cost per sibling campus (Rs M) by the sibling's own MQI band ("Poor"…"Excellent",
   * "No survey"), default inflation added; blank = the sibling keeps its main campus's category rate.
   */
  siblingBandRates?: Record<string, number | null>;
  rmPlanSiblings?: {
    otherLastYearRate?: number | null;
    unknownLastYearRate?: number | null;
    /** W96: a rate for one line (key e.g. "other:Excellent", "unknown:Done without App (Safe)"); blank = its group's rate. */
    rates?: Record<string, number | null>;
  };
}

export interface Scenario {
  id: string;
  cycleId: string;
  name: string;
  /** Build 2 adds the review states; Build 1 only writes Draft. */
  status: 'Draft';
  config: ScenarioConfig;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BudgetCycle {
  id: string;
  /** e.g. "FY 2027-28". */
  name: string;
  /** Survey window (ISO dates, inclusive): the latest survey per campus dated inside it counts. */
  surveyFrom: string;
  surveyTo: string;
  createdAt?: string;
}

export interface RegionZone {
  region: string;
  zone: string;
}

/** One campus placed in a category. */
export interface PlacedCampus {
  campus: BudgetCampus;
  /** 'primary' or a sibling of a primary in the same category. */
  role: 'primary' | 'sibling';
  /** "<BudgetCategory> sibling" for siblings. */
  tag: string;
  /** The primary campus this sibling came with. */
  hostId?: string;
  rate: number;
  /** Units are numbered in fill order (worst first). */
  unit: number;
}

export type CapStatus = 'none' | 'within' | 'trimmed' | 'overrun';

export interface CategoryResult {
  category: BudgetCategory;
  precedence: number | null;
  rate: number;
  inflationPct: number;
  selected: PlacedCampus[];
  waitlist: PlacedCampus[];
  primaries: number;
  siblings: number;
  tbd: number;
  /** Anticipated: count or 1 for a lump sum. */
  anticipatedCount: number;
  budget: number;
  capStatus: CapStatus;
  warnings: string[];
  /** W92: a row of the "Sibling R&M Plan campuses" table (not a category of the scenario). */
  section?: 'rmPlanSibling';
}

export interface RegionLine {
  region: string;
  zone: string;
  campuses: number;
  tbd: number;
  budget: number;
}

export interface BudgetResult {
  categories: CategoryResult[];
  regions: RegionLine[];
  zones: { zone: string; campuses: number; tbd: number; budget: number }[];
  total: number;
  lastYearTotal: number | null;
  ceiling: { ceilingRs: number; overrun: number; byCategory: { id: string; name: string; budget: number }[] } | null;
  /** Campuses with a survey in the window that land in no category. */
  unplaced: number;
  warnings: string[];
}

export interface AssumptionRow {
  key: string;
  item: string;
  value: string;
  meta: AssumptionMeta;
}
