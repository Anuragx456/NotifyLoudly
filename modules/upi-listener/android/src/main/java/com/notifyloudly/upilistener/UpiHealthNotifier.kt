package com.notifyloudly.upilistener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Once-per-outage nudge when the listener stays down.
 *
 * The worker ([UpiHealthWorker]) self-heals silently — rebind + TTS restart —
 * but on aggressive OEM skins the bind may never come back, or the grant
 * itself may be revoked (where rebind is a no-op). After [OUTAGE_THRESHOLD_MS]
 * of continuous downtime the worker posts one low-priority notification on
 * the existing announcements channel ([UpiTtsService.CHANNEL_ID],
 * IMPORTANCE_LOW — no heads-up, no sound) so the user can fix it:
 * - revoked → deep-links to onboarding (re-toggle the grant);
 * - disconnected → deep-links to reliability (stay-alive steps).
 *
 * Split responsibilities (posting from a foreground/bridge thread would be
 * wrong — odd UX and IPC on the caller thread):
 * - [onHealthObserved] — lightweight outage stamping, safe to call from any
 *   health path (worker, foreground check, bind flips). Never posts.
 * - [onWorkerCheck] — stamps then posts if due. Worker only.
 *
 * Outage continuity + already-nudged state live in [UpiListenerStore] prefs
 * as wall-clock ms (survives reboot, unlike elapsedRealtime): the first down
 * observation stamps the start, the nudge fires once the outage is older
 * than the threshold, and both reset when health returns to connected (which
 * also cancels a lingering nudge). A nudge is therefore posted at most once
 * per outage, never every worker run.
 */
object UpiHealthNotifier {
  private const val TAG = "UpiHealth"
  const val HEALTH_NOTIF_ID = 1003
  const val OUTAGE_THRESHOLD_MS = 45L * 60L * 1000L
  const val DEEP_LINK_ONBOARDING = "notifyloudly://onboarding"
  const val DEEP_LINK_RELIABILITY = "notifyloudly://reliability"

  fun onHealthObserved(app: Context, status: String) {
    val context = app.applicationContext
    // Pre-consent installs read as revoked too — never stamp those as an
    // outage, or the first post-grant wobble would inherit pre-grant age.
    if (status == UpiListenerHealth.STATUS_REVOKED &&
      !UpiListenerStore.isHealthEverGranted(context)
    ) {
      return
    }
    if (status == UpiListenerHealth.STATUS_CONNECTED) {
      if (UpiListenerStore.getHealthOutageSince(context) != 0L) {
        UpiListenerStore.clearHealthOutage(context)
        try {
          NotificationManagerCompat.from(context).cancel(HEALTH_NOTIF_ID)
        } catch (_: Exception) {
        }
        Log.i(TAG, "listener recovered — outage cleared, nudge cancelled")
      }
      return
    }
    if (UpiListenerStore.getHealthOutageSince(context) <= 0L) {
      UpiListenerStore.setHealthOutageSince(context, System.currentTimeMillis())
      Log.i(TAG, "outage started status=$status")
    }
  }

  fun onWorkerCheck(app: Context, status: String) {
    val context = app.applicationContext
    onHealthObserved(context, status)
    if (status == UpiListenerHealth.STATUS_CONNECTED) return
    val since = UpiListenerStore.getHealthOutageSince(context)
    if (since <= 0L) return
    val ageMs = System.currentTimeMillis() - since
    if (ageMs < OUTAGE_THRESHOLD_MS) {
      Log.i(TAG, "outage ongoing status=$status ageMin=${ageMs / 60000}")
      return
    }
    if (UpiListenerStore.isHealthNudgePostedFor(context, since)) return
    postNudge(context, status, since)
  }

  private fun postNudge(app: Context, status: String, since: Long) {
    if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) {
      Log.i(TAG, "alert notifications disabled — nudge skipped")
      return
    }
    ensureChannel(app)
    val revoked = status == UpiListenerHealth.STATUS_REVOKED
    val deepLink = if (revoked) DEEP_LINK_ONBOARDING else DEEP_LINK_RELIABILITY
    val intent = try {
      Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        setPackage(app.packageName)
      }
    } catch (_: Exception) {
      app.packageManager.getLaunchIntentForPackage(app.packageName)
        ?: Intent(Intent.ACTION_MAIN).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    }
    val pending = PendingIntent.getActivity(
      app,
      if (revoked) 5_000_001 else 5_000_002,
      intent,
      immutableFlags(PendingIntent.FLAG_UPDATE_CURRENT)
    )
    val notification = NotificationCompat.Builder(app, UpiTtsService.CHANNEL_ID)
      .setSmallIcon(
        if (app.applicationInfo.icon != 0) app.applicationInfo.icon
        else android.R.drawable.ic_lock_idle_alarm
      )
      .setContentTitle("NotifyLoudly stopped listening")
      .setContentText(
        if (revoked) "Notification access was turned off — tap to turn it back on"
        else "Tap to fix — UPI payments won't announce until then"
      )
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    try {
      NotificationManagerCompat.from(app).notify(HEALTH_NOTIF_ID, notification)
    } catch (e: Exception) {
      Log.w(TAG, "nudge post failed: ${e.message}")
      return
    }
    UpiListenerStore.markHealthNudgePostedFor(app, since)
    Log.i(TAG, "nudge posted status=$status deepLink=$deepLink")
  }

  private fun ensureChannel(app: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = app.getSystemService(NotificationManager::class.java) ?: return
    // Same id/name/level as UpiTtsService.createChannel — created here too
    // because the worker can run while the TTS service is dead.
    if (manager.getNotificationChannel(UpiTtsService.CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          UpiTtsService.CHANNEL_ID,
          "Payment announcements",
          NotificationManager.IMPORTANCE_LOW
        )
      )
    }
  }

  private fun immutableFlags(base: Int): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      base or PendingIntent.FLAG_IMMUTABLE
    } else {
      base
    }
  }
}
