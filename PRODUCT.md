# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Primary user is the counter merchant — a small Indian shopkeeper who keeps one Android phone on the shop counter and needs to hear each incoming UPI payment amount aloud without picking up the phone or checking the screen, often in a noisy shop while serving customers.

## Product Purpose

NotifyLoud listens for incoming UPI payment notifications, extracts the amount and sender, and speaks it aloud in near-real-time so the merchant can confirm payment by ear. Success is every incoming UPI payment announced loudly, correctly, and within well under a second, with a glanceable Listening / Not listening status when it cannot hear.

## Positioning

No UPI/bank API integration and no soundbox hardware: a notification-listener + parser + on-device TTS pipeline that turns the merchant's existing Android phone into a payment announcer. A neighboring product using bank APIs, SMS parsing, or cloud processing could not truthfully claim the same offline, on-phone path.

## Operating Context

Phone sits on the counter, screen may be off, app may be backgrounded. Workflows: grant notification access once via disclosure → onboarding; stay in Listening state; hear announcements for incoming payments only (money the merchant sends is ignored); replay or review from payment history. Environment is noisy — slower speech and audio ducking help the amount cut through. Relies on Android notification access, foreground TTS service, reboot/app-update receivers, and a battery-optimization exemption on Doze/OEM-skinned devices.

## Capabilities and Constraints

Confirmed functionality: custom Kotlin Expo module (`modules/upi-listener`) for NotificationListenerService, foreground service, and TTS; amount parser and dedup in `src/parsers`; on-device history in `expo-sqlite` (WAL mode) via `src/db/payments`; routes for home status, disclosure, onboarding, history, settings, reliability, diagnostics; settings for speech rate (0.5–2.0), locale tag (`en-IN`, `hi-IN`), audio ducking, mute, and per-app allowlist (`DEFAULT_UPI_PACKAGES`: GPay, PhonePe, Paytm, BHIM, …); test-voice and replay speech.

Technical constraints: Android only (`com.notifyloud.upiannouncer`, scheme `upiannouncer`, portrait, Expo SDK 57 New Architecture, Hermes); Bun as package manager (`bun install`, `bun run android`); Expo Go cannot run native features — local dev build required; full notification text is never stored long-term; no account, no server, no upload, no analytics.

Undecided: canonical display name (see Brand Commitments).

## Brand Commitments

Observed: `app.json` name is "UPI Payment Announcer" (slug `upi-payment-announcer`); in-app copy and system-settings references use "NotifyLoud". Package `com.notifyloud.upiannouncer`. Voice is plain, instructional merchant copy (e.g. "Keep this phone on the counter"). No binding visual constraint volunteered. Canonical display name left undecided — future work must not invent a new name.

## Evidence on Hand

Real paths: `app/index.tsx` (counter status + last payment), `app/disclosure.tsx`, `app/onboarding.tsx`, `app/history.tsx`, `app/settings.tsx`, `app/reliability.tsx`, `app/diagnostics.tsx`, `src/parsers`, `src/db/payments.ts`, `src/store/settings.ts`, `modules/upi-listener`, `plugins/withUpiListener.ts`, `docs/reliability-checklist.md`, `docs/build-checklist.md`.

Absences future work must not fabricate: no testimonials, customers, benchmarks, pricing, licensing, or deployment claims.

## Product Principles

1. Announce or say why not — never fail silently; Not listening must always show the fix.
2. Speed is trust — speech starts fast; latency is shown per announcement.
3. On-phone and private — listening, parsing, and history stay offline on the device.
4. Counter-glanceable — status and last payment readable from a distance in noise.
5. Survival over features — reboot, Doze, OEM killers, and revoked permission outrank new capabilities.

## Accessibility & Inclusion

Noisy-counter use requires loud, clear TTS (`en-IN`/`hi-IN`), audio ducking, and large touch targets (min 48–56px in current code). No formal accessibility standard confirmed.
