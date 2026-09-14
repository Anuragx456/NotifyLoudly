package com.notifyloudly.upilistener

import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Visual payment prompt shown alongside the spoken announcement.
 *
 * Routing (decided natively so it works when JS is not running):
 * - Device locked: NO visual at all — vibrate only; TTS audio continues from
 *   [UpiTtsService]. No heads-up, no full-screen card, no shade entry.
 * - Device unlocked: high-priority heads-up notification (never gated by
 *   overlay toggle) with View/Dismiss.
 * - Device unlocked + toggle on + overlay access granted: floating banner.
 * - Device unlocked without overlay access (or toggle off): notification only.
 *
 * There is deliberately no full-screen intent and no lock-screen activity:
 * USE_FULL_SCREEN_INTENT is not declared, so there is no Play-review surface
 * for it. postHeadsUp() is unlocked-only; lingering unlocked notifications are
 * hidden from the lockscreen via VISIBILITY_SECRET.
 */
object PaymentAlertManager {
  private const val TAG = "UpiAlert"
  const val ALERT_CHANNEL_ID = "payment_alerts"
  const val ALERT_NOTIF_ID = 1002
  const val ACTION_DISMISS_ALERT = "com.notifyloudly.upilistener.DISMISS_ALERT"
  const val HISTORY_DEEP_LINK = "notifyloudly://history"
  private const val OVERLAY_SECONDS = 12
  private const val GREEN = 0xFF1B7A3D.toInt()
  private const val INK = 0xFF1A1A1A.toInt()
  private const val MUTED = 0xFF6B675E.toInt()

  data class AlertData(
    val amountPaise: Long,
    val sender: String?,
    val appName: String,
    val sourcePackage: String,
    val speechText: String,
    val postedAt: Long,
  )

  @Volatile
  private var overlayView: View? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var overlayTick: Runnable? = null

  fun formatINR(paise: Long): String {
    val rupees = paise / 100
    val remainder = (paise % 100).toInt()
    val digits = rupees.toString()
    val tail = if (digits.length > 3) digits.takeLast(3) else digits
    var head = if (digits.length > 3) digits.dropLast(3) else ""
    val parts = mutableListOf<String>()
    while (head.length > 2) {
      parts.add(0, head.takeLast(2))
      head = head.dropLast(2)
    }
    if (head.isNotEmpty()) parts.add(0, head)
    parts.add(tail)
    return "₹${parts.joinToString(",")}.${remainder.toString().padStart(2, '0')}"
  }

  fun showAlert(context: Context, data: AlertData) {
    val app = context.applicationContext
    try {
      UpiListenerStore.ensureSettingsLoaded(app)
    } catch (_: Exception) {
    }
    // Locked = silent audio only. No heads-up, no full-screen card, no shade
    // entry — vibrate only; TTS audio continues independently in UpiTtsService.
    if (isLocked(app)) {
      try {
        vibrateBriefly(app)
      } catch (e: Exception) {
        Log.w(TAG, "haptic failed: ${e.message}")
      }
      Log.i(TAG, "locked — visual suppressed, TTS continues")
      return
    }
    // Heads-up is the always-on unlocked fallback — never gated by
    // overlayEnabled so a merchant who disables the banner still sees a
    // notification + hears TTS.
    try {
      postHeadsUp(app, data)
    } catch (e: Exception) {
      Log.w(TAG, "heads-up failed: ${e.message}")
    }
    try {
      vibrateBriefly(app)
    } catch (e: Exception) {
      Log.w(TAG, "haptic failed: ${e.message}")
    }
    if (!UpiListenerStore.overlayEnabled) return
    try {
      if (Settings.canDrawOverlays(app)) {
        showOverlayBanner(app, data)
      }
    } catch (e: Exception) {
      Log.w(TAG, "visual alert failed: ${e.message}")
    }
  }

  fun showTestAlert(context: Context) {
    showAlert(
      context,
      AlertData(
        amountPaise = 125050L,
        sender = "Rahul Sharma",
        appName = "Google Pay",
        sourcePackage = "com.google.android.apps.nbu.paisa.user",
        speechText = "Received 1250 rupees and 50 paise from Rahul Sharma",
        postedAt = System.currentTimeMillis(),
      ),
    )
  }

  fun dismissAll(context: Context) {
    val app = context.applicationContext
    try {
      removeOverlay(app)
    } catch (_: Exception) {
    }
    try {
      NotificationManagerCompat.from(app).cancel(ALERT_NOTIF_ID)
    } catch (_: Exception) {
    }
  }

