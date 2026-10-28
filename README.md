# TCF MQI v2

Offline-first Maintenance Quality Index survey app for TCF school campuses. It replaces the v1 MQI Survey App (`mja8291/tcf`, Next.js on Vercel) on the "Stack B" architecture. It writes to its own responses spreadsheet, **MQI Spreadsheet**, whose response tabs have exactly v1's headers (copied from v1's `MQI Analysis`), so v1's row layout, exports and dashboard logic carry over unchanged.

- **Web**: React 19 + Vite + React Router, Tailwind v4, Dexie (IndexedDB), Workbox service worker. Firebase Hosting `tcfmqi`.
- **API**: one Google Apps Script web app (TypeScript, bundled by esbuild, deployed with clasp), running as `tcfengineeringdepartment@gmail.com`.
- **Data**: Google Sheets (MQI Spreadsheet for survey rows; a v2-only **MQI v2 System** spreadsheet for accounts and ledgers) and Google Drive (photos).
- **Shared**: `packages/shared`, bundled into both. It holds the rubric, scoring (ported unchanged from v1), schemas, rules, permissions and the API contract.

Background and decisions: `docs/migration-plan.md`, `docs/parity-notes.md`, `docs/trd-v2-architecture.md`. Rollout: `docs/pilot-checklist.md`, `docs/cutover-plan.md`. What only you can do: `docs/setup-checklist.md`.

## Layout

```
packages/shared   rubric/ (current + frozen snapshots, version lookup), scoring.ts, survey.ts (Zod + rules),
                  sheets.ts (v1 row mapping, RAW typing), read-models.ts (dashboard, survey lookup, Drive names),
                  permissions.ts, api.ts
apps/gas          src/core/* (router, auth, sync, files, reads, setup), src/adapters/{gas,memory}.ts, src/dev/server.ts
apps/web          src/pages/* (v1 screens, ported), src/lib/{offline,auth,export,image}, src/sw.ts, e2e/
tools/fixtures    golden parity fixtures and the v1 ⇄ v2 parity suite
android           Trusted Web Activity wrapper instructions (android/README.md)
reference/        read-only clone of v1 at master 0a4a75c (gitignored; CI clones it)
```

## Develop

Requires Node 22+.

```bash
npm install
```

```bash
git clone https://github.com/mja8291/tcf.git reference && git -C reference checkout 0a4a75c
```

