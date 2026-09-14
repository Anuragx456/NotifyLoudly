# Reliability checklist — reboot survival and Doze-mode behavior (Phase 6)

Run on a physical device with a local dev build (`bun run android`). Expo Go
cannot test any of this — it has no native module. Tick each box by hand.

## A. Fresh-install baseline
- [ ] Install, grant notification access, reach Home showing **Listening**.
- [ ] Run **Test announcement** — speech starts in well under 1 second.
- [ ] Diagnostics shows Listener **Bound**, speech service **Running**, voice engine **Ready**.

## B. Reboot survival
- [ ] Reboot the phone. Do NOT open NotifyLoudly yet.
- [ ] Send a test UPI payment within 2 minutes of boot completing.
- [ ] Open NotifyLoudly → Diagnostics: listener reads **Bound** (receiver re-bound it).
- [ ] Open NotifyLoudly once, then background it — History shows the payment.

## C. App-update survival
- [ ] Run `bun run android` again over the install (triggers MY_PACKAGE_REPLACED).
- [ ] Without opening the app, send a test payment — it is announced.
- [ ] Diagnostics still reads **Bound**.

## D. Doze / overnight
- [ ] In Stay-alive setup, request the battery exemption; status reads **Exempt**.
- [ ] Leave the phone unplugged, screen off, for 30+ minutes (or overnight).
- [ ] Send a test payment — announced without opening the app first.
- [ ] Repeat with the exemption revoked (Settings → Apps → Battery → Optimised):
      announcements should be delayed or missing — this confirms the exemption matters.

## E. OEM killers (Xiaomi / Oppo / Vivo / Samsung)
- [ ] Follow the brand steps in Stay-alive setup (autostart + unrestricted battery).
- [ ] Swipe NotifyLoudly away from Recents — Home still reads **Listening** on reopen.
- [ ] Lock it in Recents where the OEM supports locking (Xiaomi).

## F. Permission revoked
- [ ] Revoke notification access in system settings.
- [ ] Home reads **Not listening** with the enable-access button; Diagnostics reads **Not allowed**.
- [ ] Re-grant from the in-app button — status flips without reinstalling.

## G. Payment pop-up (overlay)
- [ ] Settings → Payment pop-up → **Preview pop-up** shows the sample card.
- [ ] With another app open (e.g. YouTube), send a test payment — the banner
      floats above it with amount + sender, and tapping it opens History.
- [ ] With the phone locked, send a test payment — no card, no heads-up, no
      shade entry appears; the payment is spoken aloud + vibrates only.
      Unlocking shows no stale card.
- [ ] With “Display over other apps” revoked, the banner stays hidden but the
      heads-up alert + speech still fire when unlocked (fallback works).
- [ ] With the pop-up toggle off, no visual appears but speech + History still work.

## Play Store note
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is a restricted permission. A release
build for Play review must either justify it under an allowed use case or drop
it from `plugins/withUpiListener.ts` and rely on the generic battery-settings
fallback (already implemented in `openBatteryExemptionRequest`).

`SYSTEM_ALERT_WINDOW` (payment banner) is also sensitive: declare it with a
demo video, or turn the pop-up toggle off-by-default path into notification-only
mode. Do NOT add `USE_FULL_SCREEN_INTENT` — since Android 14 Play restricts it
to calling/alarm apps; locked phones get audio + vibration with no visual by design.
