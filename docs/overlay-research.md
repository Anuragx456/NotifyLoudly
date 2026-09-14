# Overlay Payment Prompt — Research & Gap Analysis

> Status: **Historical — describes the pre-removal 3-tier design.** The
> lock-screen tier (A) has since been removed: locked phones get audio +
> vibration with no visual by design. Mockups in `docs/overlay-preview.html`
> and `docs/overlay-mockups/` are kept for reference only.

## 1. What already exists (native, JS-independent)

The app implements a 2-tier visual prompt (unlocked only) alongside the TTS announcement, so it fires even when JS is dead (e.g. 2 min after `BOOT_COMPLETED`).

| Tier | Where | File | Trigger | What merchant sees |
|---|---|---|---|---|
| **C — Heads-up notification** | Unlocked | `PaymentAlertManager.postHeadsUp()` | Every incoming payment while unlocked | `IMPORTANCE_HIGH` channel "Payment pop-ups", `CATEGORY_ALARM`, `PRIORITY_HIGH`, `VISIBILITY_SECRET` (hidden from lockscreen), `BigTextStyle` with speech quote, actions **View** / **Dismiss**, `timeoutAfter 25s`, no full-screen intent |
| **B — Floating banner** | Unlocked, over any app | `PaymentAlertManager.showOverlayBanner()` | `!isLocked && Settings.canDrawOverlays` | `WindowManager TYPE_APPLICATION_OVERLAY` (`FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCH_MODAL`), top-gravity, white card with green left strip + green dot + `NotifyLoudly · now`, amount `30sp`, sender+app, countdown `closes in Ns`, horizontal progress bar, tap → deep-link `notifyloudly://history` |
| **~~A — Full-screen lock card~~ (removed)** | ~~Locked~~ | ~~`PaymentAlertActivity` (deleted)~~ | ~~`isLocked()`~~ | ~~Removed — locked = vibrate only + TTS audio, no visual.~~ |

Manifest (`android/app/src/main/AndroidManifest.xml` + `plugins/withUpiListener.ts`):
`SYSTEM_ALERT_WINDOW`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `RECEIVE_BOOT_COMPLETED`,
`UpiBootReceiver(BOOT_COMPLETED, MY_PACKAGE_REPLACED)`, `UpiTtsService(mediaPlayback)`.
No `PaymentAlertActivity`, no `USE_FULL_SCREEN_INTENT`.

Entry point (`UpiTtsService.enqueue()`): only `source=="notification" && amountPaise>0` shows visual — test/self-test speech never pops (correct). Called before `instance` check, so visual fires even via `staticPending` cold-start path.

Settings (`UpiListenerStore` + `app/(tabs)/settings.tsx`):
`overlayEnabled` toggle (default `true`), `isOverlayAccessGranted/canDrawOverlays`, `areAlertNotificationsEnabled`, `showTestAlert()` with fixed sample `₹1,250.50 · Rahul Sharma · Google Pay`, plus `openOverlayAccessSettings()` / `requestAlertNotifications()` with manual fallback hints.

Deep links: `HISTORY_DEEP_LINK = notifyloudly://history` (with `setPackage`), fallback to launcher intent.

## 2. Prior-art mockups

`docs/overlay-mockups/A_fullscreen_lock_alert.png` / `B_overlay_banner_over_app.png` / `C_headsup_fallback.png` already capture the three tiers as-speced. New interactive preview is in `docs/overlay-preview.html`.

## 3. Gaps vs. "priority no matter which app or even locked"

