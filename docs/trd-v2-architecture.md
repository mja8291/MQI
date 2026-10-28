# TRD v2: System architecture (replaces sections 3, 6.1, 7, 8, 9.1 and 11 of TRD v1.0)

Functional requirements (section 4), the scoring specification (section 5), the spreadsheet design (section 6.2), rubric versioning (section 6.4) and the appendices of TRD v1.0 still apply unchanged, except where `docs/parity-notes.md` records a decision. This section describes how v2 meets them.

## 3. System architecture

### 3.1 Overview

The phone is the source of truth until a survey reaches the server. The app writes everything to IndexedDB first and never waits on the network to save. A sync engine delivers finished surveys to one Google Apps Script endpoint, which appends rows to v1's response tabs and stores photos in Drive. The same TypeScript package (`packages/shared`) holds the rubric, scoring, validation, cross-field rules and permissions, and is bundled into both the web app and the Apps Script code, so phone and server cannot disagree.

| Tier | Technology | Responsibilities |
| --- | --- | --- |
| Device | React 19, Vite, React Router (lazy routes), Tailwind v4, Dexie 4, Workbox service worker; Android TWA wrapper | All screens, scoring, autosave, outbox, photo compression (Web Worker), Excel/PDF generation, session token |
| API | Google Apps Script V8 web app, TypeScript bundled by esbuild, deployed with clasp; executes as the department account | Auth, permissions, validation, server-side rescoring, idempotent writes, chunked photo upload, reads (schools, dashboard, surveys, exports), error log |
| Data | Google Sheets and Drive, owned by `tcfengineeringdepartment@gmail.com` | v1 responses spreadsheet (append-only for v2); **MQI v2 System** spreadsheet; photo folders under the v2 Drive root |
| Hosting | Firebase Hosting `tcf-mqi-app-761a8` (+ `-staging`) | Static app shell, strict CSP, asset links |

### 3.2 Request flows

**Submit.** Review builds the survey record and runs the shared schema and rules. In one Dexie transaction it writes the survey (status `pending`) and its outbox entry, and deletes the draft. The Done screen opens at once. The sync engine sends it now if online; otherwise it is saved offline.

**Push.** `sync.push` carries up to 10 surveys with their photo metadata. Per survey the server:

1. checks role and ownership;
2. validates the schema and rules;
3. **recomputes the scores** with the survey's rubric version and rejects a mismatch;
4. creates a ledger row (`Surveys`: state writing);
5. appends one row per location to `Method 2 Responses` and the note rows to `MQI Survey Attachments`, each with one atomic RAW `values.append`;
6. registers photo records (`Files`);
7. marks the ledger `written` and logs to `ChangeLog`.

A repeat push of a written survey returns ok and writes nothing. A retry after a crash in step 5 checks the tab for the Survey ID before appending.

**Photos.** Photos are pushed only after the server holds their survey. `files.upload` takes 2 MB chunks in order, with chunk progress kept on both sides. One chunk becomes a direct Drive file; several use a Drive resumable session. When the file exists, its attachment row is appended (checked by link, so it is written once).

**Pull.** `sync.pull` returns the user's own submitted surveys (for re-download). `schools.list` and `dashboard.get` are cached in CacheService (30 min and 5 min, values sharded under 90 KB). `surveys.get` and `export.rows` feed the browser-side Excel/PDF builders, which are v1's own builders.

## 6.1 Data on the device (Dexie database `mqi-v2`)

