# What you need to do, create and connect

All code for Phases 1–8 is written and tested locally against an in-memory Sheets/Drive fake. What's left needs your accounts, your decisions, or both. Do the steps in order. Sign in as **tcfengineeringdepartment@gmail.com** for every Google step unless it says otherwise.

## Already done (no action)

- v2 Drive root folder `1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm`: `setup()` builds `01 Production`, `02 Staging`, `03 Backups`, `04 Exports` and the System spreadsheets inside it.
- v2 responses spreadsheet: **MQI Spreadsheet** `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o`. Its `MQI Survey Responses` and `MQI Survey Attachments` tabs have headers copied exactly from MQI Analysis (130 and 5 columns), with no data rows.
- v1's responses spreadsheet **MQI Analysis** `1Hv2lOExQ29WrY7jyGq5_dYiR5Xot4DCt6JZVJXWPCM4` is read only; it is used only as the source of the golden scoring fixtures.
- Firebase project `tcf-mqi-app-761a8` is connected on this PC.

## 1. GitHub (CI)

Done on 2026-10-28: the code is at https://github.com/mja8291/MQI (branch `main`). CI runs typecheck, lint, tests, build and end-to-end on every push. Its parity step clones v1 (`mja8291/tcf`, public), read only. The repo was created **public**; the plan assumed private. It holds no passwords or keys, but it does name the department email, spreadsheet and folder IDs and the staging API address, so switching it to private (GitHub → Settings → Danger Zone → Change visibility) is recommended.

## 2. Schools spreadsheet (done)

- **Schools_Standardized** `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q`, owned by the department account. Tab `Schools (All Units)` (v1's default, so `SCHOOLS_SHEET_TAB` stays unset) has the Region, Area, Campus, Campus ID and Unit Status columns v1 reads. Read only.
- If v1's Vercel `SCHOOLS_SPREADSHEET_ID` points at a different copy, tell me; v2 must read the same list.

## 3. Full golden fixtures (about 2 minutes)

Production holds 18 surveys; 4 are in the tests now.

1. Open **MQI Analysis** → File → Download → Microsoft Excel (.xlsx).
2. Save it as `tools/fixtures/raw/MQI-Analysis.xlsx` in this project (the folder is gitignored, so it never leaves this PC).
3. Tell me, and I'll run the exporter and the golden suite on all 18 surveys and report any that differ.

## 4. Apps Script (staging first)

Done on 2026-10-28: the staging script **MQI v2 API (staging)** exists (https://script.google.com/d/1IFuzUvQ9FnOAFgBxu2R3Qhh0_ZIyMZd_hUXreq5CdLcz3028MP7pPxny/edit), its code is pushed, and it is deployed as a web app (deployment `AKfycbwsqkM66cHVFVslpJfrRCpUP9GxCoDfRtq2dI1IOh_LFtncjHkwIrerl4ieNwLnIYGHhg`, version 1). The staging web app is live at https://tcf-mqi-app-761a8-staging.web.app and calls that deployment. It cannot sign anyone in until steps 4–5 below are done.

1. ~~Turn on the Apps Script API~~ (done).
2. ~~`clasp login`~~ (done, as the department account).
3. ~~Create the staging script and push the code~~ (done).
4. In the Apps Script editor (link above), open Project Settings → Script Properties and add:
   - `ENV_NAME` = `staging`
   - `SCHOOLS_SPREADSHEET_ID` = `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q`
   - `SOURCE_RESPONSES_SPREADSHEET_ID` = `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o` (MQI Spreadsheet; `setup()` copies it into `02 Staging`)
   - `ADMIN_EMAIL` and `ADMIN_NAME` = the first administrator (suggest you)
5. In the editor's function list choose `setup`, press **Run**, and accept the permission prompt (it is the department account's own script). Copy the temporary admin password from the execution log.
6. Run `benchmarkPasswordHash()` the same way and send me the printed table (it goes in the README).
7. Open https://tcf-mqi-app-761a8-staging.web.app and sign in with `ADMIN_EMAIL` and the temporary password; the app asks you to choose a new one.

## 5. Staging pilot

Work through `docs/pilot-checklist.md` on two phones, then send me the results.

## 6. Android TWA (Phase 6)

Decide the **package name** (it must differ from the current app's, for example `org.tcf.mqi.v2`), then follow `android/README.md`. It needs JDK 17 and Bubblewrap. Send me the signing SHA-256 (and Play's app-signing SHA-256 if Play re-signs).

## 7. Production and cutover (Phase 8)

Read `docs/cutover-plan.md`, then decide:

- the cutover date;
- the order users move in;
- who sends the user notice.

Production setup repeats step 4 with `ENV_NAME` = `production` and `RESPONSES_SPREADSHEET_ID` = `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o` (MQI Spreadsheet). Nothing happens in production until you approve.

## 8. Drive space

Check free space at https://one.google.com/storage. Photos use about 300 KB each, so a 60-photo survey is about 18 MB.
