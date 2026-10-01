# Split-Up mobile

Native Android (and iOS-ready) app built with **Capacitor**. It's a thin native
shell around the live PWA at `https://splitup.thimitech.com`, so it has full
feature parity with the web app — Google/OTP login, live sync (SSE), QR
add-friend, contacts — with **no separate UI codebase to maintain**. When the
website ships, the app ships.

The URL it loads is set in [`capacitor.config.json`](./capacitor.config.json)
(`server.url`). Point it at `http://10.0.2.2:3000` to test against a local API
in the Android emulator.

## Prerequisites

| Need | This machine has |
|---|---|
| Node 20+ | ✅ |
| **JDK 21** (Capacitor 7 requires 21, not 17) | ✅ `C:\Program Files\Eclipse Adoptium\jdk-21.0.7.6-hotspot` |
| Android SDK (platform-tools, android-35, build-tools 35) | ✅ `C:\Android\Sdk` |

Gradle picks the JDK from `JAVA_HOME`. If a build fails with
`invalid source release: 21`, your `JAVA_HOME` is pointing at JDK 17 — set it to
the JDK 21 path above.

## Build an APK

From this folder (`apps/mobile`):

```bash
# one-time per shell
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.7.6-hotspot"
export ANDROID_HOME=/c/Android/Sdk

# debug APK (installable on any phone with "install unknown apps" on)
cd android && ./gradlew assembleDebug
#   -> android/app/build/outputs/apk/debug/app-debug.apk

# signed release APK (direct install / sideload)
./gradlew assembleRelease
#   -> android/app/build/outputs/apk/release/app-release.apk

# signed release AAB (REQUIRED for the Google Play Store)
./gradlew bundleRelease
#   -> android/app/build/outputs/bundle/release/app-release.aab
```

Bump `versionCode` (and usually `versionName`) in `android/app/build.gradle`
before every new Play upload — Play rejects a duplicate `versionCode`.

Re-run `npx cap sync android` after changing `capacitor.config.json`, the
bundled web assets, or adding plugins.

## Install on a phone

1. Copy the `.apk` to the phone (USB, Drive, WhatsApp to yourself…).
2. Tap it; allow "install from this source" when prompted.
3. Or over USB with debugging on: `adb install -r app-release.apk`.

## Icons & splash

Source art lives in [`assets/`](./assets). Regenerate all densities with:

```bash
npx capacitor-assets generate --android
```

## Signing — ⚠️ keep the keystore safe

The release APK is signed with `splitup-release.keystore` (password in
`android/keystore.properties`). **Both are gitignored on purpose.** Back them up
somewhere safe (password manager / private storage). If you lose this keystore
you can never ship an update to the same app on the Play Store — you'd have to
publish a brand-new listing.

## iOS

You **cannot** compile an iOS app on Windows — Apple's toolchain (Xcode) is
macOS-only. The Capacitor project is cross-platform, so on a Mac:

```bash
npm install
npx cap add ios
npx cap open ios   # opens Xcode; Product > Archive to build the .ipa
```

No Mac? Use a cloud-macOS build service pointed at this repo —
**Codemagic**, **Ionic Appflow**, or a **GitHub Actions `macos` runner**. All
of them can produce a signed `.ipa` from this exact Capacitor project. You'll
need an Apple Developer account ($99/yr) to install on real devices or submit to
the App Store.

## If you later want a true offline / more-native app

This wrapper needs the network (it loads the live site). To bundle the UI
locally and talk to the API cross-origin instead, you'd need small server
changes: return a bearer token to the client (already supported — see
`apps/api/src/auth.ts`), allow the app origin in the `csrf()` middleware, and
carry the SSE token as a query param. Not needed for the current build.
