# TCF MQI v2 — Migration plan (for approval)

Status: draft, awaiting approval. No code has been written. Date: 28 Oct 2026.

## 1. What I read

| Input | Finding |
| --- | --- |
| `mja8291/tcf` | **Default branch is `main` (e39be1c, 31 Aug), not `master`.** `master` is 0a4a75c (28 Oct, "Self-host Space Grotesk; add TRD") and is the one with auth, the Queue tab, rubric snapshots and `docs/MQI-Survey-App-TRD.docx`. I will pin the reference to **master @ 0a4a75c**. |
| MQI TRD v1.0 | Read in full: FR-AUTH-1…11, FR-HOME-1…6, FR-SVY-1…11, FR-CHK-1…5, FR-OFF-1…7, FR-DASH-1…3, FR-EXP-1…3, Appendices A–C. |
| Construction TRD | Read in full (architecture, sync, API, security, limits, tests, environments). |
| Construction source | **Found locally** at `D:\Application Data\Claude Apps\Construction Reporting App\Development Construction Reporting` (HEAD 7868431, 25 Oct). The brief's placeholder was empty, so I need you to confirm I can use it (Q1). |
| Firebase | Project **`tcf-mqi-app-761a8`** ("TCF MQI App"), default Hosting site **`tcf-mqi-app-761a8`** → https://tcf-mqi-app-761a8.web.app. |
| Toolchain | node 24.18, npm 11.16, firebase-tools 15.27, git 2.55. **`clasp` and `gh` are not installed** (clasp comes in as a devDependency, as in Construction). |

## 2. Reuse from the Construction app (copy and adapt, not import)

| Area | Construction file(s) | What changes for MQI |
| --- | --- | --- |
| Apps Script core | `apps/gas/src/core/{router,errors,context,ports,table,write,schema,auth,files,driveLayout}.ts`, `apps/gas/build.mjs`, `appsscript.json` | Strip contractor/RFI/pour/BI/maintenance. `table/write` become header-driven against the **existing** MQI tabs (see §4). |
| In-memory fake + dev server | `apps/gas/src/core/ports.ts` (TablePort, DrivePort, CachePort, LockPort, CryptoPort…), `apps/gas/src/dev/server.ts`, `server.test.ts` | Fake gains `appendRaw` semantics and an "external appender" to simulate v1 writing concurrently. |
| Auth | `core/auth.ts` (PBKDF2-HMAC-SHA256 + pepper, 5-try / 15-min lockout, HMAC token) | Its default is **1 000 iterations**, below its own TRD (5 000+). MQI will benchmark and pick the number (§6). Token lifetime 60 days, `userId` not `staffId`. |
| Sync engine | `apps/web/src/sync/engine.ts`, `db/db.ts`, `db/repo.ts`, `engine.test.ts` | Keep outbox, backoff, Web Lock, triggers. Push only `survey` and `attachment`; pull only schools, own surveys, dashboard and rubric version. |
| Files | `apps/web/src/files/{blobs,attach}.ts`, `lib/image.ts` | Move compression into a Web Worker (OffscreenCanvas), 1600 px at ~300 KB as today. |
| Shared | `packages/shared/src/{lib/ids,lib/dates,schemas/api,schemas/registry,permissions/matrix}.ts` | Registry shrinks to MQI entities; matrix becomes 3 roles. |
| Web shell | `vite.config.ts`, `sw.ts`, `app/UpdateBanner.tsx`, `features/auth/*`, `features/admin/IssuePassword.tsx` | Restyle to MQI tokens (Space Grotesk, current colours, phone column). |

Port **unchanged** from MQI master: `scoring.ts`, `method2-items.ts`, the four snapshots, `method1-items.ts`, `method1-legacy-items.ts`, `condition-overrides.ts`, `rubric-version.ts`, `content.ts`, the rubric lookup in `export/find-survey.ts`, `single-survey-workbook.ts`, `single-survey-pdf.ts`, `draft-export.ts`, `all-responses-workbook.ts`, `image/compress.ts` (for the EXIF/fallback logic).

