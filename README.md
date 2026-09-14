# NotifyLoudly

Android app that listens for UPI payment notifications (GPay, PhonePe, Paytm,
BHIM, …) via `NotificationListenerService`, parses the amount, and speaks it
aloud via TTS in near-real-time. No UPI/bank API integration — a
notification-listener + parser + TTS pipeline.

## Stack

- React Native + Expo SDK 57 (New Architecture), TypeScript, `expo-router`
- Bun as package manager and script runner (`bun install`, `bun run`, `bunx`)
- Custom Expo module in Kotlin under `modules/` for the notification listener,
  foreground service, and TTS (no third-party listener package)
- `expo-sqlite` (WAL mode) for transaction history / dedup (Phase 4)
- Config plugin(s) under `plugins/` for manifest permissions (Phase 1)
- Android only

## Commands

- `bun install` — install dependencies
- `bun run start` — start the dev server
- `bun run android` — local Android build + run (`expo run:android`)
- `bun run prebuild` — regenerate native projects (`expo prebuild`)
- `bun run typecheck` — `tsc --noEmit`

## Layout

- `app/` — expo-router routes
- `modules/` — custom native Expo modules (Kotlin)
- `plugins/` — Expo config plugins
- `src/db`, `src/store`, `src/parsers`, `src/components` — TS layers

## Build phases

- [x] Phase 0 — project scaffold
- [x] Phase 1 — native notification listener module (no TTS yet)
- [x] Phase 2 — parsing and validation
- [x] Phase 3 — TTS pipeline
- [x] Phase 4 — persistence and history
- [x] Phase 5 — core screens
- [x] Phase 6 — reliability hardening
- [x] Phase 7 — polish and release prep

Docs: `docs/reliability-checklist.md` (reboot/Doze manual tests),
`docs/build-checklist.md` (local builds + Play submission).

Each phase ends at an approval gate: nothing from a later phase is started
early.

## Assumptions (Phase 0)

- Android application id: `com.notifyloudly.notifyloudly`
- Deep-link scheme: `notifyloudly`
- New Architecture: SDK 57 default (verified in `android/gradle.properties`
  after prebuild)