| Gap | Impact | Where to fix |
|---|---|---|
| **A1 — `overlayEnabled` gates heads-up too** (`PaymentAlertManager.showAlert(): if (!overlayEnabled) return` before `postHeadsUp`). Turning "Show payment pop-up" OFF kills even the fallback heads-up. Merchant who disables banner loses all visual, not just overlay. | Merchant disables banner → zero visual, misses payment | Split gate: banner/activity respect toggle; heads-up always posts (or separate toggle) |
| **A2 — Heads-up silently skipped if notifications disabled** (`areNotificationsEnabled()==false → return`). Correct, but no in-app nudge. Reliability screen doesn't mention it. | Heads-up never appears, no hint why | Surface state + deep-link to app notification settings in Reliability/Settings |
| **B1 — Banner 8s may be too short in noisy shop** (`OVERLAY_SECONDS=8`). Merchant serving customer may miss it. No persistence option. | Missed payments | Make configurable (8/12/30/persist-until-tap) or at least 12s + keep count-down |
| **B2 — Banner not focusable but also not dismissed on new payment** (`removeOverlay` called at top of `showOverlayBanner`, but if two payments arrive <8s apart, first is replaced silently). OK, but no queue/peek for back-to-back UPI. | Second payment overwrites first with no history of first | Queue or stack 2, or at least log both to heads-up |
| **B3 — Banner width/elevation may clip on some OEMs / gesture nav** (`MATCH_PARENT + pad 12 + top 48`, `elevation 8dp`). No `FLAG_LAYOUT_IN_SCREEN` handling for cutouts. | Banner clipped under status bar on notched devices | Verify `WindowInsets` / increase top to `statusBarHeight + 8dp` |
| **~~C1 — Lock card `AUTO_FINISH 30s`~~ (removed with tier A)** | — | — |
| **D1 — No haptics** — only notification vibration via channel. Banner/activity have no explicit vibration. | In noisy shop, vibration helps | Add short haptic on `showAlert` (when not in DND) |
| **E1 — `isLocked()` uses `!isInteractive` so screen-off-but-unlocked counts as locked** → launches full-screen activity instead of banner. Probably intended, but worth confirming. | Screen off on counter → activity launch wakes screen (good). | Keep, but document |
| **F1 — Play Store risk: `SYSTEM_ALERT_WINDOW` needs declaration + demo video** Already noted in reliability checklist. | Rejection if not declared | Keep toggle default-on but allow review build to ship with overlay off-by-default path |
| **G1 — No `USE_FULL_SCREEN_INTENT` by design** (Play restricts to calling/alarm). No lock-screen visual exists at all — locked = audio + vibration only, so no FSI/activity path is needed on any Android version. | None | None — historical row, kept for context |
| **H1 — No accessibility / large-text scaling for amounts** — fixed `sp` sizes (`30sp` banner) don't respond to system font scale beyond sp. Should, but verify max size doesn't overflow. | Amount truncated on large-font devices | Add `maxLines` / `ellipsize` + test at 200% font scale |

## 4. Where to implement the hardened "always priority" prompt

All visual code is natively contained — no JS change needed for priority:

- **Heads-up (unlocked fallback):** `PaymentAlertManager.postHeadsUp()` + `ensureChannel()` — already priority; decoupled from `overlayEnabled`.
- **Banner (unlocked, over any app):** `PaymentAlertManager.showOverlayBanner()` — `WindowManager` path is correct for "no matter which app". Keep `TYPE_APPLICATION_OVERLAY`. No Compose/React needed.
- **Locked:** no visual — `showAlert()` returns after vibration when `isLocked()`.
- **Permission wiring:** `UpiListenerModule` (`isOverlayAccessGranted`, `openOverlayAccessSettings`, `areAlertNotificationsEnabled`, `requestAlertNotifications`, `showTestAlert`) + `plugins/withUpiListener.ts` manifest — no new permission needed.
- **Settings UI:** `app/(tabs)/settings.tsx` "Payment pop-up" section + `app/(tabs)/diagnostics.tsx` + `app/reliability.tsx` — surface grant states + preview.
- **Trigger:** `UpiTtsService.enqueue()` — already the right chokepoint (works post-boot). No change needed except ensuring visual fires even when `muted`.

Do NOT add `USE_FULL_SCREEN_INTENT` (`android.permission.USE_FULL_SCREEN_INTENT`) — Play restricts it. Locked phones get audio + vibration with no visual by design.

## 5. Proposed plan (awaiting your approval)

**No code edits until you approve the mockups below.** When approved:

1. **Decouple heads-up from toggle** — heads-up posts even when `overlayEnabled==false` (banner/activity still gated).
2. **Lengthen banner** `OVERLAY_SECONDS` 8 → 12s (or make it a setting: 8/12/30), add `FLAG_KEEP_SCREEN_ON` to banner window while visible.
3. **Verify top inset** — use `statusBarHeight` for banner top padding so it never hides under cutout/gesture bar.
4. **Add optional haptic** — `VibrationEffect` 200ms tick on show (gated by notification channel vibration).
5. **Surface in Reliability** — add "Notifications" + "Display over other apps" rows to `app/reliability.tsx` so merchant sees why fallback is missing.
6. **Keep Play-safe** — no new permission; keep `Preview pop-up` as manual test hook for screenshots/video.

Manual test after (`docs/reliability-checklist.md §G`):
- With YouTube open → banner floats, tap opens History.
- Phone locked → no visual at all; spoken aloud + vibrates only; no stale card on unlock.
- Revoke "Display over other apps" → heads-up + speech still fire when unlocked.
- Toggle off → speech + History only.
