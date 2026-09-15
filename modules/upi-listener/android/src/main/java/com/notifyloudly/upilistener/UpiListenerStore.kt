package com.notifyloudly.upilistener

import android.content.Context

object UpiListenerStore {
  const val PREFS_NAME = "upi_listener_prefs"
  private const val KEY_ALLOWLIST = "allowlisted_packages"
  private const val KEY_SPEECH_RATE = "speech_rate"
  private const val KEY_LOCALE_TAG = "locale_tag"
  private const val KEY_DUCKING = "ducking"
  private const val KEY_MIN_AMOUNT_LEGACY = "min_amount_paise"
  private const val KEY_MUTED = "muted"
  private const val KEY_OVERLAY = "payment_overlay"
  private const val KEY_THEME = "theme_mode"
  private const val KEY_HEALTH_EVER_GRANTED = "health_ever_granted"
  private const val KEY_HEALTH_OUTAGE_SINCE = "health_outage_since"
  private const val KEY_HEALTH_NUDGE_FOR = "health_nudge_for"

  const val DEFAULT_LOCALE_TAG = "en-IN"
  const val DEFAULT_THEME = "system"

  @Volatile var speechRate: Float = 1.0f
  @Volatile var localeTag: String = DEFAULT_LOCALE_TAG
  @Volatile var duckingEnabled: Boolean = true
  @Volatile var muted: Boolean = false
  @Volatile var overlayEnabled: Boolean = true
  @Volatile var themeMode: String = DEFAULT_THEME

  @Volatile private var settingsLoaded: Boolean = false

  // Keep in sync with src/components/upiApps.ts (UPI_APPS, 23 entries).
  // This is the cold-install filter before detectedPackages fills in.
  val KNOWN_UPI_PACKAGES: Set<String> = setOf(
    "com.google.android.apps.nbu.paisa.user",
    "com.google.android.apps.nbu.paisa.merchant",
    "com.phonepe.app",
    "com.phonepe.app.business",
    "net.one97.paytm",
    "net.one97.paytm.merchant",
    "com.paytmbusiness",
    "in.org.npci.upiapp",
    "com.naviapp",
    "com.navi.services",
    "com.navi.upi",
    "com.dreamplug.androidapp",
    "in.amazon.mShop.android.shopping",
    "tech.superpay.app",
    "com.supermoney.app",
    "com.sbi.upi",
    "com.csam.icici.bank.imobile",
    "com.msf.kbank.mobile",
    "com.upi.axispay",
    "com.hdfcbank.payzapp",
    "com.canarabank.mobility",
    "com.bankofbaroda.upi",
    "com.bankofbaroda.mconnect"
  )

  val DEFAULT_PACKAGES: Set<String> = KNOWN_UPI_PACKAGES

  @Volatile
  var detectedPackages: Set<String> = emptySet()

  @Volatile
  private var memoryOverride: Set<String>? = null

  fun getAllowlist(context: Context): Set<String> {
    memoryOverride?.let { return it + KNOWN_UPI_PACKAGES + detectedPackages }
    val saved = context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getStringSet(KEY_ALLOWLIST, null)
    return if (saved.isNullOrEmpty()) KNOWN_UPI_PACKAGES + detectedPackages else saved + KNOWN_UPI_PACKAGES + detectedPackages
  }

  fun setAllowlist(context: Context, packages: Set<String>) {
    val merged = packages + KNOWN_UPI_PACKAGES
    memoryOverride = merged
    context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putStringSet(KEY_ALLOWLIST, merged)
      .apply()
  }

  fun isAllowlisted(context: Context, packageName: String): Boolean =
    KNOWN_UPI_PACKAGES.contains(packageName) ||
      detectedPackages.contains(packageName) ||
      getAllowlist(context).contains(packageName)

