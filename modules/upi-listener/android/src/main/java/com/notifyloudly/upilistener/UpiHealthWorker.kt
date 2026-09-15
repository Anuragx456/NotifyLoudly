package com.notifyloudly.upilistener

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.service.notification.NotificationListenerService
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Periodic self-heal for the hard-kill case: when MIUI / ColorOS / FuntouchOS /
 * OneUI kills the app process outright, onListenerDisconnected() never fires,
 * so nothing rebinds until reboot or a manual reopen. This worker computes the
 * three-state health (see UpiListenerHealth), emits it for JS, and re-requests
 * the bind + restarts the TTS foreground service when recoverable.
 *
 * When the grant itself is revoked there is nothing to heal — requestRebind()
 * is a no-op without it — so the worker just reports and returns. A sustained
 * outage (either state) surfaces one low-priority nudge via UpiHealthNotifier.
 */
class UpiHealthWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {

  companion object {
    private const val TAG = "UpiHealth"
  }

  override fun doWork(): Result {
    val app = applicationContext
    val health = UpiListenerHealth.checkAndEmit(app)
    val lastCallbackAgeMs = UpiNotificationListenerService.lastCallbackAtMs
      .takeIf { it > 0L }
      ?.let { System.currentTimeMillis() - it }
    Log.i(TAG, "health check status=${health.status} connected=${health.connected} lastCallbackAgeMs=$lastCallbackAgeMs")
    try {
      UpiHealthNotifier.onWorkerCheck(app, health.status)
    } catch (e: Exception) {
      Log.w(TAG, "health nudge failed: ${e.message}")
    }
    if (health.status == UpiListenerHealth.STATUS_REVOKED) {
      Log.i(TAG, "health check skipped — notification access revoked, rebind is a no-op")
      return Result.success()
    }
    if (!health.connected) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        try {
          val component = ComponentName(app, UpiNotificationListenerService::class.java)
          NotificationListenerService.requestRebind(component)
          Log.i(TAG, "listener rebind requested")
        } catch (e: Exception) {
          Log.w(TAG, "listener rebind failed: ${e.message}")
        }
      }
    }
    try {
      val ttsOk = UpiTtsService.ensureRunning(app)
      Log.i(TAG, "tts ensureRunning=$ttsOk")
    } catch (e: Exception) {
      Log.w(TAG, "tts restart failed: ${e.message}")
    }
    return Result.success()
  }
}
