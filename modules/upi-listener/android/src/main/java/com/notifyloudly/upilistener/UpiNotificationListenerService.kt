package com.notifyloudly.upilistener

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class UpiNotificationListenerService : NotificationListenerService() {

  companion object {
    private const val TAG = "UpiListener"
    @Volatile
    var isConnected: Boolean = false
      private set

    @Volatile
    var lastCallbackAtMs: Long = 0L
      private set

    private const val MAX_TEXT_LEN = 500
    private const val MAX_EXTRA_LEN = 500
  }

  override fun onListenerConnected() {
    isConnected = true
    UpiListenerBridge.emitConnection(true)
    // Push the tri-state too — connection-only listeners can't tell
    // "bound" apart from "grant revoked", and the worker only runs ~15min.
    UpiListenerHealth.checkAndEmit(this)
  }

  override fun onListenerDisconnected() {
    isConnected = false
    UpiListenerBridge.emitConnection(false)
    UpiListenerHealth.checkAndEmit(this)
    try {
      requestRebind(ComponentName(this, UpiNotificationListenerService::class.java))
    } catch (_: Exception) {
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    lastCallbackAtMs = System.currentTimeMillis()
    val receivedElapsed = SystemClock.elapsedRealtime()
    val packageName = sbn.packageName ?: return
    if (!UpiListenerStore.isAllowlisted(applicationContext, packageName)) {
      Log.i(TAG, "filtered package-not-allowlisted pkg=$packageName key=${sbn.key}")
      return
    }
    val notification = sbn.notification ?: return
    val extras = notification.extras ?: return

    val title = capped(extras.getCharSequence(Notification.EXTRA_TITLE))
    val text = capped(extras.getCharSequence(Notification.EXTRA_TEXT))
    // Fold style-dependent extras into bigText so the gate and the JS parser
    // see the same text no matter which Notification.Style the UPI app used.
    // Previously only title/text/bigText/subText were read, so InboxStyle
    // (EXTRA_TEXT_LINES), MessagingStyle (EXTRA_MESSAGES) and summary/info
    // variants arrived as empty-text / no-amount and were silently dropped.
    val bigText = capped(
      joinExtras(
        extras.getCharSequence(Notification.EXTRA_BIG_TEXT),
        extras.getCharSequence("android.title.big"),
        extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT),
        extras.getCharSequence(Notification.EXTRA_INFO_TEXT),
        textLines(extras),
        messageTexts(notification),
      )
    )
    val subText = capped(extras.getCharSequence(Notification.EXTRA_SUB_TEXT))

    announceNatively(packageName, title, text, bigText, subText, sbn.postTime, receivedElapsed, sbn.key)

    val payload = mapOf<String, Any>(
      "packageName" to packageName,
      "title" to title,
      "text" to text,
      "bigText" to bigText,
      "subText" to subText,
      "tickerText" to capped(notification.tickerText),
      "postedAt" to sbn.postTime,
      "notificationId" to sbn.id,
      "key" to (sbn.key ?: "")
    )
    UpiListenerBridge.emitNotification(payload)
  }

  private fun announceNatively(
    packageName: String,
    title: String,
    text: String,
    bigText: String,
    subText: String,
    postedAt: Long,
    receivedElapsed: Long,
    sbnKey: String? = null
  ) {
    UpiListenerStore.ensureSettingsLoaded(applicationContext)
    val decision = UpiAnnounceGate.decide(
      packageName = packageName,
      title = title,
      text = text,
      bigText = bigText,
      subText = subText,
      postedAt = postedAt,
      allowlisted = true,
      sbnKey = sbnKey
    )
    if (!decision.speak || decision.text == null) {
      Log.i(TAG, "rejected reason=${decision.reason} pkg=$packageName")
      return
    }
    Log.i(TAG, "announcing pkg=$packageName reason=${decision.reason}")
    UpiTtsService.enqueue(
      applicationContext,
      decision.text,
      postedAt,
      receivedElapsed,
      "notification",
      decision.amountPaise ?: -1L,
      decision.sender,
      decision.appName,
      decision.sourcePackage
    )
  }

  private fun capped(value: CharSequence?): String {
    val raw = value?.toString() ?: ""
    return if (raw.length > MAX_TEXT_LEN) raw.take(MAX_TEXT_LEN) else raw
  }

  private fun textLines(extras: Bundle): String {
    return try {
      val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES) ?: return ""
      lines.mapNotNull { it?.toString()?.trim()?.ifEmpty { null } }.joinToString(" ")
    } catch (_: Exception) {
      ""
    }
  }

  private fun messageTexts(notification: Notification): String {
    // AndroidX path: EXTRA_MESSAGES holds framework Message parcelables,
    // not Bundles (the old cast to Bundle always failed and returned "").
    try {
      val style = androidx.core.app.NotificationCompat.MessagingStyle
        .extractMessagingStyleFromNotification(notification)
      if (style != null) {
        val texts = style.messages.mapNotNull {
          it.text?.toString()?.trim()?.ifEmpty { null }
        }.joinToString(" ")
        if (texts.isNotEmpty()) return texts
      }
    } catch (_: Exception) {
    }
    return try {
      val messages = notification.extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return ""
      messages.mapNotNull { item ->
        (item as? Notification.MessagingStyle.Message)?.text?.toString()?.trim()?.ifEmpty { null }
          ?: (item as? Bundle)?.getCharSequence("text")?.toString()?.trim()?.ifEmpty { null }
      }.joinToString(" ")
    } catch (_: Exception) {
      ""
    }
  }

  private fun joinExtras(vararg parts: CharSequence?): String {
    val out = StringBuilder()
    for (part in parts) {
      val s = part?.toString()?.trim()
      if (s.isNullOrEmpty()) continue
      if (out.isNotEmpty()) out.append(' ')
      out.append(s)
      if (out.length >= MAX_EXTRA_LEN) break
    }
    val raw = out.toString()
    return if (raw.length > MAX_TEXT_LEN) raw.take(MAX_TEXT_LEN) else raw
  }
}