## 3. Repository layout

```
/                      npm workspaces, tsconfig.base.json (strict + noUncheckedIndexedAccess), eslint, vitest.config.ts
packages/shared        rubric/ (current + frozen snapshots + version lookup), scoring.ts, registry.ts, schemas (Zod),
                       rules.ts (Appendix C cross-field rules), permissions.ts, api.ts (actions, error codes, apiVersion)
apps/gas               src/core/*, src/actions/*, build.mjs (esbuild → dist/Code.js), .clasp.staging.json / .clasp.prod.json
apps/web               Vite + React 19 + Router; src/{db,sync,files,features/{auth,home,survey,review,dashboard,admin},workers,sw.ts}
tools/fixtures         read-only JSON exported from production (golden tests)
tools/export-fixtures  one-off read-only exporter (Sheets API, values only)
reference/             git clone of mja8291/tcf @ master 0a4a75c — .gitignored, never written
docs/                  parity-notes.md, cutover-plan.md, trd-v2-architecture.md, migration-plan.md
firebase.json, .firebaserc   Hosting → tcf-mqi-app-761a8, CSP + security headers
```

## 4. Key design decisions (and why)

1. **Writing to the shared tabs safely while v1 is live.** v1 appends with the Sheets API `values.append` and takes no Apps Script lock. A v2 `getLastRow()+1` → `setValues` could therefore **overwrite** a row that v1 appends at the same moment. v2 will instead call the **Sheets Advanced Service** `Values.append(…, {valueInputOption: "RAW", insertDataOption: "INSERT_ROWS"})`, with one call per tab per survey. Google serialises appends, so this is collision-safe and RAW. Rows are still built header-driven, the script lock still wraps the read-check-write, and missing columns are still added at the end. This departs from "one `setValues` per range" for the response tabs only; the v2-only tabs use `setValues`.
2. **RAW without changing cell types.** v1 writes strings with USER_ENTERED, so `"85"` lands as a number and `"YES"` as text. Under RAW a string `"85"` would stay text and could break the dashboard and the Looker/pivot analysis. v2 will send typed values: numbers for score, duration and mm columns, and strings for everything else. Before Phase 3, I'll read the production tabs with `UNFORMATTED_VALUE` (read-only) to record the type of every column and assert it in a test. ISO timestamps stay strings, as under v1. A text value starting with `=` is stored as text.
3. **Idempotency per tab.** `sync.push` checks the Survey ID in `Method 2 Responses` through a CacheService index (sharded under 90 KB, with a fallback that reads the Survey ID column). If the ID is already present, the call returns ok and writes nothing. Each tab append is atomic, so a survey is either fully in a tab or not in it at all.
4. **Photo rows.** Under v1 the Drive link is known at submit time. Under v2, files upload *after* the parent survey is on the server, so the push writes note-only attachment rows. Each photo's `MQI Survey Attachments` row (same 5 columns, `Photo URL` = Drive `webViewLink`, never shared publicly) is appended when its last chunk lands. A new v2-only **`Files`** tab (attachmentId, surveyId, driveFileId, chunk state) makes every chunk and every row idempotent. Drive folder layout stays `{root}/{Region}/{Campus}/{YYYY-MM-DD} MQI Survey - {id8}/[{Floor} - {Type} - {Name}/]{Item}.jpg`.
5. **Scores** are computed on the phone by `packages/shared` and **recomputed on the server** from the location conditions. If they disagree, the push is rejected with `VALIDATION`. Stored values keep v1's `Math.round`.
6. **Method 1.** v2 cannot inherit v1 drafts (different origin), so v2 never starts or finishes a Method 1 survey. Method 1 code is kept for reading history and exports only.
7. **Pull is MQI-sized:** `schools.list` (CacheService), the user's own surveys (Survey ID index → rows), `dashboard.get` (5-min cache, v1 logic unchanged: dedupe per Survey ID, latest per school+method), and `rubricVersion` returned in every response envelope.

