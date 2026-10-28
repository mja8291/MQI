# MQI v2 Android app (Trusted Web Activity)

A **new** Android wrapper for v2. It opens the v2 site full-screen (no browser bar) and has its own package name, so it installs next to the current app without replacing it. The current Android app is not touched.

## What you decide first

| Item | Example | Where it goes |
| --- | --- | --- |
| Package name | `org.tcf.mqi.v2` | `twa-manifest.json` → `packageId`, and `TWA_PACKAGE_NAME` in `apps/web/env/.env.production` (and `.env.staging` for a staging build) |
| Signing key | a new upload keystore, or Play App Signing | `TWA_SHA256_FINGERPRINTS` (comma-separated if Play re-signs: list **both** the upload key and the Play app-signing key) |

The site publishes `/.well-known/assetlinks.json` only when both values are set (`apps/web/vite.config.ts`, `assetLinks`), so a placeholder never goes live.

## Build the wrapper (once, on a PC with JDK 17)

```bash
npm i -g @bubblewrap/cli
```

```bash
cd android && bubblewrap init --manifest https://tcfmqi.web.app/manifest.webmanifest
```

Accept the defaults from the web manifest, then set the package name you chose, and edit `twa-manifest.json` to match `twa-manifest.template.json` (host, colours, `display: fullscreen` fallback `standalone`, orientation portrait). Bubblewrap creates or reuses a keystore. Print its SHA-256 with:

```bash
keytool -list -v -keystore android.keystore -alias android
```

Put that fingerprint (and Play's app-signing fingerprint, from Play Console → Setup → App integrity) in `TWA_SHA256_FINGERPRINTS`, deploy the site, then:

```bash
bubblewrap build
```

## Check it opens without a browser bar

1. Install `app-release-signed.apk` on a phone.
2. Open https://tcfmqi.web.app/.well-known/assetlinks.json and confirm it lists the package and fingerprints.
3. Launch the app. A URL bar at the top means asset links do not match: compare the fingerprint, then clear Chrome's data on the phone and relaunch.

Keep `android.keystore` and its passwords out of git, in the department's password store. Losing them means a new Play listing.
