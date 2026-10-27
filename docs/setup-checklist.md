# What you need to do, create and connect

Steps you must do yourself, in order. Everything else I build and test locally against an in-memory Sheets/Drive fake, so nothing here blocks Phases 1–5 code. They block **pushing to GitHub**, **fixtures from real data** and **deploying staging**.

Sign in as **tcfengineeringdepartment@gmail.com** for every Google step unless it says otherwise.

## A. GitHub (needed for CI, Phase 1)

1. Create an **empty private** repo `mja8291/tcf-mqi-v2` at https://github.com/new. Leave README, .gitignore and licence unticked.
2. Tell me when it exists. I'll add the remote and push. Git Credential Manager will open a browser for you to sign in on the first push.

## B. Google Sheets and Drive (needed for Phase 2 fixtures and Phase 3 staging)

1. **Production IDs (read-only for me).** Send me:
   - the MQI responses spreadsheet ID (the one with `Method 2 Responses`, `Method 1 Responses` and `MQI Survey Attachments`)
   - the schools spreadsheet ID and its tab name (default `Schools (All Units)`).

   An ID is the part of the URL between `/d/` and `/edit`.
2. **Read access for fixtures.** The Google Sheets connector in this app must be signed in with an account that can **view** the production responses spreadsheet. If it can't, share that sheet as *Viewer* with the connector's account, or export the three tabs as .xlsx into this project's `tools/fixtures/raw/` folder yourself.
3. **v2 root folder: done.** `1wCWvRxaik6h2dsm2ExX9cSqJ84vDs9Cm`. `setup()` creates `01 Production`, `02 Staging`, `03 Backups` and `04 Exports`, the System spreadsheets and the photo folders inside it. You don't need to create any other folders.
4. **Staging responses copy:** `setup()` on the **staging** script copies the production responses spreadsheet into `02 Staging` itself (a read of production, then a new file). If you'd rather make the copy yourself, put it in `02 Staging` and send me its ID. The schools spreadsheet is read-only for both environments, so no copy is needed.
5. **Connector access (optional).** The Google Drive/Sheets connector in this app can't see the v2 folder, so it's signed in with a different account. To let me read the production responses sheet for fixtures, share it as **Viewer** with that account, or export it as .xlsx into `tools/fixtures/raw/`.
5. **Access check:** the department account must be able to edit the production responses spreadsheet and read the schools spreadsheet.
6. **Drive space:** check free space at https://one.google.com/storage. Photos use roughly 300 KB each, so 60 photos per survey is about 18 MB.

## C. Apps Script (needed for Phase 3 staging deploy)

1. Turn on the Apps Script API: https://script.google.com/home/usersettings → *Google Apps Script API* → **On**.
2. When I tell you (after Phase 3 code is green), run this in the Terminal panel and sign in as the department account in the browser that opens:
   ```bash
   npx clasp login
   ```
   I then create the staging script with `clasp create` and push it.
3. **Once, in the Apps Script editor** (I'll send the link):
   1. Open *Project Settings → Script Properties* and add the values I give you: the spreadsheet and folder IDs, `ADMIN_EMAIL` and `ADMIN_NAME`.
   2. Run `setup()` from the editor and **accept the permission prompt** (Sheets, Drive, external requests). It creates the v2 tabs, generates the signing secret and password pepper, and prints the first admin's temporary password to the log.
   3. Deploy → New deployment → Web app, *Execute as: Me*, *Who has access: Anyone*. Send me the `/exec` URL. I can also do this with `clasp deploy` once you've authorised.
4. Decide who the first **Administrator** is (email and name). I suggest you.

## D. Firebase (already connected)

`firebase login` already works on this PC, with project `tcf-mqi-app-761a8` and site `tcf-mqi-app-761a8`. I'll create a second Hosting site, `tcf-mqi-app-761a8-staging`, for staging unless you'd rather use a preview channel. Nothing is needed from you.

## E. Android TWA (Phase 6, later)

- Choose a package name, for example `org.tcf.mqi.v2`. It must differ from the current app's.
- Install JDK 17 and Android command-line tools (Bubblewrap can download them), or let me generate the project for you to build in Android Studio.
- Get the release signing SHA-256, either from Play Console → App integrity, or from the keystore you create.

## F. Cutover (Phase 8, later)

- The cutover date, and the order surveyors move in.
- Who sends the user notice.
