# Build checklist — local Android builds and Play Store submission (Phase 7)

## Local builds (no EAS required)

Prereqs: Android SDK + platform tools, a device with USB debugging or an
emulator, Bun installed.

- [ ] `bun install` — install dependencies (never npm/yarn/pnpm).
- [ ] `bun run typecheck` — must pass with no errors.
- [ ] `bunx expo prebuild --platform android` — regenerates `android/` from
      `app.json` + `plugins/withUpiListener.ts`. Re-run after any plugin,
      permission, service, or receiver change, then confirm in
      `android/app/src/main/AndroidManifest.xml`: listener service, TTS service
      (`mediaPlayback`), boot receiver, all four permissions.
- [ ] `bun run android` — builds the dev client onto the device and starts Metro.
      This is the ONLY supported run path: custom native code means **Expo Go
      is unsupported** (the app shows a degraded-mode warning there by design).
- [ ] Grant notification access via Home → Enable notification access.
- [ ] Run Test announcement; send a real test UPI payment; check History persists
      across a restart.

## Release build (local)

- [ ] Bump `version` and `android.versionCode` in `app.json`.
- [ ] **Release keystore**: see `docs/RELEASE_SIGNING.md`. Provision the
      `MYAPP_UPLOAD_*` properties and the `signingConfigs.release` block
      described there before `./gradlew bundleRelease`. Never ship a
      `debug`-signed artifact.
- [ ] `bunx expo prebuild --platform android --clean`, then build a signed AAB
      from `android/` with your keystore (`assembleRelease` / `bundleRelease`).
- [ ] Fresh-install the signed AAB on a device and re-run
      `docs/reliability-checklist.md` end to end.

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
- [ ] **Sensitive-permission video**: record disclosure → consent → system grant →
      test announcement → History, per the declaration form requirements.
- [ ] Target API level and 16 KB page-size compliance per current Play policy.
