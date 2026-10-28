import { RUBRIC_GROUPS } from "./rubric/items";
import type {
  Category,
  CategoryScoreResult,
  Condition,
  SurveyLocation,
  RatingBand,
  RubricItem,
  ScoreResult,
} from "./types";

export const CONDITIONS: Condition[] = ["Good", "Ok", "Poor", "Very Poor", "N/A"];

/** Good/Ok/Poor/Very Poor -> 1.0/0.75/0.5/0.25, expressed as 0-100. Referenced everywhere; never inlined. */
export const CONDITION_SCORE: Record<Exclude<Condition, "N/A">, number> = {
  Good: 100,
  Ok: 75,
  Poor: 50,
  "Very Poor": 25,
};

export const CATEGORY_WEIGHT: Record<Category, number> = {
  Functionality: 45,
  Safety: 25,
  Aesthetics: 30,
};

export const CATEGORIES: Category[] = ["Functionality", "Safety", "Aesthetics"];

export function conditionToScore(condition: Condition | undefined): number | undefined {
  if (!condition || condition === "N/A") return undefined;
  return CONDITION_SCORE[condition];
}

/**
 * Renormalizing weighted-average, generic over any numeric value getter:
 * sum(value * weight) / sum(weight) across items where a value exists.
 * Items with no value (N/A / never scored) are excluded from both sides, so
 * the remaining items' weights implicitly fill the gap — matches the live
 * sheet's SUMIF(...) / (SUM(weight) - SUMIF(..., "", weight)) formula exactly.
 */
function weightedAverage<T>(
  items: T[],
  weightOf: (item: T) => number,
  valueOf: (item: T) => number | undefined
): number | null {
  let weightSum = 0;
  let valueSum = 0;
  for (const item of items) {
    const value = valueOf(item);
    if (value === undefined) continue;
    const weight = weightOf(item);
    weightSum += weight;
    valueSum += value * weight;
  }
  return weightSum > 0 ? valueSum / weightSum : null;
}

/** Each item's effective weight for a cross-category score: categoryWeight% * itemWeight-within-category%. */
function effectiveWeight(item: RubricItem): number {
  return CATEGORY_WEIGHT[item.category] * item.weight;
}

// v2: exported (unchanged) so rubric/versions.ts can score any frozen item list with this same formula.
export function scoreItemSet(
  items: RubricItem[],
  valueOf: (item: RubricItem) => number | undefined,
  /** Name of the item to read for a watchlist entry, when the item set uses different names (item groups). */
  criticalItemNameFor: (watchlistName: string) => string = (n) => n
): ScoreResult {
  const categories = {} as Record<Category, CategoryScoreResult>;
  for (const category of CATEGORIES) {
    const categoryItems = items.filter((i) => i.category === category);
    const answeredWeight = categoryItems.reduce((sum, i) => (valueOf(i) === undefined ? sum : sum + i.weight), 0);
    const totalWeight = categoryItems.reduce((sum, i) => sum + i.weight, 0);
    const score = weightedAverage(categoryItems, (i) => i.weight, valueOf);
    categories[category] = { category, score, answeredWeight, totalWeight };
  }

  // Overall uses the identical renormalizing formula across the *full* item
  // set, not a combination of category scores — mathematically equivalent
  // when nothing is N/A, but correct when it is (01-data-and-scoring.md).
  const overall = weightedAverage(items, effectiveWeight, valueOf);

  // Major (Engineering Department's responsibility) vs Minor (school staff's
  // own routine maintenance, items marked "*") — same formula, restricted to
  // one subset at a time. weightedAverage's denominator is only the summed
  // weight of whichever items are passed in, so this renormalizes itself:
  // Major items' weights implicitly sum to 100% among themselves, and same
  // for Minor, without being diluted by (or sharing a denominator with) the
  // other subset.
  const major = weightedAverage(
    items.filter((i) => !i.principalMaintained),
    effectiveWeight,
    valueOf
  );
  const minor = weightedAverage(
    items.filter((i) => i.principalMaintained),
    effectiveWeight,
    valueOf
  );

  // Fixed 7-item watchlist, individual/unaggregated — deliberately mixes
  // Major and Minor items (Green board is the one Minor item here). For
  // item groups, `items`/`valueOf` already reflect each group's normal
  // worst-case/average roll-up across locations (scoreSurvey passes the
  // same aggregateLocations() result used everywhere else), so this doesn't
  // invent a separate rule — it just reads the existing per-item value.
  const byName = new Map(items.map((i) => [i.name, i]));
  const criticalItems: Record<string, number | null> = {};
  for (const name of CRITICAL_ITEMS) {
    const item = byName.get(criticalItemNameFor(name));
    criticalItems[name] = item ? (valueOf(item) ?? null) : null;
  }

  return { overall, major, minor, categories, criticalItems };
}

