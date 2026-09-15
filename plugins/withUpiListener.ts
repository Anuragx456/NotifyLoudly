import { ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";

const LISTENER_SERVICE =
  "com.notifyloudly.upilistener.UpiNotificationListenerService";
const TTS_SERVICE = "com.notifyloudly.upilistener.UpiTtsService";
const BOOT_RECEIVER = "com.notifyloudly.upilistener.UpiBootReceiver";

// Allowlist authority: src/components/upiApps.ts (UPI_APPS, 23 entries).
// Keep this <queries> package list + AndroidManifest.xml + UpiListenerStore
// KNOWN_UPI_PACKAGES + DEFAULT_UPI_PACKAGES + APP_NAMES in sync with it.
// com.whatsapp is intentionally excluded: it appears in no parser table.
//
// NOTE: QUERY_ALL_PACKAGES was hard-deleted. It was the top Play Protect /
// Play review flag, and the <queries> block below (23 allowlisted UPI
// packages + upi intents) is the sole, sufficient visibility mechanism. Any
// residual declaration (e.g. from a third-party dep) is still stripped
// unconditionally in the manifest hook below. USE_FULL_SCREEN_INTENT was
// likewise hard-deleted with the lock-screen visual path (locked devices get
// audio + vibration only) — no Play flavor split remains.
//
// Banned in every build — stripped unconditionally, never injected.
const BANNED_PERMISSIONS = ["android.permission.QUERY_ALL_PACKAGES"];

const REQUIRED_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  // Overlay banner over any open app (B). Special-access grant via Settings;
  // Play review needs a declaration + demo video for this permission.
  "android.permission.SYSTEM_ALERT_WINDOW",
  // Heads-up payment alert (C). Runtime-requested on API 33+; install-time
  // no-op on older releases.
  "android.permission.POST_NOTIFICATIONS",
  // Doze exemption request — without this the app-killer in Reliability
  // silently does nothing and the nightly burst still wins.
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
];

const withUpiListener: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    const expectedPermissions = REQUIRED_PERMISSIONS;
    // Unconditional: banned permissions never survive —
    // covers our own sources and any third-party dep that declares them.
    const stripped = BANNED_PERMISSIONS;
    let usesPermissions = (manifest["uses-permission"] ?? []).filter(
      (entry) => !stripped.includes(entry.$?.["android:name"]),
    );
    for (const permission of expectedPermissions) {
      const alreadyListed = usesPermissions.some(
        (entry) => entry.$?.["android:name"] === permission,
      );
      if (!alreadyListed) {
        usesPermissions.push({ $: { "android:name": permission } });
      }
    }
    manifest["uses-permission"] = usesPermissions;

    const queries = manifest.queries ?? [];
    const hasUpiIntent = queries.some((q) =>
      q.intent?.some((i) => i.data?.some((d) => d.$?.["android:scheme"] === "upi")),
    );
    if (!hasUpiIntent) {
      queries.push({
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "upi" } }],
          },
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "upi", "android:host": "pay" } }],
          },
        ],
        package: [
          { $: { "android:name": "com.google.android.apps.nbu.paisa.user" } },
          { $: { "android:name": "com.google.android.apps.nbu.paisa.merchant" } },
          { $: { "android:name": "com.phonepe.app" } },
          { $: { "android:name": "com.phonepe.app.business" } },
          { $: { "android:name": "net.one97.paytm" } },
          { $: { "android:name": "net.one97.paytm.merchant" } },
          { $: { "android:name": "com.paytmbusiness" } },
          { $: { "android:name": "in.org.npci.upiapp" } },
          { $: { "android:name": "com.naviapp" } },
          { $: { "android:name": "com.navi.services" } },
          { $: { "android:name": "com.navi.upi" } },
          { $: { "android:name": "com.dreamplug.androidapp" } },
          { $: { "android:name": "in.amazon.mShop.android.shopping" } },
          { $: { "android:name": "tech.superpay.app" } },
          { $: { "android:name": "com.supermoney.app" } },
          { $: { "android:name": "com.sbi.upi" } },
          { $: { "android:name": "com.csam.icici.bank.imobile" } },
          { $: { "android:name": "com.msf.kbank.mobile" } },
          { $: { "android:name": "com.upi.axispay" } },
          { $: { "android:name": "com.hdfcbank.payzapp" } },
          { $: { "android:name": "com.canarabank.mobility" } },
          { $: { "android:name": "com.bankofbaroda.upi" } },
          { $: { "android:name": "com.bankofbaroda.mconnect" } },
        ],
      });
      manifest.queries = queries;
    }

    const application = manifest.application?.[0];
    if (!application) {
      return config;
    }
    // Privacy contract (docs/PRIVACY_POLICY.md: "no backup"): opt out of
    // Google Auto Backup so the payments DB never leaves the device.
    // Expo defaults this to true and exposes no app.json key, so this
    // withAndroidManifest hook is the only seam. Idempotent overwrite.
    application.$ = application.$ ?? {};
    application.$["android:allowBackup"] = "false";
    const services = application.service ?? [];
    const hasService = (name: string) =>
      services.some((service) => service.$?.["android:name"] === name);

    if (!hasService(LISTENER_SERVICE)) {
      services.push({
        $: {
          "android:name": LISTENER_SERVICE,
          "android:exported": "true",
          "android:permission":
            "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.service.notification.NotificationListenerService",
                },
              },
            ],
          },
        ],
      });
    }

    if (!hasService(TTS_SERVICE)) {
      services.push({
        $: {
          "android:name": TTS_SERVICE,
          "android:exported": "false",
          "android:foregroundServiceType": "mediaPlayback",
        },
      });
    }
    application.service = services;

    const receivers = application.receiver ?? [];
    const hasReceiver = (name: string) =>
      receivers.some((receiver) => receiver.$?.["android:name"] === name);

    if (!hasReceiver(BOOT_RECEIVER)) {
      receivers.push({
        $: {
          "android:name": BOOT_RECEIVER,
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.intent.action.BOOT_COMPLETED" } },
              { $: { "android:name": "android.intent.action.MY_PACKAGE_REPLACED" } },
            ],
          },
        ],
      });
    }
    application.receiver = receivers;

    return config;
  });
};

export default withUpiListener;
