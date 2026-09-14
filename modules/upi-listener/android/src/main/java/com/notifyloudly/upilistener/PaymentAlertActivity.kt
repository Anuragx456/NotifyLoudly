package com.notifyloudly.upilistener

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Full-screen payment prompt, visible over other apps and on the lock
 * screen (manifest: showWhenLocked + turnScreenOn). Launched natively from
 * [PaymentAlertManager] when the device is locked, or from the heads-up
 * notification's full-screen intent.
 */
class PaymentAlertActivity : Activity() {

  companion object {
    const val EXTRA_AMOUNT = "extra_amount"
    const val EXTRA_SENDER = "extra_sender"
    const val EXTRA_APP = "extra_app"
    const val EXTRA_TEXT = "extra_text"
    const val EXTRA_POSTED_AT = "extra_posted_at"
    private const val AUTO_FINISH_MS = 30_000L
    private const val INK = 0xFF1A1A1A.toInt()
    private const val GREEN = 0xFF1B7A3D.toInt()
    private const val MUTED = 0xFF6B675E.toInt()
    private const val FAINT = 0xFF55524B.toInt()
    private const val LINE = 0xFFE4E1D8.toInt()

    @Volatile
    private var current: PaymentAlertActivity? = null

    fun finishCurrent() {
      try {
        current?.finish()
      } catch (_: Exception) {
      }
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val autoFinish = Runnable {
    try {
      finish()
    } catch (_: Exception) {
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = this
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    renderFromIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    // Second payment while the card is still open (singleInstance +
    // CLEAR_TOP): refresh in place instead of showing the stale first
    // payment until the 30s auto-finish.
    if (intent == null) return
    setIntent(intent)
    current = this
    renderFromIntent(intent)
  }

  private fun renderFromIntent(source: Intent) {
    val amount = source.getStringExtra(EXTRA_AMOUNT)?.ifBlank { null } ?: "—"
    val sender = source.getStringExtra(EXTRA_SENDER)?.ifBlank { null }
    val appName = source.getStringExtra(EXTRA_APP)?.ifBlank { null } ?: ""
    val speech = source.getStringExtra(EXTRA_TEXT)?.ifBlank { null } ?: ""
    val postedAt = source.getLongExtra(EXTRA_POSTED_AT, 0L)
    val age = if (postedAt > 0) {
      DateUtils.getRelativeTimeSpanString(postedAt, System.currentTimeMillis(), 0L).toString()
    } else {
      "just now"
    }

    setContentView(buildUi(amount, sender, appName, speech, age))
    handler.removeCallbacks(autoFinish)
    handler.postDelayed(autoFinish, AUTO_FINISH_MS)
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoFinish)
    if (current === this) current = null
    super.onDestroy()
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      resources.displayMetrics,
    ).toInt()
  }

  private fun text(
    value: String,
    sizeSp: Float,
    color: Int,
    bold: Boolean = false,
  ): TextView {
    return TextView(this).apply {
      text = value
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      setTextColor(color)
      if (bold) setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER
    }
  }

  private fun buildUi(
    amount: String,
    sender: String?,
    appName: String,
    speech: String,
    age: String,
  ): View {
    val page = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(0xFF141414.toInt())
      setPadding(dp(40), dp(48), dp(40), dp(48))
    }
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(0xFFFFFFFF.toInt())
        cornerRadius = dp(14).toFloat()
      }
      setPadding(dp(28), dp(24), dp(28), dp(24))
    }
    val strip = View(this).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(8),
      )
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(GREEN)
        cornerRadii = floatArrayOf(
          dp(14).toFloat(), dp(14).toFloat(),
          dp(14).toFloat(), dp(14).toFloat(),
          0f, 0f, 0f, 0f,
        )
      }
    }
    // Negative top margin pulls the strip onto the card's top edge.
    (strip.layoutParams as LinearLayout.LayoutParams).apply {
      topMargin = -dp(24)
      leftMargin = -dp(28)
      rightMargin = -dp(28)
    }
    card.addView(strip)
    card.addView(text("PAYMENT RECEIVED", 15f, GREEN, true))
    card.addView(text(amount, 44f, INK, true))
    if (!sender.isNullOrBlank()) card.addView(text("from $sender", 19f, INK))
    card.addView(text("$appName · $age".trim(' ', '·'), 15f, MUTED))
    card.addView(View(this).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(1),
      ).apply {
        topMargin = dp(16)
        bottomMargin = dp(16)
      }
      setBackgroundColor(LINE)
    })
    if (speech.isNotBlank()) {
      card.addView(text("“$speech”", 15f, FAINT))
    }

    val dismiss = Button(this).apply {
      text = "Dismiss"
      setTextColor(INK)
      textSize = 16f
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setStroke(dp(2), INK)
        cornerRadius = dp(6).toFloat()
        setColor(0xFFFFFFFF.toInt())
      }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(56),
      ).apply { topMargin = dp(24) }
      setOnClickListener { finish() }
    }
    card.addView(dismiss)
    val history = Button(this).apply {
      text = "View history"
      setTextColor(0xFFFFFFFF.toInt())
      textSize = 16f
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(INK)
        cornerRadius = dp(6).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(56),
      ).apply { topMargin = dp(12) }
      setOnClickListener {
        openHistory()
        finish()
      }
    }
    card.addView(history)
    page.addView(card)

    val scroll = ScrollView(this).apply {
      addView(page)
      setBackgroundColor(0xFF141414.toInt())
    }
    val footer = text("Announced aloud · NotifyLoudly", 15f, 0xFFBBBBBB.toInt())
    val outer = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(0xFF141414.toInt())
      addView(
        scroll,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          0,
          1f,
        ),
      )
      addView(footer.apply {
        setPadding(0, dp(16), 0, dp(8))
      })
    }
    return outer
  }

  private fun openHistory() {
    try {
      val deepLink = Intent(
        Intent.ACTION_VIEW,
        Uri.parse(PaymentAlertManager.HISTORY_DEEP_LINK),
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        setPackage(packageName)
      }
      startActivity(deepLink)
    } catch (_: Exception) {
      try {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) startActivity(launch)
      } catch (_: Exception) {
      }
    }
  }
}
