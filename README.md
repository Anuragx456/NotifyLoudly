# NotifyLoudly

Merchant counter phone that **speaks every UPI payment aloud**.

NotifyLoudly listens for incoming UPI payment notifications (GPay, PhonePe, Paytm, BHIM, and 20 more) via Android's `NotificationListenerService`, extracts the amount + sender with an on-device parser, and announces it in near-real-time via TTS — e.g. *“Received 250 rupees from Aman”*. No UPI/bank API integration, no server, no account: a **notification-listener → parser → TTS** pipeline that works fully offline.

Built for Indian shops and stalls: keep one phone on the counter, hear every customer payment without staring at the screen.

## How it works

1. **Listen** — `UpiNotificationListenerService` (custom Kotlin Expo module) receives notifications from 23 allowlisted UPI/bank packages.
2. **Parse** — `src/parsers/` decides incoming vs. outgoing, strips balance amounts, extracts the payment amount + sender, and drops anything that isn't a recognized incoming payment.
3. **Announce** — `UpiTtsService` (foreground service) speaks the amount via on-device TTS in English or Hindi, shows a payment card when unlocked, and logs the payment to on-device SQLite.
4. **Stay alive** — boot receiver re-binds after reboot/app update; battery-exemption + OEM autostart guidance keeps Doze mode and brand app-killers from silencing it overnight.

Key safety rules in the pipeline:

- **Money you send is never spoken.** A `you-have-sent` guard runs before every other pattern — outgoing notifications are dropped, never stored.
- **Balance ≠ payment.** Amounts preceded by balance language ("Balance ₹12,000. Received ₹500…") announce ₹500.
- **Echoes speak once.** Same amount+sender seconds apart across apps (UPI app + bank app echo, post + update) is de-duplicated; genuine repeats still speak.
- **Stale/out-of-range ignored.** Notifications older than 30 min or with absurd amounts never announce.
- **Locked phone = audio + vibration only, by design.** No lock-screen visuals, no full-screen intent.

## First-run flow

Fresh install always starts here, in this order (Play policy requirement):

1. **Disclosure** (`app/disclosure.tsx`) — plain-language consent screen naming notification access, pop-up, overlay, battery, boot, and foreground service, with a privacy-policy link. Nothing turns on until you tap Continue. "Not now" stays put — no tab-bar flash.
2. **Onboarding** (`app/onboarding.tsx`) — just 2 required steps:
   - **1 · Hear payments** — notification access (system Special app access page)
   - **2 · Show pop-up** — `POST_NOTIFICATIONS` runtime grant (payment card when unlocked, never on lock screen)
3. **Home tabs** — Counter status (Listening / Not listening), last payment card, Play last payment, mute, recent-3 preview.

Everything else (float-on-top banner, overnight stay-alive) is optional later in Settings / Stay-alive.

## Screens

| Route | What it does |
|---|---|
| `/disclosure` | Consent gate before every permission prompt |
| `/onboarding` | 2-step grant flow with live bind status + rebind/reboot recovery |
| `/(tabs)/` (Home) | Listening status, last payment, replay, mute, recent payments |
| `/(tabs)/history` | Full on-device payment history (newest first) with replay |
| `/(tabs)/diagnostics` | Listener bound? TTS running? Voice ready? Last callback age, raw notification log with parse verdicts |
| `/(tabs)/settings` | Health summary, theme (Light/Dark/System), speech speed + language (en-IN / hi-IN), ducking, mute, overlay toggle, detected UPI apps + rescan, clear history |
| `/reliability` | Stay-alive guide: battery exemption → brand autostart (Xiaomi/Oppo/Vivo/Samsung) → pop-up → after-reboot check |

## Supported UPI apps (23)

Google Pay + Business, PhonePe + Business, Paytm + Business (both packages), BHIM, Navi (3 packages), CRED, Amazon Pay, Super.money (2 packages), BHIM SBI Pay, iMobile Pay, Kotak, Axis Pay, PayZapp, Canara ai1, Baroda Pay, bob World.

Authority list: `src/components/upiApps.ts` (`UPI_APPS`). The native `<queries>` block, `UpiListenerStore.KNOWN_UPI_PACKAGES`, `DEFAULT_UPI_PACKAGES`, and parser table are kept in sync with it. WhatsApp is intentionally excluded.

## Permissions — why each exists

