package com.notifyloudly.upilistener

import android.content.Context
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Owns the periodic [UpiHealthWorker] job.
 *
 * Never scheduled before the first notification-access grant (see the
 * ever-granted latch in [UpiListenerStore]) — scheduling earlier would start
 * recovery work (and the TTS foreground service) before consent. Once
 * granted, the job is kept even if an OEM later revokes the grant, so the
 * worker can keep reporting "access-revoked" (where requestRebind() is a
 * no-op and only the user re-toggling in Settings recovers).
 */
object UpiHealthScheduler {
  private const val TAG = "UpiHealth"
  private const val UNIQUE_NAME = "upi-listener-health"

  fun ensureScheduled(context: Context): Boolean {
    val app = context.applicationContext
    val granted = UpiListenerHealth.isAccessGranted(app)
    if (granted) {
      UpiListenerStore.markHealthEverGranted(app)
    } else if (!UpiListenerStore.isHealthEverGranted(app)) {
      Log.i(TAG, "notification access not granted — health check not scheduled")
      cancel(app)
      return false
    } else {
      Log.i(TAG, "notification access revoked — keeping health check to report it")
    }
    return try {
      val request = PeriodicWorkRequestBuilder<UpiHealthWorker>(15, TimeUnit.MINUTES)
        .addTag(UNIQUE_NAME)
        .build()
      WorkManager.getInstance(app)
        .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
      Log.i(TAG, "health check scheduled (15min)")
      true
    } catch (e: Exception) {
      Log.w(TAG, "health check schedule failed: ${e.message}")
      false
    }
  }

  fun cancel(context: Context) {
    try {
      WorkManager.getInstance(context.applicationContext).cancelUniqueWork(UNIQUE_NAME)
      Log.i(TAG, "health check cancelled")
    } catch (e: Exception) {
      Log.w(TAG, "health check cancel failed: ${e.message}")
    }
  }
}
