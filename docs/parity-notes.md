# Parity notes: v1 → v2

The v1 reference is `mja8291/tcf` at master `0a4a75c` (`reference/`). Each entry says what v1 does, what v2 does, and who decided.

## Decisions taken

| # | Area | v1 | v2 | Decided |
| --- | --- | --- | --- | --- |
| D1 | Sign-up (FR-AUTH-1/2) | Self sign-up; admin sets Approved=YES in the `Users` tab | Self sign-up kept (`auth.signup` → pending row in `Users v2`). Admin approves or revokes in-app and can issue a temporary password (forced change). | User, 28 Oct |
| D2 | Downloads (FR-EXP-1/2) | Any approved user downloads any survey and the all-responses export | Same, via `surveys.get` and `export.rows`. `sync.pull` keeps only the user's own survey list on the phone. | User, 28 Oct |
| D3 | v2-only tabs | (n/a) | `Users v2`, `Credentials`, `Sessions`, `Files`, `ChangeLog`, `AuditLog` and `ErrorLog` live in a separate **MQI v2 System** spreadsheet in the v2 Drive root, not next to the response tabs, so people who can open the responses never see password hashes. | Proposed 28 Oct (user gave the v2 Drive root) |
| D4 | Head-of-line blocking (FR-OFF-4) | A failure stops the queue run | A permanently rejected survey is marked failed and the queue continues. Only LOCK_TIMEOUT, RATE_LIMITED and INTERNAL retry. | Brief |
| D5 | Sign-in switch (FR-AUTH-11) | Off until AUTH_SECRET is set | Always on | Brief |
| D6 | School list before sign-in (FR-AUTH-5) | Public | Needs a session; sign-in always comes before a survey | Proposed |
| D7 | Session storage (FR-AUTH-6) | HttpOnly cookie, sliding 60 days | HMAC token in IndexedDB, 60 days, re-issued by `auth.whoami`; protected by a strict CSP | Brief |
| D8 | Write mode | `USER_ENTERED` (formula injection possible) | RAW. Columns v1 stored as numbers are sent as numbers (`packages/shared/src/sheets.ts` `NUMERIC_COLUMNS`), so cells keep their type. | Brief |
| D9 | Appending next to v1 | Sheets API `values.append` | Sheets Advanced Service `values.append` (RAW, INSERT_ROWS): the old app takes no script lock, so `getLastRow()+1` could overwrite its rows | Proposed |
| D10 | Photo rows | Written at submit (link already known) | Note rows are written with the survey. Each photo's row is written when its upload completes, so photo rows can appear minutes after the location rows. | Proposed |
| D11 | Old scoring method | Can finish drafts of v1's older item-by-item method | Removed completely (superseded by D15) | Product owner |
| D12 | New column | (none) | `Source App` = `v2` on v2 rows, appended at the end of the responses tab on the first write (kept after D14 so rows stay identifiable if the two spreadsheets are combined) | Brief |
| D13 | Reviewer role | Not enforced | Reviewer cannot submit surveys; downloads and dashboard only | Proposed |
| D14 | Responses spreadsheet | MQI Analysis `1Hv2lOEx…PCM4` | **MQI Spreadsheet** `1uLCnBNC…T42o`, with response and attachment headers copied exactly from MQI Analysis (2026-10-28). v2's dashboard and "find survey" show v2 surveys only; v1's show v1 only. MQI Analysis stays the source of the golden fixtures. | Product owner |
| D15 | Survey "methods" | Two methods; the location-by-location one labelled "Method 2" | One survey type, never called a method (2026-10-28). The old item-by-item method is removed everywhere (code, rubric, `Method 1 Responses` tab, dashboard, exports). The responses tab is **`MQI Survey Responses`** (v1: `Method 2 Responses`, same header). The Excel download drops v1's Method row (O3/P3; the rows below move up one); the PDF drops the "Method 2 · " prefix before the date; dashboard rows drop "Method 2"; URLs are `/survey/details` and `/survey/locations`. The parity suite checks everything else still matches v1. | Product owner |

## Golden parity

