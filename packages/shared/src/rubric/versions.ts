import type { CRITICAL_ITEMS} from '../scoring';
import { METHOD2_CRITICAL_GROUP, aggregateMethod2, conditionToScore, scoreItemSet } from '../scoring';
import type { Condition, Method2Location, RubricItem, ScoreResult } from '../types';
import { METHOD1_ITEMS } from './method1-items';
import { LEGACY_METHOD1_ITEMS } from './method1-legacy-items';
import { METHOD2_GROUPS } from './method2-items';
import { LEGACY_METHOD2_GROUPS } from './method2-legacy-items';
import { METHOD2_GROUPS_20261027 } from './method2-v20261027-items';
import { METHOD2_GROUPS_20261027_2 } from './method2-v20261027-2-items';
import { METHOD2_GROUPS_20261027_3 } from './method2-v20261027-3-items';
import { RUBRIC_VERSION } from './rubric-version';

/**
 * The rubric-version lookup (v1: src/lib/export/find-survey.ts), in one place for the phone,
 * the server and the exports. A blank version means "submitted before 2026-10-27" and reads
 * the frozen legacy lists; an unknown non-blank version falls back to the current list,
 * exactly as v1 did.
 */
export type Method2Rubric = (RubricItem & { aggregation: 'worst' | 'average' })[];

export const KNOWN_RUBRIC_VERSIONS = ['', '2026-10-27', '2026-10-27.2', '2026-10-27.3', RUBRIC_VERSION] as const;

export function method2GroupsFor(version: string | null | undefined): Method2Rubric {
  if (!version) return LEGACY_METHOD2_GROUPS;
  if (version === '2026-10-27') return METHOD2_GROUPS_20261027;
  if (version === '2026-10-27.2') return METHOD2_GROUPS_20261027_2;
  if (version === '2026-10-27.3') return METHOD2_GROUPS_20261027_3;
  return METHOD2_GROUPS;
}

/** Method 1's list has not changed since 2026-10-27, so only blank versus non-blank matters. */
export function method1ItemsFor(version: string | null | undefined): RubricItem[] {
  return version ? METHOD1_ITEMS : LEGACY_METHOD1_ITEMS;
}

/**
 * Before 2026-10-27, Method 2's items carried the watchlist names themselves; from then on the
 * watchlist reads the group each entry is filed under (scoring.ts METHOD2_CRITICAL_GROUP).
 */
function criticalNameFor(version: string | null | undefined): (name: string) => string {
  if (!version) return (n) => n;
  return (n) => METHOD2_CRITICAL_GROUP[n as (typeof CRITICAL_ITEMS)[number]] ?? n;
}

/** scoreMethod2 for any rubric version: same aggregation, same weighted formula. */
export function scoreMethod2For(locations: Method2Location[], version: string | null | undefined): ScoreResult {
  const groups = method2GroupsFor(version);
  const aggregated = aggregateMethod2(locations, groups);
  return scoreItemSet(groups, (item) => aggregated[item.name], criticalNameFor(version));
}

export function scoreMethod1For(scores: Record<string, Condition>, version: string | null | undefined): ScoreResult {
  return scoreItemSet(method1ItemsFor(version), (item) => conditionToScore(scores[item.name]));
}