  fun isLocked(context: Context): Boolean {
    return try {
      val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      if (keyguard?.isKeyguardLocked == true) return true
      val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      power != null && !power.isInteractive
    } catch (_: Exception) {
      false
    }
  }

  private fun vibrateBriefly(app: Context) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vm = app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        val vibrator = vm?.defaultVibrator
        vibrator?.vibrate(VibrationEffect.createOneShot(180L, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        val vibrator = app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          vibrator?.vibrate(VibrationEffect.createOneShot(180L, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
          @Suppress("DEPRECATION")
          vibrator?.vibrate(180L)
        }
      }
    } catch (_: Exception) {
    }
  }

  private fun statusBarHeightPx(app: Context): Int {
    return try {
      val resId = app.resources.getIdentifier("status_bar_height", "dimen", "android")
      if (resId > 0) app.resources.getDimensionPixelSize(resId) else 0
    } catch (_: Exception) {
      0
    }
  }

  private fun historyIntent(app: Context): Intent {
    return try {
      Intent(Intent.ACTION_VIEW, Uri.parse(HISTORY_DEEP_LINK)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        setPackage(app.packageName)
      }
    } catch (_: Exception) {
      app.packageManager.getLaunchIntentForPackage(app.packageName)
        ?: Intent(Intent.ACTION_MAIN).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    }
  }

