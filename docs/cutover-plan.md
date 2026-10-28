# Cutover plan: v1 → v2

**Status: draft for approval. Nothing here is executed without the product owner's go-ahead.**

v2 runs on a new address (`tcfmqi.web.app`) and cannot read anything v1 stored on a phone: drafts, queued surveys and photos waiting to upload stay inside v1. The cutover is therefore operational. Each surveyor empties v1 first, then moves. v1 itself is not changed.

## 1. What stays the same

- v1 keeps writing to **MQI Analysis**; v2 writes to **MQI Spreadsheet** (decision D14 in `docs/parity-notes.md`). Both use the same tab names and headers, so rows from either can be stacked for analysis.
- During the parallel run each app's dashboard shows **only its own** surveys. A combined view needs both spreadsheets (for example an `IMPORTRANGE` of MQI Analysis below MQI Spreadsheet's rows in a separate analysis file); v2 never reads MQI Analysis.
- v2 adds one column at the end of `MQI Survey Responses`: **Source App** (`v2` on every v2 row).
- v1's `Users` tab, its photo folder and its Drive OAuth token are left alone. Retiring them is a separate decision.

## 2. Before the first user moves (go/no-go)

| # | Check | Owner | Done |
| --- | --- | --- | --- |
| 1 | Staging pilot checklist (`docs/pilot-checklist.md`) passed on two phones | Engineering | ☐ |
| 2 | Production Apps Script deployed; `setup()` run; `benchmarkPasswordHash()` run and the number recorded in the README | Engineering | ☐ |
| 3 | Production `RESPONSES_SPREADSHEET_ID` points at **MQI Spreadsheet**; a test survey from an admin account appears with `Source App = v2`, then is deleted by hand | Engineering | ☐ |
| 4 | Golden parity suite run on a fresh production export: done 2026-10-28, 18 surveys, 17 exact, 1 known v1-history difference (parity-notes) | Engineering | ☑ |
| 5 | Department Drive has ≥ 5 GB free | Admin | ☐ |
| 6 | Update of the existing Play app `app.web.mqi_app_tcf.pk` (opens tcfmqi.web.app; asset link published 2026-10-28) in Play internal testing, opening without a URL bar. **Promote to production only after every v1 queue is empty** — that update is the cutover for Android users | Engineering | ☐ |
| 7 | All surveyor accounts created or approved in **Manage users** | Admin | ☐ |

## 3. Moving one surveyor (repeat per person)

1. **Send the notice** (section 5) and agree a time with them while they have a connection.
2. In **v1**, the surveyor finishes or discards every draft and submits.
3. In **v1**, they open the **Queue** tab and wait until it says **Nothing in the queue**. If anything stays as "Sign in to sync" or "Server error", stop and fix it in v1 first.
4. **Check the sheet** (section 4) before they install v2.
5. They install v2 (Play link or the web address), sign up, and you approve them; or you issue a temporary password.
6. They sign in once **online** and open **Start new survey** so the school list is on the phone.
7. They uninstall v1 (optional, recommended so nobody starts a survey in the wrong app).

## 4. "Is their v1 queue really empty?"

For each surveyor, before step 5:

- Ask them for a screenshot of v1's Queue tab showing **Nothing in the queue**.
- In **MQI Analysis** (v1's spreadsheet) → `Method 2 Responses`, filter **Submitter Email** = their email. The latest **Timestamp** should match the last survey they remember submitting, with the same campus.
- Count their surveys since the start of the month (distinct Survey ID) and compare with what they report.
- Any mismatch: they stay on v1 until it is resolved.

## 5. User notice (draft)

> **New MQI Survey app**
>
> We are moving to a new, faster version of the MQI Survey app. Before you install it:
>
> 1. In the **old** app, finish or discard every survey you started, and submit.
> 2. Open the **Queue** tab and wait until it shows **Nothing in the queue**. Stay connected until it does.
> 3. Send a screenshot of that screen to ____.
> 4. Install the new app from ____, create your account (or use the temporary password you were given) and sign in **while connected**.
>
> Surveys left in the old app's queue cannot be moved to the new app. Do not start a survey in the old app after you have switched.

## 6. Order and dates (to be decided by the product owner)

- Cutover date: ____ (proposed: start on a Monday, no field visits that morning)
- Order: pilot users first (2–3 people, one week), then by region: ____
- The parallel run ends when every surveyor has moved and v1 has written no rows for 14 days (newest Timestamp in MQI Analysis).

## 7. Rollback

- **v2 has a problem, but data is fine:** tell users to keep v2's queued surveys on the phone; they sync when fixed. Redeploy the previous web build (`firebase hosting:clone` or `firebase deploy` from the previous tag) and the previous Apps Script version (`clasp deploy -i <deploymentId> -V <previous version>`).
- **Users must go back to v1:** v1 is unchanged and still deployed. A surveyor can reinstall it, but first lets v2's queue empty (same rule as above, in reverse).
- **Bad rows from v2:** in MQI Spreadsheet, filter the Survey IDs from the `ChangeLog` tab of the System spreadsheet. Rows are only ever appended, so removing them by hand restores the previous state.