| Permission | Why |
|---|---|
| Notification listener (`BIND_NOTIFICATION_LISTENER_SERVICE`) | Reads title/body of **UPI payment notifications only**, extracts amount + sender, speaks it. No other notification content is used. |
| Notifications (`POST_NOTIFICATIONS`) | Fallback heads-up payment alert when unlocked and the banner is off. Hidden from lock screen. |
| Display over other apps (`SYSTEM_ALERT_WINDOW`, optional) | Overlay banner floating the payment card above any open app when unlocked. |
| Battery exemption (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, suggested) | Stops Doze from pausing the speech service overnight. |
| Run at boot (`RECEIVE_BOOT_COMPLETED`) | Re-starts speech service + re-binds listener after reboot / app update. |
| Foreground service (`FOREGROUND_SERVICE` + `MEDIA_PLAYBACK`) | Keeps the speech service alive while announcing. |

Play-safe by construction: `QUERY_ALL_PACKAGES` is hard-deleted from every manifest source (23-package `<queries>` block is the sole visibility mechanism) and `USE_FULL_SCREEN_INTENT` was removed with the lock-screen visual path. Verify with `grep -rn QUERY_ALL android/app/src/main/AndroidManifest.xml` (must be empty).

## Privacy

- **On-device only.** Amount, sender, app, and time of each *announced incoming* payment live in app-private SQLite (`payments` table) for History/replay. Nothing else is retained.
- **No upload, no account, no analytics, no ads, no third-party data SDKs.**
- History deletes via Settings → Clear history; uninstall wipes everything.
- Policy source: `docs/PRIVACY_POLICY.md`, served at `expo.extra.privacyPolicyUrl` in `app.json` (must be a public URL for Play review).

## Stack

- React Native + Expo SDK 57 (New Architecture, Hermes), TypeScript, `expo-router`
- Bun as package manager / script runner (`bun install`, `bun run`, `bunx`)
- Custom Expo module in Kotlin under `modules/upi-listener/` — listener service, foreground TTS service, boot receiver, dedup gate, alert/overlay managers (no third-party listener package)
- `expo-sqlite` (WAL mode) for history + dedup seeds
- Config plugins under `plugins/`: `withUpiListener.ts` (permissions, services, queries block), `withReleaseSigning.ts` (durable release signing), `withAppSize.ts`
- Manrope font, light/dark/system theming, Android only (`com.notifyloudly.notifyloudly`, scheme `notifyloudly`)

## Commands

- `bun install` — install dependencies (never npm/yarn/pnpm)
- `bun run start` — start the dev server
- `bun run android` — **only supported run path**: local dev build + run (`expo run:android`). Custom native code means **Expo Go is unsupported** (app shows a degraded-mode warning there by design)
- `bun run prebuild` — regenerate native projects (`expo prebuild`; re-run after any plugin/permission/service/receiver change)
- `bun run typecheck` — `tsc --noEmit` (must pass)
- `bun test` — parser + reliability unit tests (`src/parsers/__tests__/`)

## Layout

- `app/` — expo-router routes (`disclosure`, `onboarding`, `reliability`, `(tabs)/index|history|diagnostics|settings`)
- `modules/upi-listener/` — native module (Kotlin) + TS bridge (`src/index.ts`)
- `plugins/` — Expo config plugins
- `src/parsers/` — amount / UPI / dedup / speech-text pipeline + tests
- `src/db/` — SQLite client, schema, payment store, dedup seeds
- `src/store/` — onboarding + disclosure gate, settings, theme
- `src/components/` — theme, NavBar, StatusPill, upiApps allowlist, OEM guides, privacy link
- `docs/` — `reliability-checklist.md` (reboot/Doze manual tests), `build-checklist.md` (local builds + Play submission), `PRIVACY_POLICY.md`, `RELEASE_SIGNING.md`

## Release & Play submission

Local release: bump `version` + `android.versionCode` in `app.json`, provision the `MYAPP_UPLOAD_*` keystore properties (see `docs/RELEASE_SIGNING.md` — keystore lives outside the repo), `expo prebuild --clean`, then `bundleRelease`/`assembleRelease` from `android/` and verify with `apksigner verify --print-certs` (must show your release alias, never `CN=Android Debug`).

Play submission notes: keep Disclosure → Onboarding → system-grant order, declare the notification-listener permission with a disclosure→consent→grant→announcement→History demo video, fill the Data Safety form as on-device-only, and either justify `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with a demo video or remove it before submission (the app falls back to the generic battery page). Full checklist: `docs/build-checklist.md`.

## Limitations

- Android only; no iOS build.
- Requires a local dev build (`bun run android`) — statuses read as off in Expo Go.
- Speaks only recognized incoming UPI payment notifications from the 23 allowlisted packages; everything else is ignored by design.
