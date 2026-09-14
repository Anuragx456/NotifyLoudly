package com.notifyloudly.upilistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class UpiTtsService : Service() {

  data class Pending(
    val text: String,
    val postedAt: Long,
    val receivedElapsed: Long,
    val source: String,
    val amountPaise: Long = -1L,
    val sender: String? = null,
    val appName: String = "",
    val sourcePackage: String = "",
    val muted: Boolean = false
  )

  data class LastAnnouncement(
    val text: String,
    val latencyMs: Long,
    val atWallMs: Long,
    val source: String = "notification",
    val amountPaise: Long = -1L,
    val sender: String? = null,
    val appName: String = "",
    val sourcePackage: String = "",
    val muted: Boolean = false
  )

  companion object {
    private const val TAG = "UpiTts"
    const val CHANNEL_ID = "upi_announcements"
    const val NOTIF_ID = 1001
    const val ACTION_ANNOUNCE = "com.notifyloudly.upilistener.ANNOUNCE"
    private const val MAX_STATIC_PENDING = 20

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var ttsReady: Boolean = false
      private set

    @Volatile
    var lastAnnouncement: LastAnnouncement? = null
      private set

    @Volatile
    private var instance: UpiTtsService? = null

    private val staticPending = ArrayDeque<Pending>()
    private val utteranceMeta = ConcurrentHashMap<String, Pending>()

    fun ensureRunning(context: Context): Boolean {
      return try {
        val intent = Intent(context.applicationContext, UpiTtsService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.applicationContext.startForegroundService(intent)
        } else {
          context.applicationContext.startService(intent)
        }
        true
      } catch (e: Exception) {
        Log.w(TAG, "ensureRunning failed: ${e.message}")
        false
      }
    }

    fun stop(context: Context) {
      try {
        context.applicationContext.stopService(
          Intent(context.applicationContext, UpiTtsService::class.java)
        )
      } catch (e: Exception) {
        Log.w(TAG, "stop failed: ${e.message}")
      }
    }

    fun enqueue(
      context: Context,
      text: String,
      postedAt: Long,
      receivedElapsed: Long,
      source: String,
      amountPaise: Long = -1L,
      sender: String? = null,
      appName: String = "",
      sourcePackage: String = ""
    ): Boolean {
      val pending = Pending(text, postedAt, receivedElapsed, source, amountPaise, sender, appName, sourcePackage)
      if (source == "notification" && amountPaise > 0) {
        // Visual payment prompt alongside the spoken announcement. Runs
        // here (not in JS) so it fires even when the app was never opened,
        // e.g. right after boot. Test/self-test speech never shows it.
        try {
          PaymentAlertManager.showAlert(
            context,
            PaymentAlertManager.AlertData(
              amountPaise, sender, appName, sourcePackage, text, postedAt,
            ),
          )
        } catch (e: Exception) {
          Log.w(TAG, "payment alert failed: ${e.message}")
        }
      }
      val live = instance
      if (live != null) {
        live.postAnnouncement(pending)
        return true
      }
      synchronized(staticPending) {
        if (staticPending.size >= MAX_STATIC_PENDING) {
          staticPending.removeFirst()
        }
        staticPending.addLast(pending)
      }
      ensureRunning(context)
      return false
    }

    fun speakTest(context: Context, text: String): Boolean {
      return enqueue(context, text, System.currentTimeMillis(), SystemClock.elapsedRealtime(), "test")
    }

    fun getAvailableLocales(): List<String> {
      val live = instance
      val snapshot = live?.snapshotLocales()
      if (!snapshot.isNullOrEmpty()) return snapshot
      return listOf("en-IN")
    }

    fun runSelfTest(context: Context): Map<String, Any> {
      val parseStart = SystemClock.elapsedRealtime()
      val postedAt = System.currentTimeMillis()
      val decision = UpiAnnounceGate.decide(
        packageName = "com.google.android.apps.nbu.paisa.user",
        title = "Payment received",
        text = "Received \u20B91,250.50 from Rahul Sharma",
        bigText = "",
        subText = "",
        postedAt = postedAt,
        allowlisted = true
      )
      val parseMs = SystemClock.elapsedRealtime() - parseStart
      if (!decision.speak || decision.text == null) {
        return mapOf("spoken" to false, "reason" to decision.reason, "parseMs" to parseMs)
      }
      enqueue(
        context,
        decision.text,
        postedAt,
        SystemClock.elapsedRealtime(),
        "self-test",
        decision.amountPaise ?: -1L,
        decision.sender,
        decision.appName,
        decision.sourcePackage
      )
      return mapOf(
        "spoken" to true,
        "text" to decision.text,
        "reason" to decision.reason,
        "parseMs" to parseMs
      )
    }
  }

  private var tts: TextToSpeech? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var focusRequest: AudioFocusRequest? = null
  private var legacyFocusHeld = false

  override fun onCreate() {
    super.onCreate()
    UpiListenerStore.ensureSettingsLoaded(applicationContext)
    isRunning = true
    instance = this
    createChannel()
    startInForeground()
    initTts()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == PaymentAlertManager.ACTION_DISMISS_ALERT) {
      PaymentAlertManager.dismissAll(this)
      return START_STICKY
    }
    if (intent?.action == ACTION_ANNOUNCE) {
      val text = intent.getStringExtra("text")
      if (!text.isNullOrBlank()) {
        postAnnouncement(
          Pending(
            text = text,
            postedAt = intent.getLongExtra("postedAt", System.currentTimeMillis()),
            receivedElapsed = intent.getLongExtra("receivedElapsed", SystemClock.elapsedRealtime()),
            source = intent.getStringExtra("source") ?: "intent"
          )
        )
      }
    }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    abandonFocus()
    try {
      tts?.shutdown()
    } catch (e: Exception) {
      Log.w(TAG, "tts shutdown failed: ${e.message}")
    }
    tts = null
    ttsReady = false
    instance = null
    isRunning = false
    super.onDestroy()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Payment announcements", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  private fun serviceNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val iconId = if (applicationInfo.icon != 0) applicationInfo.icon
      else android.R.drawable.ic_lock_idle_alarm
    return builder
      .setContentTitle("Listening for UPI payments")
      .setContentText("Payment announcements are on")
      .setSmallIcon(iconId)
      .setOngoing(true)
      .build()
  }

  private fun startInForeground() {
    val notification = serviceNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIF_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  private fun initTts() {
    // Visible fallback if the TTS engine is missing/broken — Diagnostics
    // already surfaces isTtsReady; this log helps field triage.
    mainHandler.postDelayed({ if (!ttsReady) Log.w(TAG, "tts init timeout — engine missing or not ready") }, 4000)
    mainHandler.post {
      try {
        tts = TextToSpeech(applicationContext) { status ->
          if (status == TextToSpeech.SUCCESS) {
            onTtsReady()
          } else {
            Log.w(TAG, "tts init failed with status $status")
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "tts init threw: ${e.message}")
      }
    }
  }

  private fun parseLocaleTag(tag: String): Locale {
    val trimmed = tag.trim()
    if (trimmed.isEmpty()) return Locale("en", "IN")
    val parts = trimmed.split('-', '_')
    return when {
      parts.size >= 3 -> Locale(parts[0], parts[1], parts[2])
      parts.size == 2 -> Locale(parts[0], parts[1])
      else -> Locale(parts[0])
    }
  }

  private fun applyVoiceSettings(engine: TextToSpeech) {
    UpiListenerStore.ensureSettingsLoaded(applicationContext)
    val desired = parseLocaleTag(UpiListenerStore.localeTag)
    val candidates = listOf(desired, Locale("en", "IN"), Locale.ENGLISH, Locale.getDefault())
    var applied: Locale? = null
    for (locale in candidates) {
      try {
        val availability = engine.isLanguageAvailable(locale)
        if (availability != TextToSpeech.LANG_MISSING_DATA &&
          availability != TextToSpeech.LANG_NOT_SUPPORTED
        ) {
          engine.language = locale
          applied = locale
          break
        }
      } catch (e: Exception) {
        Log.w(TAG, "language check failed for $locale: ${e.message}")
      }
    }
    Log.i(TAG, "voice applied locale=$applied rate=${UpiListenerStore.speechRate}")
    engine.setSpeechRate(UpiListenerStore.speechRate)
    engine.setPitch(1.0f)
  }

  private fun onTtsReady() {
    val engine = tts ?: return
    applyVoiceSettings(engine)
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String) {
        val meta = utteranceMeta.remove(utteranceId) ?: return
        val latencyMs = SystemClock.elapsedRealtime() - meta.receivedElapsed
        lastAnnouncement = LastAnnouncement(
          meta.text, latencyMs, System.currentTimeMillis(), meta.source,
          meta.amountPaise, meta.sender, meta.appName, meta.sourcePackage, meta.muted
        )
        Log.i(TAG, "announcement started latencyMs=$latencyMs source=${meta.source} textLen=${meta.text.length}")
        UpiListenerBridge.emitAnnouncement(
          mapOf(
            "text" to meta.text,
            "latencyMs" to latencyMs,
            "postedAt" to meta.postedAt,
            "source" to meta.source,
            "amountPaise" to meta.amountPaise,
            "sender" to (meta.sender ?: ""),
            "appName" to meta.appName,
            "sourcePackage" to meta.sourcePackage,
            "muted" to meta.muted
          )
        )
        if (!UpiListenerStore.duckingEnabled) {
          abandonFocus()
        }
      }

      override fun onDone(utteranceId: String) {
        utteranceMeta.remove(utteranceId)
        abandonFocus()
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) {
        utteranceMeta.remove(utteranceId)
        Log.w(TAG, "announcement error utterance=$utteranceId")
        abandonFocus()
      }

      override fun onError(utteranceId: String, errorCode: Int) {
        utteranceMeta.remove(utteranceId)
        Log.w(TAG, "announcement error utterance=$utteranceId code=$errorCode")
        abandonFocus()
      }
    })
    ttsReady = true
    drainStaticPending()
  }

  private fun snapshotLocales(): List<String> {
    return try {
      val engine = tts ?: return listOf("en-IN")
      val tags = engine.voices?.map { it.locale.toLanguageTag() }?.distinct()?.sorted()
      if (tags.isNullOrEmpty()) listOf("en-IN") else tags
    } catch (e: Exception) {
      Log.w(TAG, "snapshotLocales failed: ${e.message}")
      listOf("en-IN")
    }
  }

  private fun drainStaticPending() {
    val drained = synchronized(staticPending) {
      val list = staticPending.toList()
      staticPending.clear()
      list
    }
    drained.forEach { postAnnouncement(it) }
  }

  private fun postAnnouncement(pending: Pending) {
    mainHandler.post { speakInternal(pending) }
  }

  private fun requestFocus(): Boolean {
    if (!UpiListenerStore.duckingEnabled) return true
    return try {
      val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return true
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attrs)
          .setOnAudioFocusChangeListener({})
          .build()
        focusRequest = request
        manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      } else {
        @Suppress("DEPRECATION")
        val granted = manager.requestAudioFocus(
          null,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        legacyFocusHeld = granted
        granted
      }
    } catch (e: Exception) {
      Log.w(TAG, "audio focus request failed: ${e.message}")
      true
    }
  }

  private fun abandonFocus() {
    try {
      val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        focusRequest = null
      } else if (legacyFocusHeld) {
        @Suppress("DEPRECATION")
        manager.abandonAudioFocus(null)
        legacyFocusHeld = false
      }
    } catch (e: Exception) {
      Log.w(TAG, "abandon focus failed: ${e.message}")
    }
  }

  private fun emitMutedAnnouncement(pending: Pending, effective: Pending) {
    val latencyMs = SystemClock.elapsedRealtime() - pending.receivedElapsed
    lastAnnouncement = LastAnnouncement(
      effective.text, latencyMs, System.currentTimeMillis(), pending.source,
      effective.amountPaise, effective.sender, effective.appName,
      effective.sourcePackage, true
    )
    Log.i(TAG, "announcement muted latencyMs=$latencyMs source=${pending.source} textLen=${pending.text.length}")
    UpiListenerBridge.emitAnnouncement(
      mapOf(
        "text" to effective.text,
        "latencyMs" to latencyMs,
        "postedAt" to effective.postedAt,
        "source" to effective.source,
        "amountPaise" to effective.amountPaise,
        "sender" to (effective.sender ?: ""),
        "appName" to effective.appName,
        "sourcePackage" to effective.sourcePackage,
        "muted" to true
      )
    )
  }

  private fun speakInternal(pending: Pending) {
    UpiListenerStore.ensureSettingsLoaded(applicationContext)
    val effective = pending.copy(muted = UpiListenerStore.muted)
    if (effective.muted) {
      emitMutedAnnouncement(pending, effective)
      return
    }
    val engine = tts
    if (engine == null || !ttsReady) {
      // Previously this announcement was dropped ("tts not ready, dropping"),
      // so the first real payment after a cold start / reboot stayed silent
      // while the later self-test spoke fine. Queue it instead — it drains in
      // onTtsReady() alongside the other static-pending items.
      Log.i(TAG, "tts not ready, queueing source=${pending.source}")
      synchronized(staticPending) {
        if (staticPending.size >= MAX_STATIC_PENDING) {
          staticPending.removeFirst()
        }
        staticPending.addLast(pending)
      }
      return
    }
    applyVoiceSettings(engine)
    requestFocus()
    val utteranceId = UUID.randomUUID().toString()
    utteranceMeta[utteranceId] = effective
    try {
      engine.speak(effective.text, TextToSpeech.QUEUE_ADD, null, utteranceId)
    } catch (e: Exception) {
      utteranceMeta.remove(utteranceId)
      Log.w(TAG, "speak failed: ${e.message}")
      abandonFocus()
    }
  }
}
