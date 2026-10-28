# Staging pilot: field test checklist

Run this on **staging** (`tcfmqi-staging.web.app`, or the staging TWA) with at least two real Android phones: one mid-range, one low-end. Use test campuses only. After each block, open the staging **MQI Responses (STAGING)** sheet and the **MQI v2 System (STAGING)** sheet to check the result.

Record for every check: phone model, Android/Chrome version, pass/fail, and a note. Anything in the `ErrorLog` tab of the System sheet during the pilot is a finding.

## 0. Setup (once per phone)

- [ ] Install the app (Chrome → Add to Home screen, or the staging TWA). It opens full-screen with no URL bar (TWA).
- [ ] Sign up → the screen says the account awaits approval. An admin approves it in **Manage users** → sign in works.
- [ ] Open **Start new survey** once while online, so the school list and every screen are on the phone.

## 1. Airplane mode, start to finish

- [ ] Airplane mode **on** before starting. Find school by search, then by Region → Area → School.
- [ ] Enter the three names, then start. The timer runs.
- [ ] Record at least one location of every type: Classroom (with section), Classroom "Library" (no section), Toilet, Lab, Other Room, Corridor & Stairs, Exterior Facade, External Development, Roof.
- [ ] Attach photos with both **Take photo** and **Choose from gallery**. Each shows a name and size under 300 KB within a few seconds, and the screen never freezes.
- [ ] Leave a location half-scored → the app asks to discard or finish.
- [ ] Pause → Resume. Save draft. The Review screen's live score updates.
- [ ] Review: answer every question. "Roof clean = No" refuses to submit until a photo is attached. Drilling YES needs positive thicknesses.
- [ ] Download the **draft** Excel and PDF from Review while still offline. Both open.
- [ ] Submit → **Saved offline**. The Queue badge shows 1, and the survey appears under **Waiting to sync** as "Waiting for a connection".
- [ ] Airplane mode **off** → within a minute, with no taps, the Queue empties. The staging sheet has one row per location, **once**, with `Source App = v2` and your name and email in Submitted By and Submitter Email. One `MQI Survey Attachments` row per photo has a Drive link that opens for the department account.

## 2. Weak network

- [ ] Use Chrome DevTools remote debugging with "Slow 3G", or go to a known weak spot. Submit a survey with 10+ photos.
- [ ] The Done screen moves from **Sending…** to **Survey submitted**. Photos continue in the background, and the Queue says "On the server · uploading photos" until done.
- [ ] Toggle airplane mode on and off a few times while photos upload. In the end each photo appears **once** in Drive and once in the attachments tab.

## 3. Kill and restore

- [ ] Mid-survey (a location half-scored), swipe the app away from Recents. Reopen: it lands on the same location with the same answers and photos.
- [ ] Mid-survey, **Save and exit** → Home opens on the Queue with the draft. Resume → it continues where it was, and the timer excludes the paused time.
- [ ] Restart the phone mid-survey. Reopen: the survey is still there.
- [ ] Submit offline, then kill the app before going online. Reopen online: the survey syncs once.

## 4. Big survey: 40 locations, 60 photos

- [ ] One survey with 40 locations and 60 photos, recorded offline.
- [ ] Every screen stays responsive. Note any screen that takes more than about 1 s.
- [ ] Submit, then go online. Time until **Survey submitted**: ______. Time until all photos are up: ______.
- [ ] The sheet has exactly 40 rows for the survey and 60 photo rows. The Drive folder has 60 files under `Region/Campus/date MQI Survey - id8/Floor - Type - Name/`.
- [ ] Download the Excel and PDF copies from the Done screen and from the dashboard. The overall score equals the Review screen's and the sheet's.

## 5. Accounts and access

- [ ] Admin revokes a user → within a minute that phone is sent to sign-in, with its queued surveys still kept. Re-approve → the user signs in and the queue sends.
- [ ] Admin issues a temporary password → the user must change it at sign-in, and every other phone of that user is signed out.
- [ ] Five wrong passwords → locked for 15 minutes.
- [ ] A Reviewer account can see the dashboard and download copies, but **Start new survey** submissions are refused.

## 6. Dashboard and downloads

- [ ] Dashboard figures (captured, pending, average, bands, regions, critical items) match the v1 dashboard on the same staging data.
- [ ] Export all (.xlsx) contains both response tabs with all rows.

## 7. Updates

- [ ] Deploy a new staging build. On reopening, the **A new version of the app is ready** banner appears. Tap **Update** → the app reloads, and an open draft is still there.
