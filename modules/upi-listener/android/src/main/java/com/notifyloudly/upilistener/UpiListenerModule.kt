package com.notifyloudly.upilistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class UpiListenerModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var notificationObserver: ((Map<String, Any>) -> Unit)? = null
  private var connectionObserver: ((Boolean) -> Unit)? = null
  private var announcementObserver: ((Map<String, Any>) -> Unit)? = null
  private var healthObserver: ((Map<String, Any>) -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("UpiListener")

    Events("onUpiNotification", "onListenerConnectionChanged", "onAnnouncement", "onListenerHealthChanged")

    Function("isNotificationAccessEnabled") {
      val context = appContext.reactContext ?: return@Function false
      NotificationManagerCompat
        .getEnabledListenerPackages(context)
        .contains(context.packageName)
    }

    Function("isListenerConnected") {
      UpiNotificationListenerService.isConnected
    }

    Function("getListenerHealth") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "status" to UpiListenerHealth.STATUS_DISCONNECTED,
        "accessGranted" to false,
        "connected" to false
      )
      UpiListenerHealth.toMap(UpiListenerHealth.check(context))
    }

    Function("checkListenerHealth") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "status" to UpiListenerHealth.STATUS_DISCONNECTED,
        "accessGranted" to false,
        "connected" to false
      )
      UpiListenerHealth.toMap(UpiListenerHealth.checkAndEmit(context))
    }

    Function("requestListenerRebind") {
      try {
        val context = appContext.reactContext ?: return@Function false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          return@Function try {
            val component = ComponentName(context, UpiNotificationListenerService::class.java)
            android.service.notification.NotificationListenerService.requestRebind(component)
            true
          } catch (_: Exception) {
            false
          }
        }
        // Pre-N has no rebind API — binding is automatic, treat as no-op success.
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("ensureHealthCheckScheduled") {
      try {
        val context = appContext.reactContext ?: return@Function false
        UpiHealthScheduler.ensureScheduled(context)
      } catch (_: Exception) {
        false
      }
    }

    Function("cancelHealthCheck") {
      try {
        val context = appContext.reactContext ?: return@Function false
        UpiHealthScheduler.cancel(context)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("openNotificationAccessSettings") {
      try {
        val context = appContext.reactContext ?: return@Function false
        try {
          val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          return@Function true
        } catch (_: Exception) {
          // Some OEM builds have no handler for the listener page — fall back
          // to general Settings so the tap still does something useful.
        }
        try {
          val fallback = Intent(Settings.ACTION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(fallback)
          true
        } catch (_: Exception) {
          false
        }
      } catch (_: Exception) {
        false
      }
    }

    Function("getAllowlistedPackages") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.getAllowlist(context).toList()
      } else {
        UpiListenerStore.DEFAULT_PACKAGES.toList()
      }
    }

    Function("setAllowlistedPackages") { packages: List<String> ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setAllowlist(context, packages.toSet())
      true
    }

    Function("getPendingNotifications") {
      UpiListenerBridge.drainPending()
    }

    Function("seedDedupKey") { key: String, seenAt: Long ->
      try {
        UpiAnnounceGate.seed(key, seenAt)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("getSpeechRate") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.ensureSettingsLoaded(context)
      }
      UpiListenerStore.speechRate.toDouble()
    }

    Function("setSpeechRate") { rate: Double ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setSpeechRate(context, rate.toFloat())
      true
    }

    Function("getLocaleTag") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.ensureSettingsLoaded(context)
      }
      UpiListenerStore.localeTag
    }

    Function("setLocaleTag") { tag: String ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setLocaleTag(context, tag)
      true
    }

    Function("getDuckingEnabled") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.ensureSettingsLoaded(context)
      }
      UpiListenerStore.duckingEnabled
    }

    Function("setDuckingEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setDuckingEnabled(context, enabled)
      true
    }

    Function("getMuted") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.ensureSettingsLoaded(context)
      }
      UpiListenerStore.muted
    }

    Function("setMuted") { muted: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setMuted(context, muted)
      true
    }

    Function("getOverlayEnabled") {
      val context = appContext.reactContext
      if (context != null) {
        UpiListenerStore.ensureSettingsLoaded(context)
      }
      UpiListenerStore.overlayEnabled
    }

    Function("setOverlayEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setOverlayEnabled(context, enabled)
      true
    }

    Function("isOverlayAccessGranted") {
      val context = appContext.reactContext ?: return@Function false
      try {
        Settings.canDrawOverlays(context)
      } catch (_: Exception) {
        false
      }
    }

    Function("openOverlayAccessSettings") {
      try {
        val context = appContext.reactContext ?: return@Function false
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}"),
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("areAlertNotificationsEnabled") {
      val context = appContext.reactContext ?: return@Function false
      try {
        NotificationManagerCompat.from(context).areNotificationsEnabled()
      } catch (_: Exception) {
        false
      }
    }

    Function("requestAlertNotifications") {
      try {
        val context = appContext.reactContext ?: return@Function false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
          return@Function NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
          return@Function true
        }
        // currentActivity can be null (JS thread, background work), so fall
        // back to opening the system channel/app notification settings.
        val activity = appContext.currentActivity
        if (activity != null) {
          try {
            androidx.core.app.ActivityCompat.requestPermissions(
              activity,
              arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
              1401,
            )
            return@Function true
          } catch (_: Exception) {
            // Fall through to settings screen fallback.
          }
        }
        try {
          val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
              putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
              data = Uri.parse("package:${context.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          context.startActivity(intent)
          return@Function true
        } catch (_: Exception) {
          return@Function false
        }
      } catch (_: Exception) {
        false
      }
    }

    Function("getAlertHealth") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "notificationsEnabled" to false,
        "channelImportance" to -1,
        "channelBlocked" to true,
      )
      try {
        val notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        var importance = -1
        var channelBlocked = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          try {
            val manager = context.getSystemService(android.app.NotificationManager::class.java)
            val channel = manager?.getNotificationChannel(PaymentAlertManager.ALERT_CHANNEL_ID)
            if (channel != null) {
              importance = channel.importance
              channelBlocked = importance == android.app.NotificationManager.IMPORTANCE_NONE
            }
          } catch (_: Exception) {
          }
        }
        mapOf(
          "notificationsEnabled" to notificationsEnabled,
          "channelImportance" to importance,
          "channelBlocked" to channelBlocked,
        )
      } catch (_: Exception) {
        mapOf(
          "notificationsEnabled" to false,
          "channelImportance" to -1,
          "channelBlocked" to true,
        )
      }
    }

    Function("showTestAlert") {
      val context = appContext.reactContext ?: return@Function false
      try {
        PaymentAlertManager.showTestAlert(context)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("dismissPaymentAlert") {
      val context = appContext.reactContext ?: return@Function false
      try {
        PaymentAlertManager.dismissAll(context)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("getAvailableLocales") {
      UpiTtsService.getAvailableLocales()
    }

    Function("getListenerHeartbeat") {
      mapOf(
        "connected" to UpiNotificationListenerService.isConnected,
        "lastCallbackAtMs" to UpiNotificationListenerService.lastCallbackAtMs,
        "nowMs" to System.currentTimeMillis()
      )
    }

    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      try {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
          ?: return@Function false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          power.isIgnoringBatteryOptimizations(context.packageName)
        } else {
          true
        }
      } catch (_: Exception) {
        false
      }
    }

    Function("openBatteryExemptionRequest") {
      try {
        val context = appContext.reactContext ?: return@Function false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          try {
            val intent = Intent(
              android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
              Uri.parse("package:${context.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(intent)
            return@Function true
          } catch (_: Exception) {
            // Fall through to the generic settings page.
          }
          try {
            val fallback = Intent(
              android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(fallback)
            return@Function true
          } catch (_: Exception) {
            return@Function false
          }
        }
        false
      } catch (_: Exception) {
        false
      }
    }

    Function("openAppDetailsSettings") {
      try {
        val context = appContext.reactContext ?: return@Function false
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("getThemeMode") {
      val context = appContext.reactContext
      if (context != null) UpiListenerStore.getThemeMode(context) else UpiListenerStore.DEFAULT_THEME
    }

    Function("setThemeMode") { mode: String ->
      val context = appContext.reactContext ?: return@Function false
      UpiListenerStore.setThemeMode(context, mode)
      true
    }

    Function("detectInstalledUpiApps") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      val pm = context.packageManager
      val detected = mutableMapOf<String, Map<String, Any>>()

      fun addApp(pkg: String, name: String) {
        if (pkg == context.packageName) return
        val isMerchant = pkg.contains("merchant") || pkg.contains("business")
        detected[pkg] = mapOf(
          "packageName" to pkg,
          "appName" to name,
          "isMerchant" to isMerchant
        )
      }

      // Check method 1: Batch inspect installed packages (fast, single call)
      try {
        val installedList = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(0))
        } else {
          @Suppress("DEPRECATION")
          pm.getInstalledPackages(0)
        }
        for (pkgInfo in installedList) {
          val pkg = pkgInfo.packageName ?: continue
          if (pkg == context.packageName) continue
          val defaultName = UpiAnnounceGate.APP_NAMES[pkg]
          if (defaultName != null) {
            val label = try {
              pkgInfo.applicationInfo?.loadLabel(pm)?.toString()?.ifBlank { null }
            } catch (_: Exception) { null } ?: defaultName
            addApp(pkg, label)
          }
        }
      } catch (e: Exception) {
        android.util.Log.w("UpiListener", "getInstalledPackages failed: ${e.message}")
      }

      // Check method 2: Direct package check for any known UPI packages not yet detected
      for ((pkg, defaultName) in UpiAnnounceGate.APP_NAMES) {
        if (detected.containsKey(pkg) || pkg == context.packageName) continue
        var isInstalled = false
        var label: String? = null

        // Check 2a: getPackageInfo
        try {
          val pInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
          } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(pkg, 0)
          }
          if (pInfo != null) {
            isInstalled = true
            label = try {
              pInfo.applicationInfo?.loadLabel(pm)?.toString()?.ifBlank { null }
            } catch (_: Exception) { null }
          }
        } catch (_: Exception) {
        }

        // Check 2b: getApplicationInfo
        if (!isInstalled) {
          try {
            val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              pm.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0))
            } else {
              @Suppress("DEPRECATION")
              pm.getApplicationInfo(pkg, 0)
            }
            isInstalled = true
            label = try {
              pm.getApplicationLabel(appInfo).toString().ifBlank { null }
            } catch (_: Exception) { null }
          } catch (_: Exception) {
          }
        }

        // Check 2c: getLaunchIntentForPackage
        if (!isInstalled) {
          try {
            if (pm.getLaunchIntentForPackage(pkg) != null) {
              isInstalled = true
            }
          } catch (_: Exception) {
          }
        }

        if (isInstalled) {
          addApp(pkg, label ?: defaultName)
        }
      }

      // Check method 3: Query Intent activities for upi://pay and upi://
      val testUris = listOf(
        Uri.parse("upi://pay"),
        Uri.parse("upi://pay?pa=merchant@upi"),
        Uri.parse("upi://")
      )
      for (uri in testUris) {
        try {
          val upiIntent = Intent(Intent.ACTION_VIEW, uri)
          val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(upiIntent, PackageManager.ResolveInfoFlags.of(0))
          } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(upiIntent, 0)
          }
          for (info in resolved) {
            val pkg = info.activityInfo?.packageName ?: continue
            if (pkg == context.packageName || detected.containsKey(pkg)) continue
            val label = try {
              info.loadLabel(pm)?.toString()?.ifBlank { null }
            } catch (_: Exception) { null } ?: UpiAnnounceGate.APP_NAMES[pkg] ?: pkg
            addApp(pkg, label)
          }
        } catch (_: Exception) {
        }
      }

      // Register detected packages with UpiListenerStore so they are automatically allowlisted
      UpiListenerStore.detectedPackages = detected.keys.toSet()

      android.util.Log.i("UpiListener", "detectInstalledUpiApps count=${detected.size} pkgs=${detected.keys}")
      detected.values.toList()
    }

    Function("openOemAutostartSettings") {
      try {
        val context = appContext.reactContext ?: return@Function false
        val candidates = listOf(
          ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
          ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity"),
          ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
          ComponentName("com.vivo.abe", "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity"),
          ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
          ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
          ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
          ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
          ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
          ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
          ComponentName("com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity")
        )
        for (component in candidates) {
          try {
            val intent = Intent().apply {
              setComponent(component)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return@Function true
          } catch (_: Exception) {
            continue
          }
        }
        try {
          val fallback = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(fallback)
          return@Function true
        } catch (_: Exception) {
          return@Function false
        }
      } catch (_: Exception) {
        false
      }
    }

    Function("startTtsService") {
      val context = appContext.reactContext ?: return@Function false
      UpiTtsService.ensureRunning(context)
    }

    Function("stopTtsService") {
      val context = appContext.reactContext ?: return@Function false
      UpiTtsService.stop(context)
      true
    }

    Function("isTtsServiceRunning") {
      UpiTtsService.isRunning
    }

    Function("isTtsReady") {
      UpiTtsService.ttsReady
    }

    Function("speakTest") { text: String ->
      val context = appContext.reactContext ?: return@Function false
      if (text.isBlank()) return@Function false
      UpiTtsService.speakTest(context, text.take(200))
    }

    Function("runPipelineSelfTest") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "spoken" to false,
        "reason" to "no-context",
        "parseMs" to 0L
      )
      UpiTtsService.runSelfTest(context)
    }

    Function("getLastAnnouncement") {
      val last = UpiTtsService.lastAnnouncement ?: return@Function null
      mapOf(
        "text" to last.text,
        "latencyMs" to last.latencyMs,
        "atWallMs" to last.atWallMs,
        "source" to last.source,
        "amountPaise" to last.amountPaise,
        "sender" to (last.sender ?: ""),
        "appName" to last.appName,
        "sourcePackage" to last.sourcePackage,
        "muted" to last.muted
      )
    }

    OnStartObserving("onUpiNotification") {
      val weakModule = WeakReference(this@UpiListenerModule)
      val observer: (Map<String, Any>) -> Unit = { payload ->
        val body = payload.toBundle()
        mainHandler.post {
          weakModule.get()?.sendEvent("onUpiNotification", body)
        }
      }
      notificationObserver = observer
      UpiListenerBridge.addNotificationObserver(observer)
    }

    OnStopObserving("onUpiNotification") {
      notificationObserver?.let { UpiListenerBridge.removeNotificationObserver(it) }
      notificationObserver = null
    }

    OnStartObserving("onAnnouncement") {
      val weakModule = WeakReference(this@UpiListenerModule)
      val observer: (Map<String, Any>) -> Unit = { payload ->
        val body = Bundle().apply {
          putString("text", payload["text"] as? String ?: "")
          putLong("latencyMs", payload["latencyMs"] as? Long ?: -1L)
          putLong("postedAt", payload["postedAt"] as? Long ?: 0L)
          putString("source", payload["source"] as? String ?: "")
          putLong("amountPaise", payload["amountPaise"] as? Long ?: -1L)
          putString("sender", payload["sender"] as? String ?: "")
          putString("appName", payload["appName"] as? String ?: "")
          putString("sourcePackage", payload["sourcePackage"] as? String ?: "")
          putBoolean("muted", payload["muted"] as? Boolean ?: false)
        }
        mainHandler.post {
          weakModule.get()?.sendEvent("onAnnouncement", body)
        }
      }
      announcementObserver = observer
      UpiListenerBridge.addAnnouncementObserver(observer)
    }

    OnStopObserving("onAnnouncement") {
      announcementObserver?.let { UpiListenerBridge.removeAnnouncementObserver(it) }
      announcementObserver = null
    }

    OnStartObserving("onListenerConnectionChanged") {
      val weakModule = WeakReference(this@UpiListenerModule)
      val observer: (Boolean) -> Unit = { connected ->
        val body = Bundle().apply { putBoolean("connected", connected) }
        mainHandler.post {
          weakModule.get()?.sendEvent("onListenerConnectionChanged", body)
        }
      }
      connectionObserver = observer
      UpiListenerBridge.addConnectionObserver(observer)
    }

    OnStopObserving("onListenerConnectionChanged") {
      connectionObserver?.let { UpiListenerBridge.removeConnectionObserver(it) }
      connectionObserver = null
    }

    OnStartObserving("onListenerHealthChanged") {
      val weakModule = WeakReference(this@UpiListenerModule)
      val observer: (Map<String, Any>) -> Unit = { payload ->
        val body = Bundle().apply {
          putString("status", payload["status"] as? String ?: "")
          putBoolean("accessGranted", payload["accessGranted"] as? Boolean ?: false)
          putBoolean("connected", payload["connected"] as? Boolean ?: false)
        }
        mainHandler.post {
          weakModule.get()?.sendEvent("onListenerHealthChanged", body)
        }
      }
      healthObserver = observer
      UpiListenerBridge.addHealthObserver(observer)
    }

    OnStopObserving("onListenerHealthChanged") {
      healthObserver?.let { UpiListenerBridge.removeHealthObserver(it) }
      healthObserver = null
    }
  }

  private fun Map<String, Any>.toBundle(): Bundle = Bundle().apply {
    putString("packageName", this@toBundle["packageName"] as? String ?: "")
    putString("title", this@toBundle["title"] as? String ?: "")
    putString("text", this@toBundle["text"] as? String ?: "")
    putString("bigText", this@toBundle["bigText"] as? String ?: "")
    putString("subText", this@toBundle["subText"] as? String ?: "")
    putString("tickerText", this@toBundle["tickerText"] as? String ?: "")
    putLong("postedAt", this@toBundle["postedAt"] as? Long ?: 0L)
    putInt("notificationId", this@toBundle["notificationId"] as? Int ?: 0)
    putString("key", this@toBundle["key"] as? String ?: "")
  }
}