  private fun immutableFlags(base: Int): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      base or PendingIntent.FLAG_IMMUTABLE
    } else {
      base
    }
  }

  private fun ensureChannel(app: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = app.getSystemService(NotificationManager::class.java) ?: return
    // Channels persist across updates: an install that created this channel
    // at lower importance or with lockscreen visibility would silently pin
    // every later heads-up to the old level. Recreate to enforce HIGH +
    // SECRET (unlocked-only; never shown on the lockscreen).
    val existing = manager.getNotificationChannel(ALERT_CHANNEL_ID)
    if (existing != null &&
      (existing.importance < NotificationManager.IMPORTANCE_HIGH ||
        existing.lockscreenVisibility != android.app.Notification.VISIBILITY_SECRET)
    ) {
      try {
        manager.deleteNotificationChannel(ALERT_CHANNEL_ID)
      } catch (_: Exception) {
      }
    }
    if (manager.getNotificationChannel(ALERT_CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          ALERT_CHANNEL_ID,
          "Payment pop-ups",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "Heads-up card for each announced UPI payment"
          enableVibration(true)
          lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
        },
      )
    }
  }

  private fun paymentSalt(data: AlertData): Int {
    // Distinct PendingIntent request codes per payment so a second payment
    // re-triggers heads-up instead of silently updating the first
    // notification (fixed codes + FLAG_UPDATE_CURRENT coalesced).
    var h = (data.postedAt xor data.amountPaise).toInt()
    h = h * 31 + (data.sender?.hashCode() ?: 0)
    h = h * 31 + data.speechText.hashCode()
    return (h and 0x0FFFFFFF) % 900_000
  }

  private fun postHeadsUp(app: Context, data: AlertData) {
    if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) {
      Log.i(TAG, "notifications disabled — heads-up skipped")
      return
    }
    ensureChannel(app)
    val amount = formatINR(data.amountPaise)
    val senderBit = if (data.sender.isNullOrBlank()) "" else " from ${data.sender}"
    val salt = paymentSalt(data)

    val viewPending = PendingIntent.getActivity(
      app,
      3_000_000 + salt,
      historyIntent(app),
      immutableFlags(PendingIntent.FLAG_UPDATE_CURRENT),
    )
    val dismissPending = PendingIntent.getService(
      app,
      4_000_000 + salt,
      Intent(app, UpiTtsService::class.java).apply { action = ACTION_DISMISS_ALERT },
      immutableFlags(PendingIntent.FLAG_UPDATE_CURRENT),
    )
    val notification = NotificationCompat.Builder(app, ALERT_CHANNEL_ID)
      .setSmallIcon(if (app.applicationInfo.icon != 0) app.applicationInfo.icon else android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("$amount received$senderBit")
      .setContentText("${data.appName} · Tap to view · spoken aloud")
      .setStyle(NotificationCompat.BigTextStyle().bigText("“${data.speechText}”"))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .setAutoCancel(true)
      .setTimeoutAfter(25_000L)
      .setColor(GREEN)
      .setContentIntent(viewPending)
      .addAction(0, "View", viewPending)
      .addAction(0, "Dismiss", dismissPending)
      .build()
    // Cancel-then-notify so a rapid second payment re-fires heads-up instead
    // of an in-place update the system may not surface. Single visible card
    // is preserved: the old one is gone before the new one posts.
    val notifs = NotificationManagerCompat.from(app)
    try {
      notifs.cancel(ALERT_NOTIF_ID)
    } catch (_: Exception) {
    }
    notifs.notify(ALERT_NOTIF_ID, notification)
    Log.i(TAG, "heads-up posted salt=$salt amount=$amount")
  }

  private fun dp(view: View, value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      view.resources.displayMetrics,
    ).toInt()
  }

  private fun rounded(fill: Int, radiusDp: Float, view: View): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(fill)
      cornerRadius = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        radiusDp,
        view.resources.displayMetrics,
      )
    }
  }

  private fun label(
    parent: LinearLayout,
    text: String,
    sizeSp: Float,
    color: Int,
    bold: Boolean,
  ): TextView {
    return TextView(parent.context).apply {
      this.text = text
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      setTextColor(color)
      if (bold) setTypeface(typeface, Typeface.BOLD)
      parent.addView(this)
    }
  }

  private fun showOverlayBanner(app: Context, data: AlertData) {
    mainHandler.post {
      try {
        removeOverlay(app)
        val wm = app.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return@post
        val root = LinearLayout(app).apply { orientation = LinearLayout.VERTICAL }
        val pad = dp(root, 12)

        val card = LinearLayout(app).apply {
          orientation = LinearLayout.HORIZONTAL
          background = rounded(0xFFFFFFFF.toInt(), 20f, root)
          setPadding(0, dp(root, 16), dp(root, 18), dp(root, 16))
          elevation = dp(root, 8).toFloat()
        }
        val strip = View(app).apply {
          layoutParams = LinearLayout.LayoutParams(dp(root, 7), LinearLayout.LayoutParams.MATCH_PARENT)
          background = rounded(GREEN, 4f, root)
        }
        card.addView(strip)
        val body = LinearLayout(app).apply {
          orientation = LinearLayout.VERTICAL
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).apply { leftMargin = dp(root, 14) }
        }
        card.addView(body)

        val header = LinearLayout(app).apply { orientation = LinearLayout.HORIZONTAL }
        val dot = View(app).apply {
          layoutParams = LinearLayout.LayoutParams(dp(root, 12), dp(root, 12)).apply {
            gravity = Gravity.CENTER_VERTICAL
            rightMargin = dp(root, 8)
          }
          background = rounded(GREEN, 6f, root)
        }
        header.addView(dot)
        header.addView(TextView(app).apply {
          text = "NotifyLoudly · now"
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          setTextColor(GREEN)
          setTypeface(typeface, Typeface.BOLD)
        })
        body.addView(header)

        label(body, "${formatINR(data.amountPaise)} received", 30f, INK, true)
        val senderBit = if (data.sender.isNullOrBlank()) "" else "From ${data.sender} · "
        label(body, "$senderBit${data.appName}", 16f, INK, false)
        label(body, "Tap to open history", 13f, MUTED, false)

        val countdown = TextView(app).apply {
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          setTextColor(MUTED)
          gravity = Gravity.END
        }
        body.addView(countdown)
        val bar = ProgressBar(app, null, android.R.attr.progressBarStyleHorizontal).apply {
          max = OVERLAY_SECONDS
          progress = OVERLAY_SECONDS
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(root, 10),
          )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          bar.progressTintList = android.content.res.ColorStateList.valueOf(GREEN)
        }
        body.addView(bar)

        root.addView(card)
        val topPad = dp(root, 8) + statusBarHeightPx(app)
        root.setPadding(pad, topPad, pad, 0)
        root.keepScreenOn = true
        root.setOnClickListener {
          try {
            app.startActivity(historyIntent(app))
          } catch (_: Exception) {
          }
          dismissAll(app)
        }

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
          PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP }
        wm.addView(root, params)
        overlayView = root

        var remaining = OVERLAY_SECONDS
        val tick = object : Runnable {
          override fun run() {
            if (overlayView !== root) return
            if (remaining <= 0) {
              dismissAll(app)
              return
            }
            countdown.text = "closes in ${remaining}s"
            bar.progress = remaining
            remaining -= 1
            mainHandler.postDelayed(this, 1000L)
          }
        }
        overlayTick?.let { mainHandler.removeCallbacks(it) }
        overlayTick = tick
        mainHandler.post(tick)
      } catch (e: Exception) {
        Log.w(TAG, "overlay banner failed: ${e.message}")
      }
    }
  }

  private fun removeOverlay(app: Context) {
    overlayTick?.let { mainHandler.removeCallbacks(it) }
    overlayTick = null
    val view = overlayView ?: return
    overlayView = null
    try {
      (app.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(view)
    } catch (_: Exception) {
    }
  }
}
