package com.notifyloudly.upilistener

import android.content.Context
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * Single place that turns (grant, bind) into the three-state health the JS
 * layer reacts to:
 * - "connected" — bound, payments will announce.
 * - "disconnected" — grant present but service unbound; requestRebind() can
 *   recover this (the hard-kill case from Phase 1).
 * - "access-revoked" — our package is gone from the enabled-listener set
 *   (MIUI / some OEMs revoke the grant instead of just unbinding).
 *   requestRebind() is a no-op here — the user must re-toggle in Settings.
 */
object UpiListenerHealth {
  private const val TAG = "UpiHealth"

  const val STATUS_CONNECTED = "connected"
  const val STATUS_DISCONNECTED = "disconnected"
  const val STATUS_REVOKED = "access-revoked"

  data class Health(
    val status: String,
    val accessGranted: Boolean,
    val connected: Boolean
  )

  fun isAccessGranted(context: Context): Boolean {
    return try {
      val app = context.applicationContext
      NotificationManagerCompat.getEnabledListenerPackages(app).contains(app.packageName)
    } catch (e: Exception) {
      Log.w(TAG, "access check failed: ${e.message}")
      false
    }
  }

  fun check(context: Context): Health {
    val granted = isAccessGranted(context)
    val connected = UpiNotificationListenerService.isConnected
    val status = when {
      !granted -> STATUS_REVOKED
      connected -> STATUS_CONNECTED
      else -> STATUS_DISCONNECTED
    }
    return Health(status, granted, connected)
  }

  fun toMap(health: Health): Map<String, Any> {
    return mapOf(
      "status" to health.status,
      "accessGranted" to health.accessGranted,
      "connected" to health.connected
    )
  }

  @Volatile
  private var lastEmittedStatus: String? = null

  /**
   * Computes health and emits onListenerHealthChanged only when the status
   * string changed since the last emit — the worker runs every 15 min, and
   * waking JS on every run with an unchanged status would be pure churn.
   * Always returns the current health so foreground callers can use it
   * synchronously without waiting for the event round-trip.
   */
  @Synchronized
  fun checkAndEmit(context: Context): Health {
    val health = check(context)
    // Track outage continuity here (not just in the worker) so foreground
    // checks and bind flips stamp/clear the outage too — the 45min nudge
    // threshold then measures real downtime, not worker-run gaps.
    try {
      UpiHealthNotifier.onHealthObserved(context.applicationContext, health.status)
    } catch (e: Exception) {
      Log.w(TAG, "outage track failed: ${e.message}")
    }
    if (health.status != lastEmittedStatus) {
      lastEmittedStatus = health.status
      try {
        UpiListenerBridge.emitHealth(health.status, health.accessGranted, health.connected)
      } catch (e: Exception) {
        Log.w(TAG, "health emit failed: ${e.message}")
      }
      Log.i(
        TAG,
        "health changed status=${health.status} granted=${health.accessGranted} connected=${health.connected}"
      )
    }
    return health
  }
}