## 5. Conflicts between FR and Stack B (recorded in `docs/parity-notes.md`)

| FR | v1 behaviour | v2 behaviour | Status |
| --- | --- | --- | --- |
| FR-AUTH-1/2 | Self sign-up, admin sets Approved=YES in the sheet | **Decided: keep self sign-up.** New action `auth.signup` creates a pending row in `Users v2` (with the hash in `Credentials`); the admin approves in-app. `admin.issuePassword` stays for resets and forces a change at next login. FR-AUTH-3 messages unchanged. | Decided 28 Oct |
| FR-AUTH-11 | Sign-in can be switched off | Always on | Brief decides; noted |
| FR-AUTH-5 | School list open before sign-in | `schools.list` requires a session (sign-in always precedes a survey) | Proposed; noted |
| FR-AUTH-6 | HttpOnly cookie, sliding 60 days | Token in IndexedDB, 60 days, re-issued by `auth.whoami`, protected by CSP | Brief decides; noted |
| FR-OFF-4 | A failure stops the run | No head-of-line blocking: a permanent failure is marked failed and the queue continues | Brief decides; noted |
| FR-EXP-2 + dashboard downloads | Any signed-in, approved user can download any survey and the all-responses export | **Decided: keep v1 behaviour.** Two new read-only actions: `surveys.get` (one survey by ID, any approved user) and `export.rows` (both response tabs, paged, any approved user). `sync.pull` still syncs only the user's own surveys to the phone. | Decided 28 Oct |
| Golden test "to the decimal" | Sheet stores `Math.round` integers | Test asserts the exact stored integer, plus an unrounded match where the Excel export can recalculate it | Noted |

## 6. Phases and exit criteria

Every phase ends with `typecheck`, `lint`, `test` and `build` green, and one commit.