| Table | Holds |
| --- | --- |
| `drafts` | In-progress surveys (v1's SurveyState). Photos are references only. |
| `surveys` | Finished surveys: `pending` → `uploading` (rows on the server, photos still going) → `synced`, or `failed` (Queue: Retry / Discard) |
| `outbox` | Ordered work: one `survey` entry, then one `photo` entry per photo once the survey is on the server |
| `photos` | Compressed photo bytes by attachment ID, uploaded chunks, upload state. Uploaded full-size photos are evicted oldest first above 200 MB; unsent photos never are. |
| `meta` | Session token, cached school list, last dashboard, own-survey list |

localStorage keeps v1's `mqi-active-survey-id`, `mqi-pending-school`, `mqi-auth-user` and `mqi-last-sync`. `navigator.storage.persist()` is requested at sign-in.

## 6.2a v2-only spreadsheet: MQI v2 System

| Tab | Holds |
| --- | --- |
| `Users v2` | id, email, name, role (SURVEYOR, REVIEWER, ADMIN), status (PENDING, ACTIVE, REVOKED), dates |
| `Credentials` | hash, salt, iterations, mustChange, failed attempts, lockout, token version. Never returned by any action. |
| `Surveys` | Write ledger and idempotency key per survey ID; owner; summary for `sync.pull` |
| `Files` | Per-photo upload state, Drive file ID, link |
| `ChangeLog`, `AuditLog`, `ErrorLog` | Writes; admin and auth events; client and server errors (sanitised) |

Response tabs gain one column, `Source App` (`v2`). Cells are typed for RAW writes (scores and durations as numbers, everything else as text), so they match v1's USER_ENTERED cells without formula injection.

## 7.1 API

One URL. Every call is `POST`, `Content-Type: text/plain`, body `{ action, apiVersion, auth: { session }, payload, requestId? }`. Every answer is HTTP 200: `{ ok, data | error: { code, message, details }, serverTime, rubricVersion, requestId }`.

| Action | Auth | Notes |
| --- | --- | --- |
| `auth.signup` | none | Pending account (FR-AUTH-1/2) |
| `auth.login` | none | Lockout 5 failures / 15 min; global throttle 60/min |
| `auth.whoami`, `auth.changePassword`, `auth.logoutAll` | session | whoami re-issues a 60-day token |
| `sync.push` | Surveyor, Admin | ≤ 10 surveys; idempotent |
| `sync.pull` | session | Own surveys |
| `files.upload` | Surveyor, Admin (owner) | 2 MB chunks |
| `files.get`, `surveys.get`, `export.rows`, `dashboard.get`, `schools.list` | any approved user | v1 behaviour (decision D2) |
| `admin.users.list`, `admin.users.approve`, `admin.users.revoke`, `admin.issuePassword` | Admin | |
| `client.log` | none (session optional) | Sanitised, rate-limited |

Error codes: `UNAUTHENTICATED`, `ACCESS_REVOKED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `LOCK_TIMEOUT`, `RATE_LIMITED`, `UPGRADE_REQUIRED`, `INTERNAL`. The phone retries only `LOCK_TIMEOUT`, `RATE_LIMITED`, `INTERNAL` and no-connection, with backoff `min(2^n × 5 s, 30 min) ± 20 %`. While the phone reports offline no backoff accrues; the `online` event sends at once. `UPGRADE_REQUIRED` makes the app take the new service worker instead of retrying.

## 8. Offline and resilience

- **App shell:** Workbox precaches every route chunk, Excel/PDF builders included, so every screen and draft export works offline after one visit. API calls are never cached by the worker.
- **Autosave (FR-OFF-2):** immediate on survey start, 2 s debounce, 12 s ceiling (unchanged from v1). The unload/hidden flush is a **synchronous** IndexedDB transaction, so a reload or kill a moment after an answer keeps it (FR-OFF-7).
- **Recovery (FR-OFF-5/6):** as v1; the active-survey pointer brings the app back into the survey from Home.
- **Sync triggers:** app start, foreground, `online`, 2 s after submit, Background Sync (Chromium), every 5 min while visible, Sync now. A Web Lock keeps a second tab from syncing.
- **No head-of-line blocking:** a rejected survey becomes `failed` and the rest continue.
- **Updates:** a new worker waits. The app shows an Update banner, or applies it at once on `UPGRADE_REQUIRED`. A first-install claim never reloads the page.

## 9.1 Security

- Session: HMAC-SHA256-signed `{uid, iat, exp, tv}`, 60 days. `tv` (token version) increments on logout-everywhere and every password set, which revokes older tokens.
- Each request re-reads the user's status and role (cached 60 s).
- Passwords: PBKDF2-HMAC-SHA256 with a per-user salt and a Script Properties pepper; iterations set by an in-Apps-Script benchmark.
- Permission matrix (`packages/shared/src/permissions.ts`), enforced by the server and used by the UI to hide controls.
- Drive files are never shared; reads go through `files.get`.
- CSP: `script-src 'self'`, `style-src 'self'`, `connect-src` limited to the Apps Script hosts, `frame-ancestors 'none'`, HSTS, `nosniff`, no referrer. There are no inline scripts.
- The token lives in IndexedDB (readable by page scripts); the CSP is what limits that exposure.

## 11. Deployment and operations

See the README: environments, Script Properties, `clasp` and Firebase commands, rollback, rubric change procedure, and the password benchmark record.

## 12. Verification

| Level | Tool | Covers |
| --- | --- | --- |
| Shared | Vitest | Rubric sums, scoring edge cases, sheet mapping and RAW typing, rules, permissions |
| Golden | Vitest | Every stored production score reproduced exactly (`tools/fixtures/data`) |
| v1 parity | Vitest + v1's own code | Excel cell for cell, PDF byte for byte, dashboard |
| Server | Vitest on the in-memory fake | Auth, lockout, revocation, idempotency including lost responses, header mapping, RAW types, v1 appending concurrently, chunked upload, every action's scope |
| Client sync | Vitest + fake-indexeddb + the real server in-process | Atomic submit, backoff, offline, lost answer, head-of-line, resumable upload, eviction |
| End to end | Playwright on the production build | Offline survey with photos → reload → kill → submit offline → syncs exactly once; sign-up → approval → temporary password → forced change |
