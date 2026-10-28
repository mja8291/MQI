import type { CRITICAL_ITEMS} from '../scoring';
import { CRITICAL_ITEM_GROUP, aggregateLocations, scoreItemSet } from '../scoring';
import type { SurveyLocation, RubricItem, ScoreResult } from '../types';
import { RUBRIC_GROUPS } from './items';
import { LEGACY_RUBRIC_GROUPS } from './items-legacy';
import { RUBRIC_GROUPS_20261027 } from './items-v20261027';
import { RUBRIC_GROUPS_20261027_2 } from './items-v20261027-2';
import { RUBRIC_GROUPS_20261027_3 } from './items-v20261027-3';
import { RUBRIC_VERSION } from './rubric-version';

/**
 * The rubric-version lookup (v1: src/lib/export/find-survey.ts), in one place for the phone,
 * the server and the exports. A blank version means "submitted before 2026-10-27" and reads
 * the frozen legacy lists; an unknown non-blank version falls back to the current list,
 * exactly as v1 did.
 */
export type RubricGroupList = (RubricItem & { aggregation: 'worst' | 'average' })[];

export const KNOWN_RUBRIC_VERSIONS = ['', '2026-10-27', '2026-10-27.2', '2026-10-27.3', RUBRIC_VERSION] as const;

export function rubricGroupsFor(version: string | null | undefined): RubricGroupList {
  if (!version) return LEGACY_RUBRIC_GROUPS;
  if (version === '2026-10-27') return RUBRIC_GROUPS_20261027;
  if (version === '2026-10-27.2') return RUBRIC_GROUPS_20261027_2;
  if (version === '2026-10-27.3') return RUBRIC_GROUPS_20261027_3;
  return RUBRIC_GROUPS;
}

/**
 * Before 2026-10-27, the items carried the watchlist names themselves; from then on the
 * watchlist reads the group each entry is filed under (scoring.ts CRITICAL_ITEM_GROUP).
 */
function criticalNameFor(version: string | null | undefined): (name: string) => string {
  if (!version) return (n) => n;
  return (n) => CRITICAL_ITEM_GROUP[n as (typeof CRITICAL_ITEMS)[number]] ?? n;
}

/** Scoring for any rubric version: same aggregation, same weighted formula. */
export function scoreSurveyFor(locations: SurveyLocation[], version: string | null | undefined): ScoreResult {
  const groups = rubricGroupsFor(version);
  const aggregated = aggregateLocations(locations, groups);
  return scoreItemSet(groups, (item) => aggregated[item.name], criticalNameFor(version));
}

/**
 * v2 (W22): share of the rubric's item groups scored (anything but N/A) at least once anywhere in
 * the survey, e.g. 28 of 31 → 90.3. A measure of how much of the campus the survey covered.
 */
export function itemsCovered(
  locations: readonly { scores: Record<string, string> }[],
  version: string | null | undefined
): { covered: number; total: number; percent: number } {
  const groups = rubricGroupsFor(version);
  const scored = new Set<string>();
  for (const loc of locations) for (const [name, value] of Object.entries(loc.scores)) if (value && value !== 'N/A') scored.add(name);
  const covered = groups.filter((g) => scored.has(g.name)).length;
  return { covered, total: groups.length, percent: groups.length ? (covered / groups.length) * 100 : 0 };
}
