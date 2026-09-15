package com.notifyloudly.upilistener

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.util.Log

class UpiBootReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "UpiBoot"
  }

  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }
    Log.i(TAG, "received $action — restoring listener pipeline")
    try {
      UpiListenerStore.ensureSettingsLoaded(context.applicationContext)
    } catch (e: Exception) {
      Log.w(TAG, "settings preload failed: ${e.message}")
    }
    try {
      UpiTtsService.ensureRunning(context.applicationContext)
    } catch (e: Exception) {
      Log.w(TAG, "tts restart failed: ${e.message}")
    }
    try {
      UpiHealthScheduler.ensureScheduled(context.applicationContext)
    } catch (e: Exception) {
      Log.w(TAG, "health check schedule failed: ${e.message}")
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      try {
        val component = ComponentName(context.applicationContext, UpiNotificationListenerService::class.java)
        NotificationListenerService.requestRebind(component)
        Log.i(TAG, "listener rebind requested")
      } catch (e: Exception) {
        Log.w(TAG, "listener rebind failed: ${e.message}")
      }
    }
  }
}
