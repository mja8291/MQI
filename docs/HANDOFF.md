# MQI v2 — Handoff for a new Claude session

Written 2026-11-11 after **W66**; updated 2026-11-14 after **W72** (latest code commit `ec08cee`, everything pushed to `main`).
Read this first, then `README.md`, then the newest rows of `docs/parity-notes.md` (one row per work item W1–W72; it is the project's change log and decision record).

---

## 1. What the project is

**TCF MQI v2**: an offline-first **Maintenance Quality Index** survey app for The Citizens Foundation (TCF) school campuses in Pakistan.

- An engineer or surveyor visits a campus. They walk floor by floor and record **locations** (each classroom, toilet, lab, room, corridor, facade, external development, roof, guardroom, canteen, UGWT). At each location they rate **item groups** from a rubric (Good / Ok / Poor / Very Poor / N/A, or OK / Unsafe for safety items) and attach photos.
- The app scores the campus: Functionality 45%, Safety 25%, Aesthetics 30%. It writes one sheet row per location to Google Sheets, uploads photos to Google Drive, and shows a network **dashboard**.
- The app also produces **downloads** of a survey: the campus report as PDF (W66, extended W68–W71) and as Excel (W67), and a short **minor items report for the Principal** (W70).
- It replaced v1 (`mja8291/tcf`, Next.js on Vercel). v2 keeps v1's sheet layout so existing analysis keeps working.

**Live**

| | Web | API (Apps Script deployment ID, same URL every deploy) | Current version |
|---|---|---|---|
| Production | https://tcfmqi.web.app | `AKfycbzTivMQLta6b4lNEjuiFFanlNN6f6A5RxYEhnN2rATS_Ey4ZivBgVfZ-c_3dzOUZYa3` | API @22 (rubric 2026-11-13) |
| Staging | https://tcfmqi-staging.web.app | `AKfycbwsqkM66cHVFVslpJfrRCpUP9GxCoDfRtq2dI1IOh_LFtncjHkwIrerl4ieNwLnIYGHhg` | API @20 (rubric 2026-11-13) |

- Android: a Trusted Web Activity `app.web.mqi_app_tcf.pk` (v1's Play Store listing reused; see `android/README.md` and `apps/web/env/.env.production`). **Signing is done by the user, never by Claude.**
- Repo: https://github.com/mja8291/MQI. It is **public**, so never commit personal data (names, emails, phone numbers) or secrets.

**Data (owned by `tcfengineeringdepartment@gmail.com`)**

| Spreadsheet | ID | Tabs that matter |
|---|---|---|
| **MQI Spreadsheet** (responses) | `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o` | `MQI Assessment Rubrics` (source of truth for the rubric), `MQI Survey Responses` (one row per location, 141 columns), `MQI Survey Attachments` (photos), `Campus Survey Plan` (1531 campuses, drives the dashboard, W63), `R&M Plan 2026-27` (265 campuses, BOQ reminder, W64), `Removed trial responses` / `Removed trial attachments` (archive of the 15 deleted trial surveys) |
| **MQI v2 System** | `1--5O3CpOI4DXROURC6vyj6l-a6qrmcHgtEXmQ6Y5j1M` | accounts, ledgers, files |
| Schools list (v1, read only) | `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q` | `Schools_Standardized` |

**The user**: works in TCF's Engineering Department; an engineer, not a software developer. Write to them in plain words, keep answers short, and give clear yes/no decisions. They send requests as numbered lists, often with spreadsheets (`.xlsx`) or briefs (`.md`) from `D:\Working_Data\Downloads\`.

---

## 2. Architecture

```
packages/shared   everything both sides must agree on: rubric, scoring, Zod schemas, sheet row mapping,
                  read models (dashboard, survey lookup), campus plan, the report model (W66), API contract
apps/gas          the API: one Google Apps Script web app, TypeScript bundled by esbuild, deployed with clasp.
                  src/core/* (router, auth, sync, reads, responses, files, setup), src/adapters/{gas,memory}.ts,
                  src/dev/server.ts (the same server code on an in-memory Sheets/Drive fake, for dev and e2e)
apps/web          React 19 + Vite + React Router PWA, Tailwind v4, Dexie (IndexedDB), Workbox service worker,
                  Firebase Hosting. src/pages/*, src/lib/{offline,auth,export,image}, src/sw.ts, e2e/ (Playwright)
tools/fixtures    golden v1 parity fixtures and the v1 ⇄ v2 parity suite
android           TWA wrapper instructions
reference/        read-only clone of v1 at 0a4a75c (gitignored; CI clones it)
docs/             parity-notes.md (decision log per W item), migration/cutover/pilot/setup docs, this file
```

**Key decisions (and why)**

- **Offline first.** Surveyors work in campuses with poor signal. Drafts and photos live in IndexedDB (`apps/web/src/lib/offline/db.ts`). A sync queue sends the survey, then photos in resumable chunks. Nothing is lost if the app is closed.
- **One shared package.** Scoring, rubric and row mapping run identically on the phone, the server and the exports, so the numbers can never disagree.
- **Google Sheets as the database.** This kept v1's layout and lets the engineering team analyse data directly in Sheets. The API runs as the department account, so users never need Google access themselves.
- **Rubric versioning.** Each survey row stores `Rubric Version`. Frozen snapshots exist for every version (`packages/shared/src/rubric/items-*.ts`), and `rubricGroupsFor(version)` picks one. The current version is **`2026-11-13`** (`rubric/items.ts`, `RUBRIC_VERSION` in `rubric/rubric-version.ts`). History since W66: 2026-11-11 (W68: "*" items as in the sheet; roof access staircase/ladder/none), 2026-11-13 (W70: ladder 100%; basins/drains by room name). The last two snapshots (`items-v20261107.ts`, `items-v20261111.ts`) were generated as JSON from `items.ts` before each change (script idea: import RUBRIC_GROUPS with tsx and write it out).
  - **To bump the rubric:** freeze the current list, edit `items.ts`, bump `RUBRIC_VERSION`, add the version to `versions.ts`, then deploy the **server first** (clasp), then the web app. Old phones keep submitting under their old version and the server accepts them.
  - **Exception (W66, user's decision 2026-11-10):** the PDF report always re-scores with the **current** rubric. The user said: "As far as weightages are concerned you should follow update rubrics."
  - The Excel export and stored sheet scores still use the version the survey was submitted under.
- **Scoring rules** (`packages/shared/src/scoring.ts`):
  - Rating values: Good 100, Ok 75, Poor 50, Very Poor 25. N/A is excluded, and the remaining weights re-normalise.
  - An answer option can carry its own `score` (W68, `groupConditionScore`): **Access to roof area /tanks** at the Roof location offers Proper staircase (Good, 100) / Ladder (stored as Poor, **100** since W70; 50 under 2026-11-11) / None (stored as Very Poor, **0**) / N/A. Reports draw such answers by their score (`shownCondition`: Ladder is drawn as Good). The Review page's roof-access question is filled in from the Roof location's answer (W68).
  - **Major vs Minor** (`principalMaintained`): Minor = exactly the rubric sheet's "*" groups (W68): Access to roof area, Overflow Disposal, Distribution Board, all Functionality groups except Sewerage System and Internal Flooring, and Signage. Major/Minor scores are stored per survey (`Major Score`/`Minor Score`); the dashboard shows the stored ones (surveys before W68 were split with the old list), reports re-score.
  - Two-answer items (OK/Unsafe, Roof Access Available/Not Available, YES/NO) score 100 / 25 (`rubric/condition-overrides.ts`). The user confirmed YES 100%, NO 25%.
  - Combining locations: **Safety groups take the worst rating across locations; Functionality and Aesthetics take the average.**
  - Overall = weighted average over all groups with weight = category weight × group weight (equivalent to 0.45F + 0.25S + 0.30A when nothing is N/A).
  - Bands: Poor < 50, Average 50–67, Good 67–84, Excellent ≥ 84.
- **Derived items (W56).** "Slab + Screeding/Waterproofing thickness assessment" (Safety 10) and "Proper Overflow Disposal System" (Safety 4) are not picked at a location. They are computed from the drilling card and the Review page (`rubric/derived.ts`, `withDerivedScores`) and written onto Roof locations. The server re-checks them.
- **Location types.**
  - **Items can depend on the location's name** (W70, `onlyAtNames`, `groupAppliesAt`): Wash Basin/Taps and Sewerage System only at labs named Wet Lab or Bio/Chemistry Lab (not Dry Lab, DLP, Physics Lab) and at the Other Room named Pantry. `rubricGroupsForLocation(type, name)`; renaming a scored location drops ratings its new name doesn't have (W72). `ADDED_LATER` excuses a Pantry without them from phones not yet updated.
  - Guardroom has Toilet's items plus Distribution Board (W59).
  - Canteen has Other Room's items minus Green board (W58).
  - UGWT has Other Room's Safety items plus External Plumbing and Plaster (W58).
  - The legacy W56 type "Canteen & UGWT" is still accepted.
  - `ADDED_LATER` lets the server accept older phones without new items.
  - Guardroom, Canteen and UGWT are shared across an e-compound and pre-fill from a sibling campus (W60).
- **Dashboard (W63/W65, W67–W71).** Rows: score over Safe/Unsafe, then three boxes **XLS / PDF / MIN** (W67, W70); Major/Minor per campus (always on wide screens, on tap on phones) and their averages (W68); a search box over the campus list (W71). The plan tab and the R&M Plan list **School IDs**; the app's campus list is keyed by **Campus ID**, so since W68 each campus carries its units' `schoolIds` and matching uses those (cache key `schools.v4`). "Not in App list" is 16 (it showed 53), and the R&M reminder covers all 265 campuses (it covered 186). Driven by the `Campus Survey Plan` tab. It shows one hierarchy: Total → Exempted (PSSP/PSRP + last 5 yr) | Assessed (Safe/Unsafe, with/without App) | Pending. Checks confirm the parts add up, and a region filter applies to everything. "Checking/Training" surveys (W62 `Survey Purpose` column) are left off the dashboard. The server caches the dashboard; `forgetDashboard` clears it after each write.
- **R&M Plan reminder (W64).** Campuses marked "Planned in this year" in the `R&M Plan 2026-27` tab show a "prepare the BOQ" reminder on Find school, Review and Done. The server's schools cache key became `schools.v3` (now `schools.v4`, W68) (`apps/gas/src/core/reads.ts`); bump it whenever the school list's shape changes.
- **Startup (W61).** Android users got stuck on the logo. The fix:
  - `public/boot.js` and `boot.css` show a startup screen with Try again / Repair.
  - `firebase.json` sends no-cache on `/` and routes, and doesn't rewrite missing `/assets/**` to HTML.
  - `vite:preloadError` reloads once.
- **Drilling check (W70).** With drilling YES, the drilled-hole photo ("Slab thickness recorded (mm)") is required: the Roof location can't be saved and Submit stays off until it is attached (`drillingPhotoMissing`). The Review page lists what is missing under a greyed-out Submit (W72).
- **Photos and storage (W67, W69).** Photos ≤ 450 KB each. Notices (`lib/photo-limits.ts`): amber past 60 photos per survey, red past 100; a hint from the 4th photo on one item; amber below 200 MB free for the app, red below 50 MB. Nothing is blocked. "Save all photos to phone" remembers saved photos and skips them (Chrome on Android asks "Download file again?" per duplicate file: a 153-photo survey once queued 153 pop-ups); asks first above 20.
- **Working sign (W70).** `lib/busy.ts` counts every API call (`rawCall`) and report download; the corner Online/Offline tag (W67, `components/NetworkTag.tsx`) then shows a turning TCF logo (`components/ui/WorkingLogo.tsx`), as does the Sign in button.
- **PDF campus report (W66).**
  - Model: `packages/shared/src/report/model.ts` (`buildReportModel`, `reportSourceFromFound`). Rules and colours: `report/config.ts` (thresholds 260 mm, 110 mm, 3 mm, `UNSAFE_SOLID_EXCEPTIONS`).
  - Renderer: `apps/web/src/lib/export/report-pdf.ts` (pdf-lib, A4 landscape, vector charts, Helvetica). Browser side: `apps/web/src/lib/export/report.ts` (photo loading and shrinking).
  - Page order now (W68–W71): 1 summary (safety alerts first, gauge, category cards **Safety first**, no survey ID anywhere — footers show campus · date); 2 points lost; 3 **Major and minor items** (score cards, minor shortcomings count, chart); 4 **Minor items by location** (Poor/Very Poor highlighted; includes a "Roof · upkeep" row from the Review page's roof clean / rain spouts answers, W71); 5–6 matrices; 7 structural panel; 8 **Drilling check** (per hole: total slab + screed vs 260 mm and screed vs 110 mm, standard vs actual cross-sections to scale); 9 **Questionnaire and scoring** (the pre-App "ACM individual form" table); photos grouped **Safety → Minor → Major → Site checks**, worst first; methodology and data quality. The item-profile line graph was removed (W70).
  - Photos load 4 at a time with one retry each (W67, W71); photos that can't be loaded get a red notice page, and the reasons go to the ErrorLog tab (`reportPhotoLoader`); a survey with no photos on the server says so.
  - **Excel** (W67, `report-xlsx.ts`): Summary, Score by group, Major and minor, Matrix by item, Matrix by location, Structural, Questionnaire, Photos, Notes, then v1's formula sheet last (unchanged, v1 parity).
  - **Minor items report for the Principal** (W70, `renderMinorReportPdf`): minor items rated Poor/Very Poor by location (plus roof upkeep), and their photos only. "MIN" box on dashboard rows, button on the Done screen.
  - The offline draft download (`draft-export.ts`) builds the same report from the phone.
  - `surveys.get` now returns the current rubric's columns and the unsafe parts per location.

---

## 3. Status

**Done and deployed (prod API @22, staging @20, both web apps):** W1–W72. Highlights from the latest sessions:

| Item | What |
|---|---|
| W55 | Soffit risk factor; mm/inch drilling depths; N/mm² on the Schmidt Hammer; at least one level besides External and Roof |
| W56 | Rubric sheet 2026-11-07 (weights, 2 derived Safety groups); Guardroom/Canteen & UGWT; dashboard Unsafe flag |
| W57 | Dashboard reads production in 5 reads instead of 25 |
| W58–W60 | Canteen/UGWT items; Distribution Board at Guardroom; sibling pre-fill |
| W61 | Android stuck-on-logo fix |
| W62 | Survey Purpose (actual assessment vs checking/training); 15 trial surveys archived and removed |
| W63–W65 | Dashboard from the campus survey plan, then a full redesign |
| W64 | R&M Plan 2026-27 BOQ reminder |
| W66 | PDF campus report redesign, plus the by-location matrix |
| W67 | Online/Offline tag; low-storage and too-many-photos notices; Excel as a campus report; PDF photos 4 at a time; dashboard row XLS/PDF boxes |
| W68 | Rubric 2026-11-11: sheet "*" items, roof access staircase/ladder/none; Major/Minor pages, minor items by location and the pre-App questionnaire table in PDF and Excel; dashboard Major/Minor; School ID matching; photos grouped Safety/Minor/Major |
| W69 | "Save all photos" skips photos already saved (153 "Download again?" pop-ups) |
| W70 | Working sign; rubric 2026-11-13 (ladder 100%, basins/drains by room); drilled-hole photo required; no line graph, no survey ID, Safety first; drilling standard vs actual page; minor items report for the Principal |
| W71 | Report photos retried, missing photos noticed and logged; roof upkeep with the minor items in both reports; dashboard search |
| W72 | Pre-training audit: Review page says why Submit is off; renaming drops ratings the new name doesn't have |

**In progress / waiting on the user**
- **Training sessions** with surveyors started 2026-11-14. Expect feedback and quick fixes. Trainees should open the app once with signal before going on site (Home: "✓ Ready to work offline").
- **Report photos** (W71): the user confirmed photos show in a report downloaded from the live dashboard after W71. If they go missing again, read the ErrorLog tab ("Campus report: N of M photos not loaded — …").
- **Umeed Ka Chiragh Campus** (survey 2026-11-13 13:44 UTC) has **no photos** on the server; its surveyor's phone may still hold them (Sync Pending).
- None of W67–W72 has been tried on a real phone by Claude (the user and surveyors use them).

**Exact next steps (in order)**
1. Handle feedback from the training sessions (next work item: **W73**).
2. Open user-side follow-ups (remind, don't do):
   - The **16 "Survey with App" campuses not in the App list** (W68 workbook `MQI-campus-school-list-2026-11-11.xlsx`, in the folder above the repo): fix the school list or the plan tab.
   - Trash the 17 trial photos in Drive as the owner account. Claude had no permission; the links are in `Removed trial attachments`.
   - Test on real phones (`docs/pilot-checklist.md`).
3. Possible improvement (not asked): `files.get` reads the whole Files register (~2,600 rows) for every photo; a TextFinder lookup would make report photos faster on big surveys.
4. Optional, only if asked: embed a real font in the PDF (needs `@pdf-lib/fontkit` plus a TTF). Helvetica is used instead, and all symbols are vector shapes.

---

## 4. Known bugs and gotchas

**Product**
- **Rubric sheet edits (MQI Assessment Rubrics tab):** the app doesn't read this tab (it is the human source of truth); keep it in step when asked (row 10, roof access, was updated for W68 and W70). With the Sheets `updateCells` request, the `fields` mask applies to **every cell in the range**: a cell sent as `{}` gets those fields cleared. Send only the cells you change. (This blanked row 10's labels once; they were restored the same minute.)
- **PDF fonts:** text the Helvetica font can't draw (e.g. Urdu) is replaced with `?` by `safe()` in `report-pdf.ts`.
- **Older surveys in the PDF:** re-scoring with the current rubric gives different numbers from the sheet. For the fixture: stored 76/81/61/83, re-scored 78/79/67/83. The methodology page lists the differences, which is intended.
- **Online PDF needs the API:** unsafe parts (Column/Wall) only reach the online PDF from API @18/@20 onward. Older phones get them only after the API deploy.
- **The v1 parity suite** (`tools/fixtures/src/v1-parity.test.ts`) no longer compares PDFs (removed in W66, by design). It runs only when `reference/` is present (`MQI_V1_PRESENT=1`).

**Environment and tooling (the new Windows PC, since 2026-11-11)**
- **Shells:** Git Bash and PowerShell. **No Python, no Java.** Use `node` scripts (`npx tsx` runs TS scripts; name them `.mts` for top-level await), or the Edit tool.
- **Quoting:** `node -e` with template literals or `${…}` inside bash breaks often (bash substitutes them). Write the script to a scratch file with the Write tool, or use the Edit tool. A failed `node -e` usually wrote nothing, but check.
- **Signed in on this PC:** Firebase CLI 15.27 (global) and clasp, both as the department account. If a login expires: run `firebase login --interactive` (pipe `n` answers in for its Y/n prompts) or `npx clasp login` (from `apps/gas`) in the background and give the user the printed accounts.google.com link. The Terminal panel tool can't type into the user's terminal here (EPERM). Firebase usage sharing is off.
- **Firebase deploy** sometimes prints "Deploy complete!" followed by "An unexpected error has occurred": the deploy itself worked. Always verify by comparing the live `index.html` with `dist/index.html` (retry a few times for the CDN) and grepping the built assets for the deployment ID.
- **Playwright** Chromium and headless shell are installed. The full e2e suite takes 9–25 minutes here; `offline-matrix` test 4 (60 photos) once timed out in a full run and passed alone.
- **Public data downloads:** the MQI Spreadsheet, the schools list and the E-Compound sheet are link-shared, so `curl …/export?format=csv&gid=…` fetches a tab without going through the Sheets connector (no context cost). The MQI v2 System sheet is not shared: use the Sheets connector.
- **Viewing a PDF here:** put a pdf.js viewer HTML (cdnjs `pdf.js/3.11.174`) and the PDF in `apps/web/public/__pdfview/` (untracked), start the `web` dev server, open `/__pdfview/index.html?f=x.pdf&p=N`, and **delete the folder before any build** (it would be precached). Starting an ad-hoc node server was refused by the permission classifier.
- **Don't build concurrently:** never run a staging/prod build while `npm run e2e` is running. Both use `apps/web/dist`, and staging once received the e2e build. Verify the API after each web deploy by grepping the deployed `api-*.js` for the deployment ID (prefix `AKfycbwsqk…` = staging, `AKfycbzTiv…` = prod).
- **Firebase EPERM:** `firebase deploy` failed when the shell's working directory was inside `dist/assets`. Run deploys from the repo root.
- **No `gh` CLI.** Read CI with `curl -s "https://api.github.com/repos/mja8291/MQI/actions/runs?per_page=3"`. CI run #42 once failed with a GitHub internal server error; an empty commit re-ran it.
- **Flaky e2e:** `e2e/robustness.spec.ts` test 1 is occasionally flaky (passes on retry). A full e2e run takes about 16 minutes.
- **Staging and prod need a sign-in.** Claude must not enter passwords on hosted sites. Verify deploys by fetching the built assets (e.g. grep the `report-pdf-*.js` chunk for expected strings). For UI checks use local dev (`npm run dev:api` + `npm run dev`) with the dev logins.
- **Dashboard cache:** the server caches dashboard reads. If new rows don't show, `forgetDashboard` must run (it does after every sync write).

---

## 5. Important file paths

| What | Path |
|---|---|
| Current rubric (groups, weights, locations, location types, cards) | `packages/shared/src/rubric/items.ts` |
| Rubric version and frozen snapshots | `packages/shared/src/rubric/rubric-version.ts`, `rubric/items-v*.ts`, `rubric/versions.ts` |
| Rubric texts (questions, risk factors, guidance, purpose) | `packages/shared/src/rubric/content.ts` |
| Derived items | `packages/shared/src/rubric/derived.ts` |
| Scoring | `packages/shared/src/scoring.ts` |
| Types (DrillingCheck, SiteChecks, ColumnCheck …) | `packages/shared/src/types.ts` |
| Survey schema and rules | `packages/shared/src/survey.ts` |
| Sheet mapping, dashboard, survey lookup (`foundSurveyFromRows`) | `packages/shared/src/sheets.ts`, `read-models.ts` |
| Campus plan / R&M plan | `packages/shared/src/campus-plan.ts` |
| API contract | `packages/shared/src/api.ts` |
| PDF report model, config, fixture | `packages/shared/src/report/{model,config,fixture-01a1911f}.ts`, tests `packages/shared/src/w66.test.ts` |
| PDF renderer, browser glue, tests | `apps/web/src/lib/export/{report-pdf,report}.ts`, `report-pdf.test.ts` |
| Downloads (submitted / draft) | `apps/web/src/lib/export/submitted.ts`, `draft-export.ts` |
| API server | `apps/gas/src/core/*.ts`, tests `apps/gas/src/core/server.test.ts`, dev fake `apps/gas/src/dev/server.ts` |
| Dashboard UI | `apps/web/src/pages/dashboard/page.tsx`, `apps/web/src/components/dashboard/*` |
| Survey screens | `apps/web/src/pages/survey/*`, state `apps/web/src/lib/survey-context.tsx` |
| Offline store | `apps/web/src/lib/offline/db.ts`, `sync.ts` |
| Startup screen | `apps/web/public/boot.js`, `boot.css`, `apps/web/src/lib/boot.ts` |
| Hosting headers/CSP | `firebase.json` |
| Env per environment | `apps/web/env/.env*` |
| Excel campus report, principal's minor report | `apps/web/src/lib/export/report-xlsx.ts`, `renderMinorReportPdf` in `report-pdf.ts` |
| Photo/storage notices, working sign, network tag | `apps/web/src/lib/photo-limits.ts`, `lib/busy.ts`, `components/NetworkTag.tsx`, `components/survey/PhotoLoadNotice.tsx` |
| Save photos to phone | `apps/web/src/lib/photos-to-phone.ts`, `components/survey/SavePhotosButton.tsx` |
| Decision log | `docs/parity-notes.md` |

**Local-only files (not in git; copy them when moving PCs)**
- `apps/gas/.clasp.staging.json` and `apps/gas/.clasp.prod.json`: the Apps Script script IDs. Deploys fail without them.
- `tools/fixtures/raw/`: raw production exports.
- `reference/`: the v1 clone (re-clonable).
- `~/.claude/` (Claude memory and history).
- The Android keystore: kept by the user.

---

## 6. Run, test, deploy

Requires Node 22+ (new PC: Node 26.13, Firebase CLI 15.27 global, clasp 3.4 local).

**Run locally**

```bash
npm install
```

```bash
npm run dev:api
```

```bash
npm run dev
```

The API runs at http://localhost:8787 on an in-memory fake, and the web app at http://localhost:5173. Dev logins (local fake only): `admin@tcf.test`, `surveyor@tcf.test`, `reviewer@tcf.test`, password `mqi-dev-pass-1`.

**Test**

```bash
npm run check
```

That is typecheck, lint, unit tests and build. Single projects:

```bash
npx vitest run --project shared
```

`--project web` and `--project gas` work the same way. End-to-end tests (Playwright on the production build, about 16 minutes; first time run `npx playwright install chromium`):

```bash
npm run e2e
```

Write the fixture PDF for review:

```bash
cd apps/web && REPORT_OUT=/path/report.pdf npx vitest run src/lib/export/report-pdf.test.ts
```

**Deploy.** Always staging first, then check GitHub CI is green, then production, and only when the user says so.

```bash
npm run push:staging -w @mqi/gas
```

```bash
cd apps/gas && npx clasp -P .clasp.staging.json deploy -i AKfycbwsqkM66cHVFVslpJfrRCpUP9GxCoDfRtq2dI1IOh_LFtncjHkwIrerl4ieNwLnIYGHhg
```

```bash
npm run deploy:staging -w @mqi/web
```

Production:

```bash
npm run push:prod -w @mqi/gas
```

```bash
cd apps/gas && npx clasp -P .clasp.prod.json deploy -i AKfycbzTivMQLta6b4lNEjuiFFanlNN6f6A5RxYEhnN2rATS_Ey4ZivBgVfZ-c_3dzOUZYa3
```

```bash
npm run deploy:prod -w @mqi/web
```

`deploy -i <id>` updates the existing deployment, so the URL never changes. Run web deploys from the repo root. Afterwards, check that the deployed `api-*.js` contains the right deployment ID.

**Conventions**
- Each change is a numbered work item (next: **W73**). Add a row to `docs/parity-notes.md`, add tests (`packages/shared/src/wNN.test.ts`, `server.test.ts` cases, `apps/web/e2e/wNN.spec.ts` as fits), and write the commit message as one plain sentence ending with `(WNN)`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on `main` (the user's setup; there are no PRs).

---

## 7. Always / never (from the user)

**Always**
- **Get explicit approval before every production deploy.** The user says "Deploy both" / "Deploy to staging and production" / "Go-ahead for deployment". Approval for one change doesn't carry to the next.
- **Check that GitHub CI passed** for the pushed commit before deploying to production.
- Deploy staging before production.
- **Push to GitHub when work is committed.** The user said "Allow pushes".
- Confirm before any permanent deletion, and archive first. The trial-survey removal used "Archive, then remove": rows were copied to the `Removed trial …` tabs first.
- Follow the **updated rubric's weights** (sheet `MQI Assessment Rubrics`) wherever weights are shown or scored for reports.
- Use plain language, short answers, and say what's not done or not verified.
- **Keep the rubric sheet in step** when the user asks (they asked for W68 and W70), editing only the cells that change.
- The user's usual approval is "Deploy both" (staging and production, after the tests and GitHub CI pass). Approval covers that change only.

**Never**
- **Never use, store or enter the Android keystore passwords** the user once shared. Signing stays on the user's side.
- **Never sign out of accounts or change credentials**, and never enter passwords into hosted sites.
- **Never touch v1:** the old repo `mja8291/tcf`, its Vercel project, v1's production spreadsheet and Drive folder are read only. No commits, pushes, deploys or write commands there.
- **Never edit v2 production data** (sheets, Drive) unless the user explicitly asks for that specific change. Past examples: deleting the 15 trial surveys, adding the plan tabs, adding the Survey Purpose column.
- **Never commit personal data or secrets** to the public repo. Test fixtures are anonymised ("Engineer A", no emails).
- **Never run a staging/prod build while e2e is running.**
- Never deploy to production without the user's go-ahead in that conversation.