Run the API (the real server code on an in-memory Sheets/Drive fake, http://localhost:8787) and the web app (http://localhost:5173) in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev
```

Dev logins (local fake only): `admin@tcf.test`, `surveyor@tcf.test` and `reviewer@tcf.test`, all with password `mqi-dev-pass-1`.

Checks (CI runs the same on every push):

```bash
npm run check
```

```bash
npm run e2e
```

`npm run check` = typecheck + lint + unit/integration tests + build. `npm run e2e` runs Playwright on the production build with the service worker on.

## Configuration

### Web (`apps/web/env/`)

| File | Variable | Meaning |
| --- | --- | --- |
| `.env` (dev), `.env.e2e` | `VITE_API_URL` | `http://localhost:8787/api` |
| `.env.staging`, `.env.production` | `VITE_API_URL` | The Apps Script `/exec` URL of that environment |
| same | `TWA_PACKAGE_NAME`, `TWA_SHA256_FINGERPRINTS` | Android TWA; both set → `/.well-known/assetlinks.json` is published |

The CSP in `firebase.json` allows `connect-src` only to `script.google.com` and `script.googleusercontent.com`.

### Apps Script — Script Properties

Set these in the Apps Script editor (Project Settings → Script Properties) **before** running `setup()`:

| Property | Required | Meaning |
| --- | --- | --- |
| `ENV_NAME` | yes | `staging` or `production` |
| `SCHOOLS_SPREADSHEET_ID` | yes | v1's school list spreadsheet, read only (`Schools_Standardized`, `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q`) |
| `SCHOOLS_SHEET_TAB` | no | Default `Schools (All Units)` |
| `RESPONSES_SPREADSHEET_ID` | production | v2's responses spreadsheet (`MQI Spreadsheet`, `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o`) |
| `SOURCE_RESPONSES_SPREADSHEET_ID` | staging | The same production responses ID; `setup()` copies it into `02 Staging` and sets `RESPONSES_SPREADSHEET_ID` to the copy |
| `ADMIN_EMAIL`, `ADMIN_NAME` | yes | First administrator; `setup()` prints a one-time temporary password to the execution log |
| `V2_ROOT_FOLDER_ID` | no | Default `1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm` |

`setup()` sets these itself: `SYSTEM_SPREADSHEET_ID`, `PHOTOS_FOLDER_ID`, `SESSION_SECRET`, `PASSWORD_PEPPER` (32 random bytes each, never shown), `SCHEMA_VERSION`. `benchmarkPasswordHash()` sets `PBKDF2_ITERATIONS`.

Rotating `SESSION_SECRET` signs everyone out. Queued surveys stay on phones and sync after sign-in. **Never** change `PASSWORD_PEPPER`: every password would stop working.

## Deploy

### Apps Script

One-time, per environment (`clasp login` as the department account first):

```bash
cd apps/gas && npx clasp create --type standalone --title "MQI v2 API (staging)" --rootDir dist
```

Rename the `.clasp.json` it writes to `.clasp.staging.json` (or `.clasp.prod.json`), push, then in the editor set the Script Properties, run `setup()` and accept the permissions, and run `benchmarkPasswordHash()`.

Every release (server first, then web):

```bash
npm run push:staging -w @mqi/gas
```

```bash
cd apps/gas && npx clasp -P .clasp.staging.json deploy -d "describe the release"
```

The first `deploy` prints a deployment ID; put its `/exec` URL in `apps/web/env/.env.staging`. Later releases update the same deployment (`deploy -i <deploymentId> -d …`), so the URL never changes. The next request upgrades System tabs and columns by itself (`SCHEMA_VERSION`).

### Web

One-time for staging:

```bash
firebase hosting:sites:create tcfmqi-staging
```

Every release:

```bash
npm run deploy:staging -w @mqi/web
```

Production uses `push:prod`, `-P .clasp.prod.json` and `deploy:prod`. Phones pick up a new web version the next time they open the app online (an **Update** banner appears).

### Rollback

- **Web**: in the Firebase console → Hosting → release history, roll back to the previous release. Or check out the previous tag and deploy again.
- **API**: `npx clasp -P .clasp.prod.json deployments` lists versions; `npx clasp -P .clasp.prod.json deploy -i <deploymentId> -V <previous version>` points the same URL back at it.
- Rows are append-only; see `docs/cutover-plan.md` §7 for removing bad rows.

## Password hashing

PBKDF2-HMAC-SHA256 over `HMAC(pepper, password)` with a 16-byte per-user salt, built on `Utilities.computeHmacSha256Signature`. Each user's iteration count is stored with their hash, so the number can change without breaking existing passwords. Lockout: 5 failures, then 15 minutes; global throttle: 60 sign-in attempts per minute.

| Environment | Measured by `benchmarkPasswordHash()` | Iterations chosen |
| --- | --- | --- |
| staging (2026-10-28) | 1000: 498 ms · 1500: 892 ms · 2000: 1217 ms · 2500: 1120 ms · 3000: 1487 ms · 4000: 1814 ms · 5000: 2156 ms | **5000** (highest ≤ 2.2 s) |
| production (2026-10-28) | 1000: 725 ms · 1500: 1018 ms · 2000: 1115 ms · 2500: 1510 ms · 3000: 1490 ms · 4000: 2694 ms | **3000** (4000 was over 2.2 s, so the run stopped there) |

`benchmarkPasswordHash()` picks the highest count it timed at or under 2.2 s. Apps Script timings vary by about 20 % run to run (2500 beat 2000 above). The admin password set by `setup()` used the default 2000 and moves to 5000 the next time it is changed.

## Changing the rubric

Scores must keep the meaning they had when submitted, so every rubric version stays frozen:

1. Copy `packages/shared/src/rubric/items.ts` to `items-v<old version>.ts` and rename its export (for example `RUBRIC_GROUPS_20261028`). Never edit it again.
2. Edit `items.ts`. Each division's weights must sum to 100 (a test checks this).
3. Bump `RUBRIC_VERSION` in `rubric/rubric-version.ts`.
4. In `rubric/versions.ts`, map the old version to the frozen list in `rubricGroupsFor`, and add it to `KNOWN_RUBRIC_VERSIONS`.
5. Run `npm run check`, then deploy the **server first**, then the web app. Phones still on the old version keep submitting with the old version stamped; the server recomputes with that version and accepts it.
6. New item columns are added to the end of `MQI Survey Responses` automatically on the first submission that uses them.

## Golden parity fixtures

`tools/fixtures/data/surveys.json` holds real production surveys (names stripped). The suite in `tools/fixtures/src/golden.test.ts` checks that v2 scoring reproduces every stored score. To refresh from production (read-only), download the responses spreadsheet as .xlsx into `tools/fixtures/raw/` (gitignored), then:

```bash
npm run export -w @mqi/fixtures -- --xlsx tools/fixtures/raw/MQI-Analysis.xlsx
```

`tools/fixtures/src/v1-parity.test.ts` runs v1's own export and dashboard code from `reference/` next to v2's on the same rows: Excel cell for cell, PDF byte for byte, dashboard figure for figure.
