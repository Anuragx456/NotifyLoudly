# Privacy Policy — NotifyLoudly

**Effective date:** 2026-09-14
**Contact:** https://github.com/anuragx456/

> **Hosting note (maintainer):** this file must be served at a public URL for
> Play review (Data Safety form + store listing "Privacy policy" field). The
> in-app disclosure screen links to `expo.extra.privacyPolicyUrl` in
> `app.json` — keep that value pointing at wherever this document is hosted
> (e.g. GitHub Pages). Do not link reviewers at this repo-relative path.

NotifyLoudly ("the app") announces UPI payments aloud on a merchant counter
phone. This policy explains what the app reads, what it stores, and — just as
important — what it never collects or sends anywhere.

## What the app reads

To speak payments aloud, the app must see payment notifications. With your
explicit consent (in-app disclosure → system grant), it uses:

| Access | Why |
|--------|-----|
| Notification listener (`BIND_NOTIFICATION_LISTENER_SERVICE`) | Reads the **title and body** of notifications from your UPI and bank apps, extracts amount + sender, speaks it aloud. **UPI payment notifications only** — no other notification content is used. |
| Notifications (`POST_NOTIFICATIONS`) | Fallback heads-up payment alert when unlocked and the banner/overlay is off. Hidden from the lock screen. |
| Display over other apps (`SYSTEM_ALERT_WINDOW`, optional) | Overlay banner that floats the payment card above any open app when unlocked. |
| Battery exemption (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, suggested) | Stops Doze mode from pausing the speech service overnight. |
| Run at boot (`RECEIVE_BOOT_COMPLETED`) | Re-starts the speech service and re-binds the listener after reboot or app update. |
| Foreground service (`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) | Keeps the speech service alive while announcing. |

## What the app stores — on this device only

Amount, sender, app and time of each **announced incoming payment** are kept
in on-device SQLite storage (`payments` table) so the app can show History and
replay the last announcement. Nothing else is retained.

## What the app never does

- **No upload.** Notification text, amounts, sender names and history never
  leave the device. There is no server, no sync, no backup.
- **No account.** No sign-in, no identifier, no advertising ID use.
- **No analytics, no ads, no third-party SDKs** that collect data.
- **No outgoing payments.** Notifications about money *you sent* are detected
  and ignored ("you-have-sent" guard) — they are neither spoken nor stored.
- **No non-payment notifications.** Anything that is not a recognized incoming
  UPI payment is ignored.

## Retention and deletion

History lives only on the device until you delete it: Settings → Clear
history removes all stored payments. Uninstalling the app deletes everything
(the database ships inside app-private storage).

## Children

The app is a merchant utility, not directed at children, and collects no data
from anyone.

## Changes

Material changes to this policy will ship with an app update and a matching
update to this document. Continued use after an update constitutes acceptance.
