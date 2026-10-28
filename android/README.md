# MQI v2 Android app (Trusted Web Activity)

**Decision (2026-10-28, option B):** v2 ships as an **update of the existing Play Store app** `app.web.mqi_app_tcf.pk` (first built with PWABuilder for v1). The update changes only the address it opens, from v1's site to **https://tcfmqi.web.app**. Same listing, same package, same signing key; users get v2 through a normal Play Store update.

**That update is the cutover, with no link to v1** (product owner, 2026-10-28, D16): v1's unsent surveys and drafts on a phone are given up when it installs the update; nobody needs to empty v1 first. Testers can use https://tcfmqi.web.app in Chrome (Install app on the sign-in page) before the release.

## Already done

| Item | Value |
| --- | --- |
| Package | `app.web.mqi_app_tcf.pk` |
| Fingerprints in `/.well-known/assetlinks.json` on tcfmqi.web.app | Play app-signing key `05:D8:78:…:4A:F0`; PWABuilder upload key `EA:5E:11:…:A6:34` (full values in `apps/web/env/.env.production`) |
| Check | Google's Digital Asset Links API lists both for https://tcfmqi.web.app (verified 2026-10-28) |

v1's own site keeps its asset link, so the current app keeps working unchanged until the update.

## Build the update (you, once, in PWABuilder)

1. Go to https://www.pwabuilder.com, enter **https://tcfmqi.web.app**, then **Package for stores → Android → Options**.
2. Set **Package ID** to `app.web.mqi_app_tcf.pk` (exactly as now).
3. Set **App version** higher than the version on Play (Play Console → the app → Releases shows the current version code) — e.g. version `2.0.0`, version code one above the current.
4. **Signing key → Use mine:** upload the existing `signing.keystore` with its alias and passwords (from the PWABuilder download for v1). Do **not** let it create a new key: Play rejects an update signed with a different upload key.
5. App name / launcher name: `TCF MQI Survey` / `MQI Survey` (or keep the current names). Display: standalone. Status bar / navigation colour `#0e5c4d`.
6. Download the package. Upload the **.aab** in Play Console → **Testing → Internal testing** first; install it on one phone from the testing link and check that it opens **without a browser bar** and shows the new screens (Applicable levels, three Home tabs).
7. Promote to **Production** when the internal-testing install is good.
8. In Play Console → **App content → Privacy policy**, change the URL to **https://tcfmqi.web.app/privacy** (it points at v1's site today).

A browser bar at the top of the app means the asset link does not match the signing key: send the SHA-256 shown in Play Console → Test and release → App integrity → App signing, and it is added to the site.

## Keys and passwords

Keep `signing.keystore` and its passwords in the department's password store — never in git, chat, email or a temp folder. Losing them means the app can no longer be updated (unless Play App Signing lets you reset the upload key). The passwords shared on 2026-10-28 in a chat should be treated as exposed: store the keystore safely and limit who has the file.