/**
 * Fixed watchlist TCF wants surfaced independent of any category/Major-Minor
 * rollup, on both the post-submission summary and the dashboard.
 */
export const CRITICAL_ITEMS = [
  "Cracks visibility in roof",
  "Green board *",
  "Roof Screeding/roof drainage",
  "Roof leakage/seepage",
  "Visibility of dampness",
  "Internal Paint",
  "External Fascade (Exterior Finish)",
] as const;

/**
 * The survey scores item *groups*, so each watchlist entry reads the group the
 * revised rubric files it under (the "Item Group" column of the rubric
 * sheet). Three of the seven share Ceiling Condition, so they
 * carry the same value — that's the granularity the survey collects.
 */
export const CRITICAL_ITEM_GROUP: Record<(typeof CRITICAL_ITEMS)[number], string> = {
  "Cracks visibility in roof": "Ceiling Condition i.e. cracks & seepage",
  "Green board *": "Green board/Softboard/Cabinet",
  "Roof Screeding/roof drainage": "Roof Screeding/roof drainage",
  "Roof leakage/seepage": "Ceiling Condition i.e. cracks & seepage",
  "Visibility of dampness": "Ceiling Condition i.e. cracks & seepage",
  "Internal Paint": "Paint",
  "External Fascade (Exterior Finish)": "Exterior Finish",
};

/**
 * Combine an item group's readings across every location it was
 * scored at into one campus-level numeric score (0-100), or leave it out of
 * the map entirely if it was never scored anywhere (stays N/A / excluded
 * from the weighted formula, same as any item).
 *
 * Safety groups: worst observed (minimum) — one real hazard shouldn't be
 * diluted by other rooms being fine. Functionality/Aesthetics groups: average.
 */
export function aggregateLocations(
  locations: SurveyLocation[],
  /** Defaults to the current item groups; an export of a pre-2026-10-27 survey passes the frozen legacy list instead. */
  groups: { name: string; aggregation: "worst" | "average" }[] = RUBRIC_GROUPS
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const group of groups) {
    const values: number[] = [];
    for (const loc of locations) {
      const v = conditionToScore(loc.scores[group.name]);
      if (v !== undefined) values.push(v);
    }
    if (values.length === 0) continue;
    result[group.name] =
      group.aggregation === "worst" ? Math.min(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  }
  return result;
}

export function scoreSurvey(locations: SurveyLocation[]): ScoreResult {
  const aggregated = aggregateLocations(locations);
  return scoreItemSet(
    RUBRIC_GROUPS,
    (item) => aggregated[item.name],
    (name) => CRITICAL_ITEM_GROUP[name as (typeof CRITICAL_ITEMS)[number]] ?? name
  );
}

export function ratingBand(score: number | null): RatingBand | null {
  if (score === null) return null;
  if (score >= 84) return "Excellent";
  if (score >= 67) return "Good";
  if (score >= 50) return "Average";
  return "Poor";
}

export const BAND_COLOR: Record<RatingBand, string> = {
  Excellent: "var(--band-excellent)",
  Good: "var(--band-good)",
  Average: "var(--band-average)",
  Poor: "var(--band-poor)",
};

export function bandColor(score: number | null): string {
  const band = ratingBand(score);
  return band ? BAND_COLOR[band] : "var(--ink-faint)";
}
