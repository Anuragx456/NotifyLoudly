# Build checklist — local Android builds and Play Store submission (Phase 7)

## Local builds (no EAS required)

Prereqs: Android SDK + platform tools, a device with USB debugging or an
emulator, Bun installed.

- [ ] `bun install` — install dependencies (never npm/yarn/pnpm).
- [ ] `bun run typecheck` — must pass with no errors.
- [ ] `bunx expo prebuild --platform android` — regenerates `android/` from
      `app.json` + `plugins/withUpiListener.ts` + `plugins/withReleaseSigning.ts`.
      Re-run after any plugin, permission, service, or receiver change, then
      confirm in `android/app/src/main/AndroidManifest.xml`: listener service,
      TTS service (`mediaPlayback`), boot receiver, all four permissions — and
      that `QUERY_ALL_PACKAGES` is absent
      (`grep -rn QUERY_ALL android/app/src/main/AndroidManifest.xml` empty).
- [ ] `bun run android` — builds the dev client onto the device and starts Metro.
      This is the ONLY supported run path: custom native code means **Expo Go
      is unsupported** (the app shows a degraded-mode warning there by design).
- [ ] Grant notification access via Home → Enable notification access.
- [ ] Run Test announcement; send a real test UPI payment; check History persists
      across a restart.

## Release build (local)

- [ ] Bump `version` and `android.versionCode` in `app.json`.
- [ ] **Release keystore**: see `docs/RELEASE_SIGNING.md` §1. Generate
      `~/notifyloudly-release.jks` once (outside the repo, backed up
      off-machine — losing it forces a new package and resets Play reputation),
      then provision the four `MYAPP_UPLOAD_*` properties
      (`android/gradle.properties`, `ORG_GRADLE_PROJECT_MYAPP_UPLOAD_*` env, or
      `-P` flags) before `./gradlew bundleRelease`. Never ship a `debug`-signed
      artifact — an empty `signingConfigs.release` hard-fails the build by
      design (verify the negative: unset props → `bundleRelease` must fail).
- [ ] `bunx expo prebuild --platform android --clean`, then confirm
      `grep -n "signingConfigs.release" android/app/build.gradle` shows the
      injected block (from `plugins/withReleaseSigning.ts`), then build a
      signed AAB from `android/` with your keystore (`assembleRelease` /
      `bundleRelease`). Confirm `apksigner verify --print-certs` shows your
      release alias, NOT `CN=Android Debug`.
- [ ] Fresh-install the signed artifact on a real device and exercise
      `docs/reliability-checklist.md` §§A-G end to end (lock-screen card,
      banner, heads-up fallback, Doze survival).
- [ ] **Disclosure gate check** (fresh install, storage cleared): first screen
      is `/disclosure` with tab bar hidden; copy names notification listener,
      pop-up, overlay, battery, boot, foreground service + privacy link; "Not
      now" stays on disclosure with a reminder (no tab-bar flash); deep link
      `notifyloudly://diagnostics` before consent redirects to `/disclosure`
      without opening settings; Continue → onboarding grants work with no
      redirect; post-consent re-entry to settings/diagnostics/reliability no
      longer redirects.

## Play Store submission

- [ ] **Disclosure screen**: `app/disclosure.tsx` is shown BEFORE the permission
      request (flow: Disclosure → Onboarding → system settings). Keep this order —
      review requires prominent in-app disclosure with consent for the
      notification-listener category.
- [ ] **Permission declaration form**: declare Notification Listener access, point
      reviewers at the disclosure screen, and explain the core feature (spoken UPI
      payment alerts) does not work without it.
- [ ] **Data safety form**: no data collected off-device. On-device SQLite history
      only (amount, sender, app, timestamp); no accounts, servers, or analytics.
- [ ] **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`**: restricted permission. Either
      justify it under an allowed use case with a demo video, or remove it from
      `plugins/withUpiListener.ts` before submission — the app already falls back
      to the generic battery-settings page (`openBatteryExemptionRequest`).
- [ ] **Play-safe permission strip**: `QUERY_ALL_PACKAGES` is hard-deleted
      from both sources (`modules/upi-listener` manifest +
      `plugins/withUpiListener.ts` unconditional strip) — confirm absent in
      `android/app/src/main/AndroidManifest.xml` on every build.
      `USE_FULL_SCREEN_INTENT` is likewise hard-deleted with the lock-screen
      visual path (locked = audio + vibration only) — confirm absent too.
      The `<queries>` block covers the 23 allowlisted UPI packages.
- [ ] **Sensitive-permission video**: record disclosure → consent → system grant →
      test announcement → History, per the declaration form requirements.
- [ ] Target API level and 16 KB page-size compliance per current Play policy.
