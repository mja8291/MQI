# Staging pilot: field test checklist

Run this on **staging** (`tcfmqi-staging.web.app`, or the staging TWA) with at least two real Android phones: one mid-range, one low-end. Use test campuses only. After each block, open the staging **MQI Responses (STAGING)** sheet and the **MQI v2 System (STAGING)** sheet to check the result.

Record for every check: phone model, Android/Chrome version, pass/fail, and a note. Anything in the `ErrorLog` tab of the System sheet during the pilot is a finding.

## 0. Setup (once per phone)

- [ ] Open `tcfmqi-staging.web.app` in Chrome: the sign-in page shows **Install app**; tapping it installs the app, which then opens from the home screen in its own window and no longer shows the button. (The Android Play app, the TWA, is not built yet.)
- [ ] Sign up → the screen says the account awaits approval. An admin approves it in **Manage users** → sign in works.
- [ ] Open **Start new survey** once while online, so the school list and every screen are on the phone. While the list loads the note says **Updating the campus list…**; it disappears once loaded. It must never say **Offline** while the phone is online.
- [ ] After signing in (without opening Start new survey), Home shows **✓ Ready to work offline (N campuses saved)**.

## 1. Airplane mode, start to finish

- [ ] Airplane mode **on** before starting. Find school says **Offline — showing the last saved campus list** after a moment. Find school by search, then by Region → Area → School.
- [ ] Search a campus by name: Region, Area and School fill in by themselves, and the card below shows its e-compound name, location, coordinates (tap → map) and other campuses in the same e-compound. Change Region → Area and School clear.
- [ ] Survey details: your name is already under **Accompanying Engineering Staff**; add a second person; leave ASM and Principal empty → **Start survey** still works. The timer runs.
- [ ] Record at least one location of every type: Classroom (with section), Classroom "Library" (no section), Toilet, Lab, Other Room, Corridor & Stairs, Exterior Facade, External Development, Roof.
- [ ] Attach photos with both **Take photo** and **Choose from gallery**. Each shows a name and a size between about 25 KB and 450 KB within a few seconds, and the screen never freezes.
- [ ] After Survey details, the **Applicable levels** page: External locked on; Ground, First, Roof ticked. Untick Roof → the vertical-campus message. Only the chosen levels appear on Floor level; **Change levels** works.
- [ ] Wall/Column: pick **Column Unsafe** and **Wall Unsafe** together → a photo is required; the sheet cell reads "Column Unsafe, Wall Unsafe".
- [ ] Pick photos from the gallery in several formats: a normal photo, a screenshot (PNG), and — on an iPhone or a Samsung set to "High efficiency" — a HEIC photo. Each is saved as JPEG within 450 KB; a broken or non-photo file is refused with a message.
- [ ] Tap a photo thumbnail → full-screen view → **Delete photo** asks first, then removes it.
- [ ] Roof location: **Drilling & observation** is on this screen; the Roof location will not save until it is answered.
- [ ] Leave a floor with fewer than 2 locations → "Remain on this floor / Proceed anyway". Review and submit with fewer than 15 → "Remain on Floor level page / Proceed anyway".
- [ ] For a campus whose e-compound sibling was surveyed earlier: External → External Development opens pre-filled, with a note naming the sibling campus and date; the scores can be changed.
- [ ] Leave a location half-scored → the app asks to discard or finish.
- [ ] Mark **Concrete/Plaster Soundness** Unsafe (its hammer-tapping instruction shows under it) → the location will not save until a photo is attached to it.
- [ ] The Floor level screen shows a count on each floor that has locations.
- [ ] Pause → Resume. Save draft. The Review screen's live score updates.
- [ ] Review: answer every question. There is no "Type of Structure (visual inspection)" question; the structural type question offers **Unknown**. "Roof clean = No" refuses to submit until a photo is attached. Drilling YES needs positive thicknesses.
- [ ] Download the **draft** Excel and PDF from Review while still offline. Both open.
- [ ] Review shows **Items covered** (e.g. 28 of 31). Submit → the app opens **Sync Pending** with "Not uploaded yet — weak or no connection"; the tab badge shows 1 and Start shows a reminder.
- [ ] Airplane mode **off** → within a minute, with no taps, the Queue empties. The staging sheet has one row per location, **once**, with `Source App = v2` and your name and email in Submitted By and Submitter Email. One `MQI Survey Attachments` row per photo has a Drive link that opens for the department account.

## 2. Weak network

- [ ] Use Chrome DevTools remote debugging with "Slow 3G", or go to a known weak spot. Submit a survey with 10+ photos.
- [ ] The Done screen moves from **Sending…** to **Survey submitted**. Photos continue in the background, and the Queue says "On the server · uploading photos" until done.
- [ ] Toggle airplane mode on and off a few times while photos upload. In the end each photo appears **once** in Drive and once in the attachments tab.
- [ ] While photos are still uploading, the survey's rows are already in the sheet (data goes first), and a second survey submitted meanwhile also reaches the sheet without waiting for the first one's photos.

## 3. Kill and restore

- [ ] Mid-survey (a location half-scored), swipe the app away from Recents. Reopen: it lands on the same location with the same answers and photos.
- [ ] Mid-survey, **Save and exit** → Home opens on **Incomplete** with the draft. Resume → it continues where it was, and the timer excludes the paused time.
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
- [ ] A Reviewer account can see the dashboard and download copies, and does **not** see **Start new survey** (the server would refuse a submission anyway).

## 6. Dashboard and downloads

- [ ] Dashboard figures match the staging sheet: captured = campuses with at least one survey; average and bands use each campus's latest survey; regions and critical items likewise. (v1's dashboard reads MQI Analysis, a different spreadsheet since decision D14, so it is not the comparison.)
- [ ] Export all (.xlsx) contains one sheet, **MQI Survey Responses**, with all rows.

## 6a. Wording

- [ ] No screen, download (Excel, PDF, Export all) or address shows the word "Method" (decision D15). Survey addresses are `/survey/details` and `/survey/locations`.

## 7. Updates

- [ ] Deploy a new staging build. On reopening, the **A new version of the app is ready** banner appears. Tap **Update** → the app reloads, and an open draft is still there.
