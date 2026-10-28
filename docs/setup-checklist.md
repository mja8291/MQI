# What you need to do, create and connect

All code for Phases 1–8 is written and tested locally against an in-memory Sheets/Drive fake. What's left needs your accounts, your decisions, or both. Do the steps in order. Sign in as **tcfengineeringdepartment@gmail.com** for every Google step unless it says otherwise.

## Already done (no action)

- v2 Drive root folder `1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm`: `setup()` builds `01 Production`, `02 Staging`, `03 Backups`, `04 Exports` and the System spreadsheets inside it.
- v2 responses spreadsheet: **MQI Spreadsheet** `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o`. Its `MQI Survey Responses` and `MQI Survey Attachments` tabs have headers copied exactly from MQI Analysis (130 and 5 columns), with no data rows.
- v1's responses spreadsheet **MQI Analysis** `1Hv2lOExQ29WrY7jyGq5_dYiR5Xot4DCt6JZVJXWPCM4` is read only; it is used only as the source of the golden scoring fixtures.
- Firebase project `tcf-mqi-app-761a8` is connected on this PC.

## 1. GitHub (CI)

1. Create an **empty private** repo `mja8291/tcf-mqi-v2` (no README, .gitignore or licence).
2. Tell me, and I'll add the remote and push. Git Credential Manager asks you to sign in on the first push. CI then runs typecheck, lint, tests, build and end-to-end on every push.

## 2. Schools spreadsheet (done)

- **Schools_Standardized** `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q`, owned by the department account. Tab `Schools (All Units)` (v1's default, so `SCHOOLS_SHEET_TAB` stays unset) has the Region, Area, Campus, Campus ID and Unit Status columns v1 reads. Read only.
- If v1's Vercel `SCHOOLS_SPREADSHEET_ID` points at a different copy, tell me; v2 must read the same list.

## 3. Full golden fixtures (about 2 minutes)

Production holds 18 surveys; 4 are in the tests now.

1. Open **MQI Analysis** → File → Download → Microsoft Excel (.xlsx).
2. Save it as `tools/fixtures/raw/MQI-Analysis.xlsx` in this project (the folder is gitignored, so it never leaves this PC).
3. Tell me, and I'll run the exporter and the golden suite on all 18 surveys and report any that differ.

## 4. Apps Script (staging first)

1. Turn on the Apps Script API: https://script.google.com/home/usersettings → **On**.
2. In the Terminal panel, run this and sign in as the department account:
   ```bash
   cd apps/gas && npx clasp login
   ```
3. Tell me, and I'll create the staging script and push the code.
4. In the Apps Script editor (I'll send the link), open Project Settings → Script Properties and add:
   - `ENV_NAME` = `staging`
   - `SCHOOLS_SPREADSHEET_ID` = `1hfapS-fBBWB3kvOAzbYGau5V6aLazN129bxyblBaT-Q`
   - `SOURCE_RESPONSES_SPREADSHEET_ID` = `1uLCnBNCUmy2skm6MS3uuxYhkRFc-Ad7eBwCSKvuT42o` (MQI Spreadsheet; `setup()` copies it into `02 Staging`)
   - `ADMIN_EMAIL` and `ADMIN_NAME` = the first administrator (suggest you)
5. Run `setup()` and accept the permission prompt. Copy the temporary admin password from the execution log.
6. Run `benchmarkPasswordHash()` and send me the printed table (it goes in the README).
7. I deploy the web app; you send me nothing more for this step.

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