  @Synchronized
  fun ensureSettingsLoaded(context: Context) {
    if (settingsLoaded) return
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    speechRate = prefs.getFloat(KEY_SPEECH_RATE, 1.0f).coerceIn(0.5f, 2.0f)
    localeTag = prefs.getString(KEY_LOCALE_TAG, DEFAULT_LOCALE_TAG) ?: DEFAULT_LOCALE_TAG
    duckingEnabled = prefs.getBoolean(KEY_DUCKING, true)
    muted = prefs.getBoolean(KEY_MUTED, false)
    overlayEnabled = prefs.getBoolean(KEY_OVERLAY, true)
    themeMode = normalizeTheme(prefs.getString(KEY_THEME, DEFAULT_THEME) ?: DEFAULT_THEME)
    // Legacy cleanup: the retired minimum-amount option left this key behind
    // on older installs. Removal is idempotent — runs once per process.
    if (prefs.contains(KEY_MIN_AMOUNT_LEGACY)) {
      prefs.edit().remove(KEY_MIN_AMOUNT_LEGACY).apply()
    }
    settingsLoaded = true
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun setSpeechRate(context: Context, rate: Float) {
    speechRate = rate.coerceIn(0.5f, 2.0f)
    prefs(context).edit().putFloat(KEY_SPEECH_RATE, speechRate).apply()
  }

  fun setLocaleTag(context: Context, tag: String) {
    localeTag = tag.ifBlank { DEFAULT_LOCALE_TAG }
    prefs(context).edit().putString(KEY_LOCALE_TAG, localeTag).apply()
  }

  fun setDuckingEnabled(context: Context, enabled: Boolean) {
    duckingEnabled = enabled
    prefs(context).edit().putBoolean(KEY_DUCKING, enabled).apply()
  }

  fun setMuted(context: Context, value: Boolean) {
    muted = value
    prefs(context).edit().putBoolean(KEY_MUTED, value).apply()
  }

  fun setOverlayEnabled(context: Context, value: Boolean) {
    overlayEnabled = value
    prefs(context).edit().putBoolean(KEY_OVERLAY, value).apply()
  }

  fun normalizeTheme(raw: String): String =
    when (raw.lowercase()) {
      "light", "dark" -> raw.lowercase()
      else -> "system"
    }

  fun getThemeMode(context: Context): String {
    ensureSettingsLoaded(context)
    return themeMode
  }

  fun setThemeMode(context: Context, mode: String) {
    themeMode = normalizeTheme(mode)
    prefs(context).edit().putString(KEY_THEME, themeMode).apply()
  }

  // First-grant latch for the health job: never scheduled before the user
  // grants notification access, but kept scheduled afterwards even if an OEM
  // later revokes the grant — so the worker can keep reporting revoked.
  fun markHealthEverGranted(context: Context) {
    prefs(context).edit().putBoolean(KEY_HEALTH_EVER_GRANTED, true).apply()
  }

  fun isHealthEverGranted(context: Context): Boolean {
    return prefs(context).getBoolean(KEY_HEALTH_EVER_GRANTED, false)
  }

  // Phase 3 outage tracking: stamps the first down observation (wall-clock
  // ms, 0 = healthy) and which outage-start the nudge was already posted for,
  // so the nudge fires at most once per outage instead of every worker run.
  fun getHealthOutageSince(context: Context): Long {
    return prefs(context).getLong(KEY_HEALTH_OUTAGE_SINCE, 0L)
  }

  fun setHealthOutageSince(context: Context, sinceMs: Long) {
    prefs(context).edit().putLong(KEY_HEALTH_OUTAGE_SINCE, sinceMs).apply()
  }

  fun clearHealthOutage(context: Context) {
    prefs(context).edit().remove(KEY_HEALTH_OUTAGE_SINCE).remove(KEY_HEALTH_NUDGE_FOR).apply()
  }

  fun isHealthNudgePostedFor(context: Context, sinceMs: Long): Boolean {
    return prefs(context).getLong(KEY_HEALTH_NUDGE_FOR, -1L) == sinceMs
  }

  fun markHealthNudgePostedFor(context: Context, sinceMs: Long) {
    prefs(context).edit().putLong(KEY_HEALTH_NUDGE_FOR, sinceMs).apply()
  }
}
