/**
 * Stamped onto every submission and written to the response tabs' "Rubric
 * Version" column; exports use it to pick the item list/weights a survey was
 * actually scored against (see find-survey.ts). History:
 *   - (blank)        original list — items-legacy.ts
 *   - "2026-10-27"   items-v20261027.ts
 *   - "2026-10-27.2" items-v20261027-2.ts
 *   - "2026-10-27.3" items-v20261027-3.ts
 *   - "2026-10-28"   current list (31 groups)
 * Bump this (and freeze a snapshot of whatever list changed) the next time
 * item names or weights change.
 */
export const RUBRIC_VERSION = "2026-10-28";
