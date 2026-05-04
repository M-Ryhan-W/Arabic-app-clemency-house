# Android Release Guide — Ihya Arabic App

This document explains how to build, sign, and distribute the Android APK for
[ihyaarabicapp.com](https://ihyaarabicapp.com).

The app is a Capacitor wrapper around the Vite/React web app. The web build is
**bundled into the APK at build time** — Vercel/web deploys do **not**
automatically update an installed APK. Each change you want to ship to mobile
users requires building and distributing a new APK (or App Bundle).

## App identity

| Field        | Value                |
| ------------ | -------------------- |
| App name     | Ihya Arabic App      |
| Package ID   | `com.ihyaarabicapp`  |
| Web origin   | https://ihyaarabicapp.com |
| Web dir      | `dist/`              |

The package ID is fixed for the lifetime of the app — once users have it
installed, changing it produces a different app rather than an update.

---

## One-time setup: signing keystore

A release APK must be signed with a keystore that you keep forever. If you
lose this keystore, you cannot ship updates — users will have to uninstall and
reinstall the app from scratch. **Back it up.**

### 1. Create the keystore (local machine, one time)

```bash
keytool -genkey -v \
  -keystore ihya-arabic-release.jks \
  -alias ihya-arabic \
  -keyalg RSA -keysize 2048 -validity 10000
```

Use a strong password. Store the resulting `ihya-arabic-release.jks` file
**outside** the git repo (e.g. a password manager attachment, encrypted backup,
or 1Password vault).

### 2. Tell Gradle how to find it

Either commit-free option works. Pick one.

**Option A — local properties file (recommended for local builds):**

Create `android/keystore.properties` (already gitignored):

```properties
storeFile=/absolute/path/to/ihya-arabic-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=ihya-arabic
keyPassword=YOUR_KEY_PASSWORD
```

**Option B — environment variables (recommended for CI):**

```bash
export ANDROID_KEYSTORE_FILE=/absolute/path/to/ihya-arabic-release.jks
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=ihya-arabic
export ANDROID_KEY_PASSWORD=...
```

If neither is configured, `assembleRelease` will still build but will produce
an unsigned APK that Android refuses to install.

---

## Versioning

Edit `android/app/build.gradle`:

```groovy
versionCode 1       // integer; MUST increase for every published APK
versionName "1.0.0" // human-readable; shown in app info
```

Rules:
- `versionCode` must be a strictly increasing integer. Android refuses to
  install an APK with a `versionCode` ≤ the one already installed.
- `versionName` is for humans. Bump it however you like (semver suggested).
- Bump both **before** you build the APK you intend to publish.

---

## Building

All commands assume your working directory is the repo root.

### Debug APK (for testing on your own device)

```bash
npm run android:debug-apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Debug APKs are signed with the Android debug key. They install fine for
testing but should **not** be distributed.

### Release APK (for distribution)

```bash
npm run android:release-apk
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

If signing is configured (see above), this APK is signed and installable.
If signing is not configured, the file will be `app-release-unsigned.apk` and
will not install.

### Release App Bundle (`.aab`, for future Play Store use)

```bash
npm run android:release-bundle
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Only needed if you ever publish to Google Play. For direct download from
ihyaarabicapp.com, use the APK.

### Just sync web changes into Android (no APK)

```bash
npm run android:sync
```

Useful when iterating in Android Studio.

---

## Release checklist

For every public APK release:

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. `npm run build` — verify the web build succeeds.
3. `npx cap sync android` — copy the latest web build into the Android project.
4. `npm run android:release-apk` — produce the signed APK.
5. (Optional) Generate a checksum:
   ```bash
   shasum -a 256 android/app/build/outputs/apk/release/app-release.apk \
     > ihya-arabic-app-release.sha256
   ```
6. Rename the APK to a stable filename, e.g. `ihya-arabic-app-release.apk`.
7. Upload the APK (and optional `.sha256`) to the download host.
8. Tag the release in git: `git tag v1.0.1 && git push --tags`.

`npm run android:release-apk` already runs steps 2 and 3 for you.

---

## Where to host the APK

The download page at `https://ihyaarabicapp.com/download` looks for the APK at
the path `/downloads/ihya-arabic-app-release.apk`. Pick **one** hosting option
and make sure that URL responds with the APK over HTTPS.

Recommended options, easiest first:

- **Same web host (Vercel etc.):** drop the APK into `public/downloads/` so it
  ships with the next web deploy. Simplest, but every APK update requires a
  web deploy and inflates your repo. APKs can be tens of MB — check your host's
  static asset size limits.
- **Cloudflare R2 / AWS S3 / Backblaze B2:** upload the APK there, point a
  rewrite/redirect from `/downloads/...` on your domain to the bucket URL.
  Cheapest at scale and decoupled from web deploys.
- **GitHub Releases:** create a release per version and attach the APK. The
  release URL is stable and CDN-backed. You'd then 302 redirect
  `ihyaarabicapp.com/downloads/ihya-arabic-app-release.apk` to the latest
  release asset.
- **Firebase Storage:** also fine, similar tradeoffs to S3/R2.

Whichever you pick, keep the **public-facing URL stable** (a redirect that
points to "the current version"). That way the download page never needs to
change between releases.

---

## Why APK updates are not automatic

The web app at https://ihyaarabicapp.com gets updates whenever you push to
`main` and Vercel rebuilds. The Android APK does **not**. The APK contains a
copy of `dist/` taken at build time and embeds it inside the app — there is no
runtime call back to the website to fetch a new bundle.

Consequences:

- Users on the APK will keep seeing the version of the web app that was
  bundled when their APK was built, until they download a new APK.
- "I updated the website but the app still looks old" is expected — issue a
  new APK.
- If you ever want OTA-style updates without rebuilding, that's a separate
  decision (e.g. Capacitor Live Updates or pointing the WebView at the live
  site). It is **not** how this project is currently configured, on purpose.

---

## Troubleshooting

- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`** — installing a new APK with a
  different signing key over an existing install. Uninstall first, or sign
  with the original keystore.
- **`INSTALL_FAILED_VERSION_DOWNGRADE`** — your new `versionCode` is the same
  or lower than the installed one. Bump it.
- **Release APK is named `app-release-unsigned.apk`** — signing config not
  picked up. Check `android/keystore.properties` exists and `storeFile`
  resolves to a real file.
