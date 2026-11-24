# R&M Budget site — Build 1 (W78, 2026-11-18)

Specs: `RM_Budget_Module_Spec.md` and `RM_Budget_Build1_Prompt.md` (kept by the user, not in the repo).

## Where things are

| Piece | Location |
|---|---|
| Cost engine `budgetEngine` (pure, unit-tested) | `packages/shared/src/budget/engine.ts`, tests `engine.test.ts` |
| Types, campus source, FY window, seeded categories, FY 2026-27 baseline | `packages/shared/src/budget/types.ts`, `source.ts` |
| Request schemas and results | `packages/shared/src/budget/api.ts` |
| Server actions (`budget.*`) | `apps/gas/src/core/budget.ts`, tests `budget.test.ts` |
| Budget site (React, no service worker) | `apps/budget/` (dev: `npm run dev -w @mqi/budget` on :5174 with `npm run dev:api`) |
| Budget book (Excel with live formulas, PPT, PDF) | `apps/budget/src/export/` |
| e2e | `apps/budget/e2e/budget.spec.ts` |

## Decisions (user, 2026-11-18)

- **Separate site** (`tcfmqi-budget.web.app`, staging `tcfmqi-budget-staging.web.app`), not part of the survey PWA: nothing of it is downloaded or cached on surveyors' phones. The survey app only shows an "Open R&M Budget" link on Home to Cost Managers and Admins.
- **Data in Google Sheets**: a new "R&M Budget" spreadsheet, created by the server on first use in the v2 root folder (script property `BUDGET_SPREADSHEET_ID`), tabs Cycles, Scenarios (config as JSON), Campus Master, Imports, Region Zones. Writes are logged in the System AuditLog.
- **New role `COST_MANAGER`** (permission `budget`: Cost Manager and Admin only; Cost Managers can't survey). Admins assign it in Manage users.
- **Rates are entered by the Cost Manager** in each scenario's Settings (no seeded guesses). The FY 2026-27 table is shown for reference only.
- **Keep it simple:** e-compound siblings are costed at their **host category's rate** (no per-band rate table).
- **Assessment year = financial year Jul–Jun:** a new cycle's survey window defaults to the FY before the budget year (FY 2027-28 budget → surveys 1 Jul 2026 – 30 Jun 2027); editable per cycle.

## Rules as built

- Score, band and Critically/Partially Unsafe come from the dashboard's own data (`buildDashboard`, `unsafeLevel`); training surveys are left out. Poor and Average use the stored band (same as the dashboard).
- Campus = **Campus ID** (SMS rows are grouped by Campus ID; School IDs listed per campus).
- Precedence: campus-backed categories in their order; each campus in the first it qualifies for. Bottom Good N = the N lowest Good campuses not taken higher.
- Siblings: other campuses with the same eCompoundNo join the host's category (tag "<Category> sibling") unless already in a higher category; a sibling that is in a lower category on its own is pulled up as a sibling.
- Units (host + siblings, same eCompoundNo) fill caps worst MQI first. TBD slots are reserved first. The first unit that doesn't fit and every unit after it go to the waitlist (one cut-off line). Unsafe categories are never trimmed: over the cap → overrun warning.
- Anticipated categories: count × rate, or a lump sum (not inflated).
- Overall ceiling: overrun shown, nothing trimmed.
- Caps are optional (W91): a blank cap (projects or Rs) is not applied.
- List adjustments (W91, Settings → List view): a campus removed from a category's list (`excludeIds`) never lands in that category, by rule or as a sibling, and falls to the next one it qualifies for; a campus added (`includeIds`) goes into that category whatever its rule (the earliest such category wins). Saved with the scenario.
- TBD by region (W91): picked from the region list; the TBD count is at least what the regions add up to.
- "Pull latest MQI categories" (W91) has the server work the dashboard's figures out again (`budget.campuses` with `fresh`).
- Sibling R&M Plan campuses (W92, user 2026-11-24): a campus on the R&M Plan 2026-27 list (the App's own BOQ-reminder mark) that shares its e-compound with another campus and is in no category (selected or waitlist) goes to its own table, between the campus and anticipated categories: by the first category whose rule its own MQI matches (ignoring bottom-N and caps; never one it was removed from; Campus-list rules skipped) at that category's rate, else "No category (MQI known)" or "Unknown MQI (no survey)" at two rates entered there (default inflation). They count in the regions, zones, ceiling and grand total, and appear in the dashboard and budget book. Siblings of shortlisted campuses stay with them (costed at the host's rate) as before.
- Funding source removed (W91). Reviewers see the budget as "under construction" (Home card and budget site) until it is designed for them; the server still gives them no budget data.

## Assumptions and open points (for the user)

1. One cut-off line per category: a smaller later unit doesn't jump the queue when a bigger one doesn't fit.
2. TBD slots are counted in the cap before campuses (they are deliberate assumptions).
3. A lump sum is the amount entered (no inflation applied).
4. Campuses without a survey in the window can enter only as siblings or through a manual campus list.
5. Scenario saves refuse to overwrite someone else's newer save (reload first).
6. The import replaces the whole Campus Master; scenarios keep their settings, and campus lists are recomputed from the current master.
7. Region names must match SMS exactly for the zone map (case-insensitive).
8. Staging's server reads its own spreadsheet copy, which may not have the SMS 2026 tab: import shows a clear message there.
