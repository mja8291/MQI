# Pilot guide: for the two testers

Thank you for testing the new MQI Survey app. Please use it on **your own Android phone** for real or practice campus visits over the next few days, and tell us everything that goes wrong or feels slow. Nothing you enter in the pilot goes into the real MQI records.

## 1. Install (5 minutes, with a connection)

1. Open **Chrome** on your phone and go to **https://tcfmqi-staging.web.app**
2. On the sign-in page, tap **Install app** (or Chrome menu ⋮ → **Install app** / **Add to Home screen**). An **MQI** icon appears on your home screen. Use that icon from now on.
3. Tap **Create an account** and sign up with your work email. You will see "awaiting approval": tell the pilot lead, who approves you.
4. Sign in. Tap **Start new survey** once while connected, so the campus list is saved on the phone.

## 2. What to do

Do at least **two complete surveys** each, and try these on purpose:

- **No signal:** switch on **Airplane mode** before starting a survey, do the whole survey, submit it, then switch Airplane mode off. It should send by itself within a minute.
- **Photos:** take photos with the camera and from the gallery. Mark something **Unsafe**: the app must ask for a photo.
- **Interruptions:** in the middle of a survey, close the app from recent apps, or restart the phone. Open it again: your survey should still be there.
- **A big campus:** one survey with many locations and many photos.
- **Find school:** search a campus by name and check the e-compound name, location and nearby campuses shown.

## 3. How to report

For every problem, send the pilot lead:

- your **phone model** (Settings → About phone),
- **what you did** and **what happened** (a screenshot helps),
- the **time** it happened.

Also send, at the end: how long a typical survey took, and anything that was confusing or slow.

## 4. For the pilot lead

- Approve testers in **Manage users** on https://tcfmqi-staging.web.app (staging admin account).
- Results go in `docs/pilot-checklist.md` (one column per phone: model, Android/Chrome version, pass/fail, note).
- Check the **MQI Responses (STAGING)** sheet and the `ErrorLog` tab of **MQI v2 System (STAGING)** in `02 Staging` after each day.
- When the pilot passes, switch testers to **https://tcfmqi.web.app** (they install again from there and sign up again, since staging and production accounts are separate).
