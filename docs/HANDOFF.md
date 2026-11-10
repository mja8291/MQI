# MQI v2 — Handoff for a new Claude session

Written 2026-11-11, after work item **W66** (latest commit `ad339e2`, everything pushed to `main`).
Read this first, then `README.md`, then the newest rows of `docs/parity-notes.md` (one row per work item W1–W66; it is the project's change log and decision record).

---

## 1. What the project is

**TCF MQI v2**: an offline-first **Maintenance Quality Index** survey app for The Citizens Foundation (TCF) school campuses in Pakistan.

- An engineer or surveyor visits a campus. They walk floor by floor and record **locations** (each classroom, toilet, lab, room, corridor, facade, external development, roof, guardroom, canteen, UGWT). At each location they rate **item groups** from a rubric (Good / Ok / Poor / Very Poor / N/A, or OK / Unsafe for safety items) and attach photos.
- The app scores the campus: Functionality 45%, Safety 25%, Aesthetics 30%. It writes one sheet row per location to Google Sheets, uploads photos to Google Drive, and shows a network **dashboard**.
- The app also produces **Excel and PDF downloads** of a survey. The PDF is the campus report redesigned in W66.
- It replaced v1 (`mja8291/tcf`, Next.js on Vercel). v2 keeps v1's sheet layout so existing analysis keeps working.

**Live**

| | Web | API (Apps Script deployment ID, same URL every deploy) | Current version |
|---|---|---|---|
| Production | https://tcfmqi.web.app | `AKfycbzTivMQLta6b4lNEjuiFFanlNN6f6A5RxYEhnN2rATS_Ey4ZivBgVfZ-c_3dzOUZYa3` | API @20 |
| Staging | https://tcfmqi-staging.web.app | `AKfycbwsqkM66cHVFVslpJfrRCpUP9GxCoDfRtq2dI1IOh_LFtncjHkwIrerl4ieNwLnIYGHhg` | API @18 |

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
- **Rubric versioning.** Each survey row stores `Rubric Version`. Frozen snapshots exist for every version (`packages/shared/src/rubric/items-*.ts`), and `rubricGroupsFor(version)` picks one. The current version is **`2026-11-07`** (`rubric/items.ts`, `RUBRIC_VERSION` in `rubric/rubric-version.ts`).
  - **Exception (W66, user's decision 2026-11-10):** the PDF report always re-scores with the **current** rubric. The user said: "As far as weightages are concerned you should follow update rubrics."
  - The Excel export and stored sheet scores still use the version the survey was submitted under.
- **Scoring rules** (`packages/shared/src/scoring.ts`):
  - Rating values: Good 100, Ok 75, Poor 50, Very Poor 25. N/A is excluded, and the remaining weights re-normalise.
  - Two-answer items (OK/Unsafe, Roof Access Available/Not Available, YES/NO) score 100 / 25 (`rubric/condition-overrides.ts`). The user confirmed YES 100%, NO 25%.
  - Combining locations: **Safety groups take the worst rating across locations; Functionality and Aesthetics take the average.**
  - Overall = weighted average over all groups with weight = category weight × group weight (equivalent to 0.45F + 0.25S + 0.30A when nothing is N/A).
  - Bands: Poor < 50, Average 50–67, Good 67–84, Excellent ≥ 84.
- **Derived items (W56).** "Slab + Screeding/Waterproofing thickness assessment" (Safety 10) and "Proper Overflow Disposal System" (Safety 4) are not picked at a location. They are computed from the drilling card and the Review page (`rubric/derived.ts`, `withDerivedScores`) and written onto Roof locations. The server re-checks them.
- **Location types.**
  - Guardroom has Toilet's items plus Distribution Board (W59).
  - Canteen has Other Room's items minus Green board (W58).
  - UGWT has Other Room's Safety items plus External Plumbing and Plaster (W58).
  - The legacy W56 type "Canteen & UGWT" is still accepted.
  - `ADDED_LATER` lets the server accept older phones without new items.
  - Guardroom, Canteen and UGWT are shared across an e-compound and pre-fill from a sibling campus (W60).
- **Dashboard (W63/W65).** Driven by the `Campus Survey Plan` tab. It shows one hierarchy: Total → Exempted (PSSP/PSRP + last 5 yr) | Assessed (Safe/Unsafe, with/without App) | Pending. Checks confirm the parts add up, and a region filter applies to everything. "Checking/Training" surveys (W62 `Survey Purpose` column) are left off the dashboard. The server caches the dashboard; `forgetDashboard` clears it after each write.
- **R&M Plan reminder (W64).** Campuses marked "Planned in this year" in the `R&M Plan 2026-27` tab show a "prepare the BOQ" reminder on Find school, Review and Done. The server's schools cache key became `schools.v3` (`apps/gas/src/core/reads.ts`); bump it whenever the school list's shape changes.
- **Startup (W61).** Android users got stuck on the logo. The fix:
  - `public/boot.js` and `boot.css` show a startup screen with Try again / Repair.
  - `firebase.json` sends no-cache on `/` and routes, and doesn't rewrite missing `/assets/**` to HTML.
  - `vite:preloadError` reloads once.
- **PDF campus report (W66).**
  - Model: `packages/shared/src/report/model.ts` (`buildReportModel`, `reportSourceFromFound`). Rules and colours: `report/config.ts` (thresholds 260 mm, 110 mm, 3 mm, `UNSAFE_SOLID_EXCEPTIONS`).
  - Renderer: `apps/web/src/lib/export/report-pdf.ts` (pdf-lib, A4 landscape, vector charts, Helvetica). Browser side: `apps/web/src/lib/export/report.ts` (photo loading and shrinking).
  - Page order:
    1. Safety alerts above the score, gauge, category cards, template narrative
    2. Points lost by group
    3. Item profile line
    4. Matrix by item
    5. Matrix by location (every location a row; the user asked for this)
    6. Structural panel
    7. Photos, then methodology and data quality
  - The offline draft download (`draft-export.ts`) builds the same report from the phone.
  - `surveys.get` now returns the current rubric's columns and the unsafe parts per location.

---

## 3. Status

**Done and deployed (prod API @20, staging @18, both web apps):** W1–W66. Highlights from the latest sessions:

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

**In progress / waiting on the user**
- **W66 review:** the user has the fixture PDFs (survey `01a1911f-…`, plus a 46-location test). They haven't commented on the layout yet. Expect tweak requests.
- **W66 not checked live:** no one has downloaded a report from the signed-in live app yet, or a report for a survey **with photos**. Ask the user to try one.

**Exact next steps (in order)**
1. Ask the user to download a PDF from the live dashboard (one survey with photos), and fix anything they report.
2. Open user-side follow-ups (remind, don't do):
   - Trash the 17 trial photos in Drive as the owner account. Claude had no permission; the links are in `Removed trial attachments`.
   - Check the live dashboard's "not in App list" count: it showed 53, but about 11 was expected. Likely campus-name/ID mismatches between the plan tab and the App school list (739 of 750 matched by ID or name).
   - Test on real phones (`docs/pilot-checklist.md`).
3. Optional, only if asked: embed a real font in the PDF (needs `@pdf-lib/fontkit` plus a TTF). The brief asked for embedded fonts; Helvetica is used instead, and all symbols are vector shapes.

---

## 4. Known bugs and gotchas

**Product**
- **PDF line graph:** the segment between Ceiling (Unsafe, dotted) and Wall/Column (Unsafe, solid exception) is dotted, because one end is a dotted-rule point. Segments on Wall/Column's other side are solid. Change the rule in `profilePage` if the user wants it otherwise.
- **PDF fonts:** text the Helvetica font can't draw (e.g. Urdu) is replaced with `?` by `safe()` in `report-pdf.ts`.
- **Older surveys in the PDF:** re-scoring with the current rubric gives different numbers from the sheet. For the fixture: stored 76/81/61/83, re-scored 78/79/67/83. The methodology page lists the differences, which is intended.
- **Online PDF needs the API:** unsafe parts (Column/Wall) only reach the online PDF from API @18/@20 onward. Older phones get them only after the API deploy.
- **The v1 parity suite** (`tools/fixtures/src/v1-parity.test.ts`) no longer compares PDFs (removed in W66, by design). It runs only when `reference/` is present (`MQI_V1_PRESENT=1`).

**Environment and tooling (this Windows PC)**
- **Shells:** Git Bash and PowerShell. **There is no Python.** Use `node` scripts, or the Edit tool for multi-line edits.
- **Quoting:** apostrophes inside `node -e` or heredocs broke scripts more than once. Write the script to a scratch file instead.
- **Don't build concurrently:** never run a staging/prod build while `npm run e2e` is running. Both use `apps/web/dist`, and staging once received the e2e build. Verify the API after each web deploy by grepping the deployed `api-*.js` for the deployment ID (prefix `AKfycbwsqk…` = staging, `AKfycbzTiv…` = prod).
- **Firebase EPERM:** `firebase deploy` failed when the shell's working directory was inside `dist/assets`. Run deploys from the repo root.
- **No `gh` CLI.** Read CI with `curl -s "https://api.github.com/repos/mja8291/MQI/actions/runs?per_page=3"`. CI run #42 once failed with a GitHub internal server error; an empty commit re-ran it.
- **Flaky e2e:** `e2e/robustness.spec.ts` test 1 is occasionally flaky (passes on retry). A full e2e run takes about 16 minutes.
- **Staging and prod need a sign-in.** Claude must not enter passwords on hosted sites. Verify deploys by fetching the built assets (e.g. grep the `report-pdf-*.js` chunk for expected strings). For UI checks use local dev (`npm run dev:api` + `npm run dev`) with the dev logins.
- **Viewing a PDF here:** there is no rasteriser. What worked: a pdf.js viewer HTML (cdnjs `pdf.js/3.11.174`) with the PDF embedded as base64, served from a tiny node static server, opened in the browser pane. Convert canvases to `<img>` and show one page at a time, or screenshots time out.
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
| Decision log | `docs/parity-notes.md` |

**Local-only files (not in git; copy them when moving PCs)**
- `apps/gas/.clasp.staging.json` and `apps/gas/.clasp.prod.json`: the Apps Script script IDs. Deploys fail without them.
- `tools/fixtures/raw/`: raw production exports.
- `reference/`: the v1 clone (re-clonable).
- `~/.claude/` (Claude memory and history).
- The Android keystore: kept by the user.

---

## 6. Run, test, deploy

Requires Node 22+ (this PC: Node 24.18, npm 11.16, Git 2.55, Firebase CLI 15.27 global, clasp 3.4 local).

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
- Each change is a numbered work item (next: **W67**). Add a row to `docs/parity-notes.md`, add tests (`packages/shared/src/wNN.test.ts`, `server.test.ts` cases, `apps/web/e2e/wNN.spec.ts` as fits), and write the commit message as one plain sentence ending with `(WNN)`.
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

**Never**
- **Never use, store or enter the Android keystore passwords** the user once shared. Signing stays on the user's side.
- **Never sign out of accounts or change credentials**, and never enter passwords into hosted sites.
- **Never touch v1:** the old repo `mja8291/tcf`, its Vercel project, v1's production spreadsheet and Drive folder are read only. No commits, pushes, deploys or write commands there.
- **Never edit v2 production data** (sheets, Drive) unless the user explicitly asks for that specific change. Past examples: deleting the 15 trial surveys, adding the plan tabs, adding the Survey Purpose column.
- **Never commit personal data or secrets** to the public repo. Test fixtures are anonymised ("Engineer A", no emails).
- **Never run a staging/prod build while e2e is running.**
- Never deploy to production without the user's go-ahead in that conversation.
