/**
 * Stamped onto every submission and written to the response tabs' "Rubric
 * Version" column; exports use it to pick the item list/weights a survey was
 * actually scored against (see find-survey.ts). History:
 *   - (blank)        original lists — method1-legacy-items.ts /
 *                    method2-legacy-items.ts
 *   - "2026-10-27"   Method 1 = current; Method 2 = method2-v20261027-items.ts
 *   - "2026-10-27.2" Method 1 = current; Method 2 =
 *                    method2-v20261027-2-items.ts
 *   - "2026-10-27.3" Method 1 = current; Method 2 =
 *                    method2-v20261027-3-items.ts
 *   - "2026-10-28"   current Method 2 (31 groups). Method 1 can no longer be
 *                    started, so there is no newer Method 1 list; a Method 1
 *                    draft finished after this date is stamped with this
 *                    version but still scored against METHOD1_ITEMS.
 * Bump this (and freeze a snapshot of whatever list changed) the next time
 * item names or weights change.
 */
export const RUBRIC_VERSION = "2026-10-28";