- Production (`MQI Analysis`, `1Hv2lOEx…PCM4`) holds 257 location rows in **18 surveys** (read 2026-10-28): 15 legacy (blank version), 1 at `2026-10-27` and 2 at `2026-10-28`. That is fewer than the brief's 50, so the suite uses all of them.
- **All 18 are checked in** (`tools/fixtures/data/surveys.json`, scores and location names only). **17 reproduce exactly**: overall, divisions, band, Major/Minor and all seven critical items.
- **1 differs, as O2 predicted:** `64a9d9c1…` (submitted 2026-09-18) recomputes to overall 84 (84.46; stored 85) and Internal Paint 71 (stored 72); its three division scores match. v1 changed the list on 2026-09-19 (v1 commit `8b0a777`, "Rubric corrections") and froze only the later list as legacy, so today's v1 gives the same 84. The test pins these two values (`V1_HISTORY` in `golden.test.ts`). Decision needed only if old exports must show the original 85: that would need a frozen pre-19-September list, which v1 never had.
- Precision is the stored integer. The sheet keeps `Math.round(score)`, so "to the decimal" is not checkable against stored values. The Excel export recomputes unrounded values from formulas, and Phase 5 compares those.

## Observations (v1 behaviour kept, not "fixed")

- **O1.** Legacy (blank-version) rows written before about 2026-08-20 have a different Timestamp on each location row of the same survey (for example `92d33d63…`). v1 later wrote one batched timestamp. v2 writes one timestamp per survey, as current v1 does.
- **O2.** The blank-version Method 2 list changed several times between 9 Aug and 27 Oct (`git log -- src/lib/data/method2-items.ts`), but v1 freezes only its final pre-27 Oct state as "legacy". A blank-version survey from before such an edit could recompute differently. Found: one survey (see Golden parity), recorded rather than patched.
- **O3.** Rows written at `2026-10-28` reuse legacy columns with identical names (`Plaster`, `Masonry`, `Internal Flooring condition`). This is harmless, because the version decides which columns are read.
- **O4.** A draft export (Review → Excel/PDF before submitting) lists no photo links in v2: photos stay on the phone until the survey is submitted. v1 listed links for photos that had already uploaded.

## Phase 4 (web app) decisions

| # | Area | v1 | v2 |
| --- | --- | --- | --- |
| W1 | Photo attach | Uploaded to Drive on attach, with a per-photo Uploading/Retry state | Compressed in a Web Worker (1600 px, ≤ 300 KB, EXIF orientation), saved on the phone under a UUID v7 attachment id, then uploaded by the sync engine after the survey reaches the server, in resumable 2 MB chunks. The per-photo Retry control is gone, because nothing uploads at attach time. |
| W2 | Submit | POST, then queued on failure | Always committed locally first (record + outbox entry + draft removal in one transaction), validated with the same shared rules the server uses, then sent. Done shows Sending → Survey submitted, or Saved offline. |
| W3 | Old-method screens | Kept to finish v1 drafts | Removed (D11, D15) |
| W4 | Unload flush (FR-OFF-7) | Async IndexedDB write on pagehide | Synchronous transaction on the open connection; an async write was shown (end-to-end test) to be lost on an immediate reload |
| W5 | Reconnect | Flush on the online event | The online event sends at once, ignoring backoff; failures while the phone reports offline add no backoff |
| W6 | Service worker | Self-updating; reload on activate | Updates are offered by a banner and applied when the user taps Update or the server answers UPGRADE_REQUIRED. A worker claiming the page on first install never reloads it mid-survey (also found by the end-to-end test). |
| W7 | Dashboard offline | Cached /api/dashboard in the SW | Last dashboard kept in IndexedDB and cleared on sign-out |
| W8 | Admin | Sheet edits | In-app "Manage users" (approve, set role, revoke, temporary password), admins only |
| W9 | Find school note | "Offline — showing the last saved campus list" whenever the saved list showed first, even while online | "Updating the campus list…" while the fresh list loads; "Offline — …" only if that load fails. A slow saved list can no longer replace a fresh one. (Apps Script answers in seconds, so v1's note would show on most visits.) Approved with the go-ahead of 2026-10-28 |
