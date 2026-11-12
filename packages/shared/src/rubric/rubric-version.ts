/**
 * Stamped onto every submission and written to the response tabs' "Rubric
 * Version" column; exports use it to pick the item list/weights a survey was
 * actually scored against (see find-survey.ts). History:
 *   - (blank)        original list — items-legacy.ts
 *   - "2026-10-27"   items-v20261027.ts
 *   - "2026-10-27.2" items-v20261027-2.ts
 *   - "2026-10-27.3" items-v20261027-3.ts
 *   - "2026-10-28"   items-v20261028.ts
 *   - "2026-11-07"   items-v20261107.ts
 *   - "2026-11-11"   items-v20261111.ts (W68: "*" items as in the sheet; roof access staircase/ladder/none 100/50/0)
 *   - "2026-11-13"   current list (W70: ladder 100%; Wash Basin/Taps and Sewerage System only at Wet Lab,
 *                    Bio/Chemistry Lab and Pantry)
 * Bump this (and freeze a snapshot of whatever list changed) the next time
 * item names or weights change.
 */
export const RUBRIC_VERSION = "2026-11-13";
