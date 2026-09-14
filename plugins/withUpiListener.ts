import { ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";

const LISTENER_SERVICE =
  "com.notifyloudly.upilistener.UpiNotificationListenerService";
const TTS_SERVICE = "com.notifyloudly.upilistener.UpiTtsService";
const BOOT_RECEIVER = "com.notifyloudly.upilistener.UpiBootReceiver";
const ALERT_ACTIVITY = "com.notifyloudly.upilistener.PaymentAlertActivity";

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
  // Lock-screen full-screen card (A). Lets the heads-up notification's
  // full-screen intent legally launch PaymentAlertActivity over the keyguard
  // from the background on Android 14+. Install-time grant for sideloaded
  // apps; the user can revoke it under Special app access → Manage
  // full-screen intents.
  // TODO(play): remove before any Play upload — Play restricts this to
  // calling/alarm apps and rejects other uploads declaring it.
  "android.permission.USE_FULL_SCREEN_INTENT",
  // Doze exemption request — without this the app-killer in Reliability
  // silently does nothing and the nightly burst still wins.
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  // TODO(play): remove before any Play upload — the <queries> block below is
  // sufficient for allowlisted UPI packages. Kept for local sideload breadth;
  // Play rejects QUERY_ALL_PACKAGES without a declaration.
  "android.permission.QUERY_ALL_PACKAGES",
];

const withUpiListener: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    const usesPermissions = manifest["uses-permission"] ?? [];
    for (const permission of REQUIRED_PERMISSIONS) {
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
          { $: { "android:name": "com.whatsapp" } },
        ],
      });
      manifest.queries = queries;
    }

    const application = manifest.application?.[0];
    if (!application) {
      return config;
    }
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

    const activities = application.activity ?? [];
    const hasActivity = (name: string) =>
      activities.some((activity) => activity.$?.["android:name"] === name);

    if (!hasActivity(ALERT_ACTIVITY)) {
      activities.push({
        $: {
          "android:name": ALERT_ACTIVITY,
          "android:exported": "false",
          "android:launchMode": "singleInstance",
          "android:excludeFromRecents": "true",
          "android:noHistory": "true",
          "android:showWhenLocked": "true",
          "android:turnScreenOn": "true",
        },
      });
    }
    application.activity = activities;
    return config;
  });
};

export default withUpiListener;