1. **Scaffold.** Create the workspaces, strict tsconfig, ESLint, Vitest, Playwright (Edge and Chrome), GitHub Actions CI, `firebase.json` and `.firebaserc` (tcf-mqi-app-761a8), and the `reference/` clone. *Exit:* CI green on an empty app. Remote: **`mja8291/tcf-mqi-v2` (private)**. You create the empty repo and I push to it.
2. **Shared package.** Port the rubric, snapshots, version lookup and scoring byte-for-byte; add the registry, Zod schemas, Appendix C rules and permission matrix; write `tools/export-fixtures` (read-only) and export at least 50 Method 2 surveys covering all five rubric versions (including blank), plus Method 1 history. *Exit:* golden parity passes for every fixture. **Risk:** production may hold fewer than 50 Method 2 surveys; if so I'll take all of them and tell you.
3. **Apps Script API.** All 18 actions (the brief's 15 plus `auth.signup`, `surveys.get`, `export.rows`) against the fake; RAW typed append; idempotency; header add-column; PBKDF2 benchmark run inside Apps Script (target `auth.login` ≤ ~3 s, recorded in the README); lockout and global throttle; ErrorLog; deploy to a **staging** Apps Script project bound to staging copies. *Exit:* server tests cover idempotency (including a lost response), header mapping, RAW types, auth, lockout, the scope of every action, chunked upload, and v1 appending concurrently.
4. **Web app and offline engine.** Screens at parity, Dexie stores, outbox, sync triggers, autosave (immediate / 2 s / 12 s / on hide), active-survey recovery, Workbox, persist(), photo cache budget, compression in a worker. *Exit:* a Playwright test on the production build that completes a full survey offline with photos, reloads, kills the context and reopens, then syncs exactly once with no duplicate rows (checked against the fake).
5. **Exports, dashboard, admin.** Excel and PDF generated in the browser using the version lookup; dashboard; admin screen (list, approve, revoke, issue temporary password). *Exit:* exports match v1 output for the fixture surveys cell for cell (values and formulas), and dashboard figures match v1 on the staging data.
6. **Android TWA.** A new Bubblewrap project, `assetlinks.json` on Hosting. **Needs:** package name and signing SHA-256 (asked at Phase 6).
7. **Staging pilot.** Deploy to staging, plus a field checklist: weak network, airplane mode, kill and restore, and a 40-location survey with 60 photos.
8. **Cutover plan.** `docs/cutover-plan.md`: parallel run, the `Source App` column (filled `v2` by v2 only), the user notice, an empty-queue checklist per surveyor, and accounts created fresh in `Users v2`. Not executed without your approval.

## 7. Environments

| | Web | API | Data |
| --- | --- | --- | --- |
| Dev | `vite` :5173 | real gas code on the in-memory fake, :8787 | seed fixtures, `@tcf.test` logins |
| Staging | a second Hosting site or Hosting channel on tcf-mqi-app-761a8 (I propose `tcf-mqi-app-761a8-staging`) | staging Apps Script project (versioned deployment) | **copies** of the response spreadsheet, the schools spreadsheet and the photo folder, owned by the department account |
| Production | tcf-mqi-app-761a8.web.app | production Apps Script deployment | the live spreadsheet (append-only for v2) and the department Drive folder |

## 7a. Drive layout (decided 28 Oct)

The v2 root folder is `1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm`, owned by the department account. `setup()` creates the missing pieces inside it and never renames or deletes anything:

```
<v2 root>/
  01 Production/
     MQI v2 System (spreadsheet)    Users v2, Credentials, Sessions, Files, ChangeLog, AuditLog, ErrorLog
     Survey Photos/{Region}/{Campus}/{YYYY-MM-DD} MQI Survey - {id8}/[{Floor} - {Type} - {Name}/]{Item}.jpg
  02 Staging/
     MQI Responses (STAGING)        copy of the production responses spreadsheet
     MQI v2 System (STAGING)
     Survey Photos/
  03 Backups/                       dated copies of the System spreadsheet before each schema upgrade
  04 Exports/                       reserved for admin exports
```

**A change from the brief:** the v2-only tabs (especially `Credentials`) go in a separate **MQI v2 System** spreadsheet that only the department account can open, not alongside the response tabs. Reviewers who can open the responses spreadsheet would otherwise see password hashes and session data. Survey rows still go to the **existing** `Method 2 Responses` and `MQI Survey Attachments` tabs, and the existing responses spreadsheet stays where it is. This is recorded in `docs/parity-notes.md`.

## 8. Risks

- **Concurrent v1/v2 appends.** Handled by Advanced Service append (§4.1) and covered by a test.
- **Cell-type drift under RAW** (§4.2) could break pivots without anyone noticing. Covered by a column-type audit and a test.
- **Schools spreadsheet access.** The Apps Script runs as `tcfengineeringdepartment@gmail.com`, which must be able to read the separate schools spreadsheet.
- **Drive quota.** The department account has 15 GB shared with Gmail; check its free space before the pilot.
- **Apps Script cold starts plus PBKDF2** may push `auth.login` past 3 s, which may force fewer iterations than hoped. The number will be measured, not assumed.
- **Photo URL access.** v2 links point into the department Drive (not public). Reviewers who open links from the sheet need view access granted through Drive sharing to named people, which is your call.

## 9. Information I need before or during the phases

- Phase 1: create the empty private repo `mja8291/tcf-mqi-v2` on GitHub.
- Phase 2: **production** spreadsheet ID (read-only, for fixtures and the column-type audit) and schools spreadsheet ID.
- Phase 3: **staging** spreadsheet ID, staging schools spreadsheet ID and staging Drive folder ID (copies you create under the department account), plus the staging Apps Script project, or permission for me to create it with clasp once you have run `clasp login` as the department account.
- Phase 6: TWA package name and Play signing SHA-256.
- Phase 8: cutover date and the order users move in.
