import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  areAlertNotificationsEnabled,
  detectInstalledUpiApps,
  isIgnoringBatteryOptimizations,
  isNativeModuleAvailable,
  isOverlayAccessGranted,
  openAppDetailsSettings,
  openBatteryExemptionRequest,
  openOemAutostartSettings,
  openOverlayAccessSettings,
  requestAlertNotifications,
  setDuckingEnabled,
  setLocaleTag,
  setMuted,
  setOverlayEnabled,
  setSpeechRate,
  showTestAlert,
  speakTest,
  type InstalledUpiApp,
} from "upi-listener";
import { clearAllPayments } from "@/db/payments";
import { FONTS, RADIUS, TYPE } from "@/components/theme";
import { useAppTheme } from "@/components/ThemeProvider";
import { StatusPill } from "@/components/StatusPill";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clampSpeechRate,
  getTestSpeechText,
  loadSettings,
  type AnnouncerSettings,
} from "@/store/settings";
import type { ThemeChoice } from "@/store/themeStore";
import { ensureDisclosureOrRedirect } from "@/store/disclosureGate";

function ToggleRow({
  label,
  hint,
  value,
  onToggle,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onToggle: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.line }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.ink }]}>{label}</Text>
        {hint && <Text style={[styles.rowHint, { color: theme.muted }]}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.lineStrong, true: theme.green }}
        thumbColor={"#FFFFFF"}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const SAVE_FAILED =
  "Could not save — run the local dev build (`bun run android`), not Expo Go.";

const MONITORED_UPI_APPS: InstalledUpiApp[] = [
  { packageName: "com.phonepe.app", appName: "PhonePe", isMerchant: false },
  { packageName: "net.one97.paytm", appName: "Paytm", isMerchant: false },
  { packageName: "com.naviapp", appName: "Navi", isMerchant: false },
  { packageName: "com.google.android.apps.nbu.paisa.user", appName: "Google Pay", isMerchant: false },
  { packageName: "in.org.npci.upiapp", appName: "BHIM", isMerchant: false },
  { packageName: "com.bankofbaroda.mconnect", appName: "bob World", isMerchant: false },
  { packageName: "com.phonepe.app.business", appName: "PhonePe Business", isMerchant: true },
  { packageName: "net.one97.paytm.merchant", appName: "Paytm Business", isMerchant: true },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AnnouncerSettings>(() => loadSettings());
  const [notice, setNotice] = useState<string | null>(null);
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [notifAllowed, setNotifAllowed] = useState(false);
  const [batteryExempt, setBatteryExempt] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledUpiApp[]>([]);
  const [rescanning, setRescanning] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refreshGrants = useCallback(() => {
    let ov = false;
    try {
      ov = isOverlayAccessGranted();
      setOverlayGranted(ov);
    } catch {
      setOverlayGranted(false);
    }
    let nt = false;
    try {
      nt = areAlertNotificationsEnabled();
      setNotifAllowed(nt);
    } catch {
      setNotifAllowed(false);
    }
    let bt = false;
    try {
      bt = isIgnoringBatteryOptimizations();
      setBatteryExempt(bt);
    } catch {
      setBatteryExempt(false);
    }
    return { overlayGranted: ov, notifAllowed: nt, batteryExempt: bt };
  }, []);

  const refreshInstalledApps = useCallback(() => {
    try {
      const apps = detectInstalledUpiApps();
      if (apps && apps.length > 0) {
        setInstalledApps(apps);
        return apps;
      }
    } catch {
      // native scan fallback
    }
    setInstalledApps([]);
    return [];
  }, []);

  const onRecheck = useCallback(() => {
    const { overlayGranted: ov, notifAllowed: nt, batteryExempt: bt } = refreshGrants();
    refreshInstalledApps();
    if (!isNativeModuleAvailable()) {
      setNotice(
        "Running in Expo Go — native checks always read “Not allowed”. Rebuild with `bun run android` for real values.",
      );
      return;
    }
    const missing: string[] = [];
    if (!bt) missing.push("Play sound when phone is locked (Ready)");
    if (!ov) missing.push("Show pop-up over other apps");
    if (!nt) missing.push("Notifications");
    if (missing.length === 0) {
      setNotice("All permissions and background access granted.");
    } else {
      setNotice(`Still missing: ${missing.join(" · ")}. Tap the action buttons above.`);
    }
  }, [refreshGrants, refreshInstalledApps]);

  const reload = useCallback(() => {
    setSettings(loadSettings());
    refreshGrants();
    refreshInstalledApps();
  }, [refreshGrants, refreshInstalledApps]);

  // Before fix: `useFocusEffect(reload)` passed the `reload` callback
  // directly. `useFocusEffect` takes (effect) where effect is `() => void|(()=>void)`,
  // not the bare callback — the canonical form is `useFocusEffect(useCallback(() => { reload(); }, [reload]))`.
  // A bare `reload` also returns undefined, which expo-router's dev check flags as
  // "effect must not return anything besides a function", and because the identity
  // changes on every state update without inner memoization it could stop refiring.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Returning from the overlay/notifications system settings doesn't always fire a focus event
  // (activity is backgrounded, not blurred), so also re-query on AppState "active".
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  const update = useCallback((patch: Partial<AnnouncerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const revert = useCallback(() => {
    setSettings(loadSettings());
  }, []);

  const onRateStep = useCallback(
    (delta: number) => {
      const next = clampSpeechRate(settings.speechRate + delta);
      try {
        if (!setSpeechRate(next)) {
          setNotice(SAVE_FAILED);
          revert();
          return;
        }
        update({ speechRate: next });
      } catch {
        setNotice(SAVE_FAILED);
        revert();
      }
    },
    [settings.speechRate, update, revert],
  );

  const onLocaleSelect = useCallback(
    (tag: string) => {
      try {
        if (!setLocaleTag(tag)) {
          setNotice(SAVE_FAILED);
          revert();
          return;
        }
        update({ localeTag: tag });
      } catch {
        setNotice(SAVE_FAILED);
        revert();
      }
    },
    [update, revert],
  );

  const onDuckingToggle = useCallback(() => {
    try {
      const next = !settings.duckingEnabled;
      if (!setDuckingEnabled(next)) {
        setNotice(SAVE_FAILED);
        revert();
        return;
      }
      update({ duckingEnabled: next });
    } catch {
      setNotice(SAVE_FAILED);
      revert();
    }
  }, [settings.duckingEnabled, update, revert]);

  const onMutedToggle = useCallback(() => {
    try {
      const next = !settings.muted;
      if (!setMuted(next)) {
        setNotice(SAVE_FAILED);
        revert();
        return;
      }
      update({ muted: next });
    } catch {
      setNotice(SAVE_FAILED);
      revert();
    }
  }, [settings.muted, update, revert]);

  const onGrantBattery = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!openBatteryExemptionRequest()) {
        setNotice("Could not open battery prompt directly. Tap 'App info & power settings' below.");
      }
      refreshGrants();
    } catch {
      setNotice("Battery request unavailable on this build.");
    }
  }, [refreshGrants, router]);

  const onOpenOem = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!openOemAutostartSettings()) {
        setNotice("Could not open brand autostart settings. Open 'App info & power settings' below.");
      }
    } catch {
      setNotice("OEM settings unavailable on this build.");
    }
  }, [router]);

  const onOpenAppDetails = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!openAppDetailsSettings()) {
        setNotice("Could not open app settings.");
      }
    } catch {
      setNotice("App settings unavailable on this build.");
    }
  }, [router]);

  const onRescanApps = useCallback(() => {
    setRescanning(true);
    try {
      const apps = refreshInstalledApps();
      if (apps.length > 0) {
        setNotice(
          `Scanned device: ${apps.length} UPI app${apps.length === 1 ? "" : "s"} detected (${apps.map((a) => a.appName).join(", ")}).`,
        );
      } else {
        setNotice(
          "NotifyLoudly is listening for incoming payments from all installed UPI apps (PhonePe, Paytm, Navi, GPay, etc.).",
        );
      }
    } finally {
      setTimeout(() => setRescanning(false), 350);
    }
  }, [refreshInstalledApps]);

  const onTestVoice = useCallback(() => {
    try {
      if (!speakTest(getTestSpeechText(settings.localeTag))) {
        setNotice("Voice test unavailable — use the local dev build (`bun run android`).");
      }
    } catch {
      setNotice("Voice test unavailable on this build.");
    }
  }, [settings.localeTag]);

  const onOverlayToggle = useCallback(() => {
    try {
      const next = !settings.overlayEnabled;
      if (!setOverlayEnabled(next)) {
        setNotice(SAVE_FAILED);
        revert();
        return;
      }
      update({ overlayEnabled: next });
    } catch {
      setNotice(SAVE_FAILED);
      revert();
    }
  }, [settings.overlayEnabled, update, revert]);

  const onGrantOverlay = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    try {
      if (!openOverlayAccessSettings()) {
        setNotice("Could not open the overlay page — allow “Display over other apps” manually in system settings.");
        return;
      }
      setNotice("Allow “Display over other apps”, then come back here.");
    } catch {
      setNotice("Overlay settings unavailable on this build.");
    }
  }, [router]);

  const onGrantNotif = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    try {
      if (!requestAlertNotifications()) {
        setNotice("If no prompt appeared, allow notifications for NotifyLoudly in system settings.");
      }
      refreshGrants();
    } catch {
      setNotice("Notification request unavailable on this build.");
    }
  }, [refreshGrants, router]);

  const onPreviewAlert = useCallback(() => {
    setNotice(null);
    try {
      if (!showTestAlert()) {
        setNotice("Pop-up preview unavailable — use the local dev build (`bun run android`).");
      }
    } catch {
      setNotice("Pop-up preview unavailable on this build.");
    }
  }, []);

  const onRequestClearHistory = useCallback(() => {
    setConfirmingClear(true);
  }, []);

  const onCancelClearHistory = useCallback(() => {
    setConfirmingClear(false);
  }, []);

  const onConfirmClearHistory = useCallback(async () => {
    setClearing(true);
    setNotice(null);
    try {
      await clearAllPayments();
      setNotice("History cleared.");
    } catch {
      setNotice("Could not clear history.");
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }, []);

  const insets = useSafeAreaInsets();
  const { theme, themeMode, setThemeMode } = useAppTheme();
  const speechPresets = [
    { label: "Slower", value: 0.85 },
    { label: "Normal", value: 1.0 },
    { label: "Faster", value: 1.15 },
  ];

  const appearanceOptions: { mode: ThemeChoice; label: string; icon: string }[] = [
    { mode: "light", label: "Light", icon: "sunny" },
    { mode: "dark", label: "Dark", icon: "moon" },
    { mode: "system", label: "System", icon: "phone-portrait" },
  ];

  const health = (() => {
    const missing: { label: string; action: () => void }[] = [];
    if (!batteryExempt) missing.push({ label: "Play sound when locked", action: onGrantBattery });
    if (!overlayGranted) missing.push({ label: "Pop-up over other apps", action: onGrantOverlay });
    if (!notifAllowed) missing.push({ label: "Notifications", action: onGrantNotif });
    const ok = missing.length === 0;
    return { ok, missing };
  })();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.paper }]} contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 16), paddingBottom: Math.max(32, insets.bottom + 16) }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Settings</Text>
      <Text style={[styles.subtitle, { color: theme.faint }]}>Saved immediately. No save button to forget.</Text>

      {/* Phase 1: Health summary */}
      <View
        style={[
          styles.healthCard,
          { borderColor: health.ok ? theme.green : theme.red, backgroundColor: health.ok ? theme.successBg : theme.errorBg },
        ]}
        accessibilityRole="summary"
      >
        <View style={styles.healthRow}>
          <Text style={[styles.healthTitle, { color: health.ok ? theme.green : theme.red }]}>
            {health.ok ? "All set — payments will be spoken aloud." : `${health.missing.length} fix needed`}
          </Text>
          <StatusPill label={health.ok ? "Ready" : `${health.missing.length} to do`} tone={health.ok ? "good" : "bad"} />
        </View>
        {health.ok ? (
          <Text style={[styles.healthHint, { color: theme.faint }]}>
            Permissions and background access are all granted. You can test the voice below or recheck anytime.
          </Text>
        ) : (
          <Text style={[styles.healthHint, { color: theme.faint }]}>
            {health.missing.map((m) => m.label).join(" · ")} — tap Fix to open system settings for the first one.
          </Text>
        )}
        <View style={styles.healthActions}>
          {health.ok ? (
            <Pressable style={styles.healthLink} onPress={onRecheck} accessibilityRole="button">
              <Text style={styles.healthLinkLabel}>Recheck</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.healthPrimary}
              onPress={health.missing[0]?.action}
              accessibilityRole="button"
              accessibilityLabel={`Fix ${health.missing[0]?.label}`}
            >
              <Text style={styles.healthPrimaryLabel}>Fix: {health.missing[0]?.label}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {!isNativeModuleAvailable() && (
        <Text style={[styles.warning, { color: theme.red }]}>
          Native module missing — changes cannot save in Expo Go. Use `bun run android`.
        </Text>
      )}

      {/* Appearance — own card, own section header */}
      <Text style={[styles.section, { color: theme.muted }]}>Appearance</Text>
      <View style={[styles.appearanceCard, { borderColor: theme.line, backgroundColor: theme.card }]}>
        <View style={styles.appearanceHeader}>
          <View style={styles.appearanceHeadText}>
            <Text style={[styles.appearanceTitle, { color: theme.ink }]}>Theme</Text>
            <Text style={[styles.appearanceHint, { color: theme.muted }]}>
              {themeMode === "system" ? "Follows your phone" : themeMode === "dark" ? "Dark — easy on the eyes at night" : "Light — clear on the counter"}
            </Text>
          </View>
          <View style={[styles.appearancePreview, { borderColor: theme.line, backgroundColor: theme.paper }]}>
            <View style={[styles.appearancePreviewBar, { backgroundColor: theme.ink }]} />
            <View style={[styles.appearancePreviewLine, { backgroundColor: theme.line }]} />
            <View style={[styles.appearancePreviewLineShort, { backgroundColor: theme.line }]} />
          </View>
        </View>
        <View style={[styles.appearanceSegment, { borderColor: theme.line, backgroundColor: theme.paper }]}>
          {appearanceOptions.map((opt) => {
            const active = themeMode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                onPress={() => setThemeMode(opt.mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${opt.label} theme`}
                style={[
                  styles.appearanceOption,
                  active && { backgroundColor: theme.ink, borderColor: theme.ink },
                  !active && { borderColor: "transparent" },
                ]}
              >
                <Ionicons
                  name={opt.icon as never}
                  size={16}
                  color={active ? theme.paper : theme.muted}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.appearanceOptionLabel,
                    { color: active ? theme.paper : theme.ink },
                    active && styles.appearanceOptionLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.section, { color: theme.muted }]}>Speech</Text>
      <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
        <View style={styles.presetRow}>
          {speechPresets.map((p) => {
            const active = Math.abs(settings.speechRate - p.value) < 0.07;
            return (
              <Pressable
                key={p.label}
                style={[styles.presetChip, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.ink : theme.paper }]}
                onPress={() => {
                  const next = clampSpeechRate(p.value);
                  try { if (!setSpeechRate(next)) { setNotice(SAVE_FAILED); revert(); return; } update({ speechRate: next }); } catch { setNotice(SAVE_FAILED); revert(); }
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.presetLabel, { color: active ? theme.paper : theme.ink }]}>{p.label}</Text>
                <Text style={[styles.presetSub, { color: active ? theme.paper : theme.muted }]}>{p.value.toFixed(2)}×</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.rowHint, { color: theme.muted, marginBottom: 8 }]}>Tap to set speed — try Hear test voice below.</Text>
        <Text style={[styles.subhead, { color: theme.muted }]}>Language</Text>
        <View style={styles.chips}>
          {[
            { tag: "en-IN", label: "English", sub: "en-IN" },
            { tag: "hi-IN", label: "हिन्दी", sub: "hi-IN" },
          ].map(({ tag, label, sub }) => {
            const active = tag === settings.localeTag;
            return (
              <Pressable
                key={tag}
                style={[styles.chip, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.ink : theme.card }]}
                onPress={() => onLocaleSelect(tag)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipLabel, { color: active ? theme.paper : theme.ink }]}>{label}</Text>
                <Text style={[styles.chipSub, { color: active ? theme.paper : theme.muted }]}>{sub}</Text>
              </Pressable>
            );
          })}
        </View>
        <ToggleRow
          label="Lower other audio while speaking"
          hint="Duck music and videos so the amount cuts through"
          value={settings.duckingEnabled}
          onToggle={onDuckingToggle}
        />
        <ToggleRow
          label="Mute speaker"
          hint="Keep listening and logging, but stay silent"
          value={settings.muted}
          onToggle={onMutedToggle}
        />
        <Pressable style={[styles.secondary, { borderColor: theme.ink }]} onPress={onTestVoice} accessibilityRole="button">
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Hear test voice</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: theme.muted }]}>Permissions & Background Access</Text>
      <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Play sound when phone is locked</Text>
            <Text style={[styles.rowHint, { color: theme.muted }]}>
              {batteryExempt
                ? "Ready — Android won't stop announcements when screen is off"
                : "Needs fix — Android may silence payments when phone is locked. Tap Fix above."}
            </Text>
          </View>
          <StatusPill label={batteryExempt ? "Ready" : "Needs fix"} tone={batteryExempt ? "good" : "bad"} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Show pop-up over other apps</Text>
            <Text style={[styles.rowHint, { color: theme.muted }]}>
              {overlayGranted
                ? "Allowed — payment pop-up can float above open apps"
                : "Not allowed — pop-up banner cannot float"}
            </Text>
          </View>
          <StatusPill label={overlayGranted ? "Allowed" : "Not allowed"} tone={overlayGranted ? "good" : "bad"} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Notifications</Text>
            <Text style={[styles.rowHint, { color: theme.muted }]}>
              {notifAllowed
                ? "Allowed — heads-up alert will appear on lock screen"
                : "Not allowed — heads-up alert cannot appear"}
            </Text>
          </View>
          <StatusPill label={notifAllowed ? "Allowed" : "Not allowed"} tone={notifAllowed ? "good" : "bad"} />
        </View>

        {/* Per-row primary only when that permission is missing */}
        {!batteryExempt && (
          <Pressable style={[styles.primary, { backgroundColor: theme.ink }]} onPress={onGrantBattery} accessibilityRole="button">
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Allow unrestricted background</Text>
          </Pressable>
        )}
        {!overlayGranted && (
          <Pressable style={[styles.primary, { backgroundColor: theme.ink }]} onPress={onGrantOverlay} accessibilityRole="button">
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Allow display over apps</Text>
          </Pressable>
        )}
        {!notifAllowed && (
          <Pressable style={[styles.primary, { backgroundColor: theme.ink }]} onPress={onGrantNotif} accessibilityRole="button">
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Allow notifications</Text>
          </Pressable>
        )}
        {/* Tertiary help — not full buttons */}
        <View style={[styles.helpLinks, { borderTopColor: theme.line }]}>
          <Pressable onPress={onOpenOem} accessibilityRole="button">
            <Text style={[styles.helpLink, { color: theme.ink }]}>Brand autostart (Xiaomi / Oppo / Vivo / Samsung)</Text>
          </Pressable>
          <Pressable onPress={onOpenAppDetails} accessibilityRole="button">
            <Text style={[styles.helpLink, { color: theme.ink }]}>App info & battery settings</Text>
          </Pressable>
          <Link href="/reliability" asChild>
            <Pressable accessibilityRole="button">
              <Text style={[styles.helpLink, { color: theme.ink }]}>Open stay-alive guide →</Text>
            </Pressable>
          </Link>
          <Pressable onPress={onRecheck} accessibilityRole="button">
            <Text style={[styles.helpLinkMuted, { color: theme.muted }]}>Recheck all permissions</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.section, { color: theme.muted }]}>Payment pop-up</Text>
      <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
        <ToggleRow
          label="Show payment pop-up"
          hint="Banner over any open app + full card on lock screen. Heads-up alert always shows even when this is off."
          value={settings.overlayEnabled}
          onToggle={onOverlayToggle}
        />
        <Pressable style={[styles.secondary, { borderColor: theme.ink }]} onPress={onPreviewAlert} accessibilityRole="button">
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Preview pop-up</Text>
        </Pressable>
      </View>

      {(() => {
        const displayedApps = installedApps.length > 0 ? installedApps : MONITORED_UPI_APPS;
        const isDeviceDetected = installedApps.length > 0;
        return (
          <>
            <Text style={[styles.section, { color: theme.muted }]}>
              Detected UPI apps ({displayedApps.length}{!isDeviceDetected ? " active" : ""})
            </Text>
            <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
              <Text style={[styles.detectedBanner, { color: theme.faint }]}>
                Listening to {displayedApps.length} app{displayedApps.length === 1 ? "" : "s"} on this phone.
              </Text>
              {displayedApps.map((app) => (
                <View key={app.packageName} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: theme.ink }]}>
                      {app.appName}
                      {app.isMerchant ? <Text style={styles.merchantBadge}> · Merchant</Text> : null}
                    </Text>
                  </View>
                  <StatusPill label="Active" tone="good" />
                </View>
              ))}
              <Pressable onPress={onRescanApps} disabled={rescanning} accessibilityRole="button" style={styles.linkAction}>
                <Text style={[styles.helpLink, { color: theme.ink }, rescanning && styles.disabled]}>
                  {rescanning ? "Scanning…" : "Rescan installed apps"}
                </Text>
              </Pressable>
            </View>
          </>
        );
      })()}

      <Text style={[styles.section, { color: theme.muted, marginTop: 32 }]}>Data</Text>
      <View style={[styles.card, styles.dangerCard, { borderColor: theme.dangerBorder, backgroundColor: theme.dangerBg }]}>
        <View style={[styles.row, styles.rowNoBorder]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Clear history</Text>
            <Text style={[styles.rowHint, { color: theme.muted }]}>Permanently delete all announced payments</Text>
          </View>
        </View>
        {!confirmingClear ? (
          <Pressable
            onPress={onRequestClearHistory}
            disabled={clearing}
            accessibilityRole="button"
            accessibilityLabel="Clear history"
            style={styles.dangerLink}
          >
            <Text style={[styles.dangerLabel, styles.dangerLinkLabel, clearing && styles.disabled]}>
              {clearing ? "Clearing…" : "Clear history"}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.confirmBox, { borderColor: theme.red, backgroundColor: theme.errorBg }]}>
            <Text style={[styles.confirmTitle, { color: theme.ink }]}>Clear all history?</Text>
            <Text style={[styles.confirmBody, { color: theme.faint }]}>
              This will permanently delete all announced payments. This cannot be undone.
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.confirmCancel, clearing && styles.disabled]}
                onPress={onCancelClearHistory}
                disabled={clearing}
                accessibilityRole="button"
                accessibilityLabel="Cancel clear history"
              >
                <Text style={styles.confirmCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmDanger, clearing && styles.disabled]}
                onPress={onConfirmClearHistory}
                disabled={clearing}
                accessibilityRole="button"
                accessibilityLabel="Confirm clear history"
              >
                <Text style={styles.confirmDangerLabel}>{clearing ? "Clearing…" : "Clear"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Text style={[styles.rowHint, { color: theme.muted }]}>You’ll be asked to confirm before anything is deleted.</Text>
      </View>

      {notice && <Text style={[styles.notice, { color: theme.muted }]}>{notice}</Text>}

      <Pressable
        onPress={() => Linking.openURL("https://github.com/anuragx456/")}
        accessibilityRole="link"
        accessibilityLabel="Open Anurag's GitHub profile"
        style={styles.credit}
      >
        <Text style={[styles.creditText, { color: theme.muted }]}>Made with ❤️ by Anurag</Text>
      </Pressable>

      <StatusBar style={theme.statusBar} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    marginTop: 8,
    ...TYPE.headlineLarge,
  },
  subtitle: {
    marginTop: 4,
    ...TYPE.bodyMedium,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
    ...TYPE.labelSmall,
    textTransform: "uppercase",
  },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  appearanceCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  appearanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  appearanceHeadText: {
    flex: 1,
  },
  appearanceTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
  },
  appearanceHint: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  appearancePreview: {
    width: 64,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    gap: 6,
    justifyContent: "center",
  },
  appearancePreviewBar: {
    height: 8,
    borderRadius: 4,
    width: "70%",
  },
  appearancePreviewLine: {
    height: 4,
    borderRadius: 2,
  },
  appearancePreviewLineShort: {
    height: 4,
    borderRadius: 2,
    width: "62%",
  },
  appearanceSegment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  appearanceOption: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
  },
  appearanceOptionLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: "700",
  },
  appearanceOptionLabelActive: {
    fontFamily: FONTS.extraBold,
    fontWeight: "800",
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowNoBorder: {
    borderBottomWidth: 0,
  },
  dangerCard: {
    borderWidth: 1,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    ...TYPE.titleMedium,
  },
  rowHint: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  subhead: {
    marginTop: 16,
    ...TYPE.titleMedium,
  },
  toggle: {
    minWidth: 64,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1A1A18", // fallback — overridden by theme at call site
    borderRadius: RADIUS.sm,
  },
  toggleOn: {
    backgroundColor: "#1A1A18", // fallback — overridden by theme
  },
  toggleLabel: {
    fontFamily: FONTS.extraBold,
    fontSize: 14,
    fontWeight: "800",
    color: "#1A1A18", // fallback
  },
  toggleLabelOn: {
    color: "#F7F5F0", // fallback
  },
  stepper: {
    flexDirection: "row",
    gap: 8,
  },
  step: {
    width: 52,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.sm,
  },
  stepLabel: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A18", // fallback
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  presetChip: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 6,
  },
  presetLabel: {
    fontFamily: FONTS.extraBold,
    fontSize: 14,
    fontWeight: "800",
  },
  presetSub: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.pill,
  },
  chipLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  chipSub: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    textAlign: "center",
  },
  secondary: {
    marginTop: 12,
    marginBottom: 8,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.sm,
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
  },
  warning: {
    marginTop: 8,
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "700",
  },
  notice: {
    marginTop: 12,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  danger: {
    marginTop: 12,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#B3261E", // fallback
    borderRadius: RADIUS.sm,
    backgroundColor: "#F7F5F0", // fallback
  },
  dangerLabel: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
    color: "#B3261E", // fallback
  },
  dangerLink: {
    marginTop: 4,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  dangerLinkLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
    color: "#B3261E", // fallback
    textDecorationLine: "underline",
  },
  disabled: {
    opacity: 0.4,
  },
  confirmBox: {
    marginTop: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#B3261E", // fallback
    borderRadius: RADIUS.md,
    backgroundColor: "#FFF9F9", // fallback
    gap: 12,
  },
  confirmTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 16,
    fontWeight: "800",
  },
  confirmBody: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  confirmRow: {
    flexDirection: "row",
    gap: 12,
  },
  confirmCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1A1A18", // fallback — overridden by theme at call site
    borderRadius: RADIUS.sm,
    backgroundColor: "#F7F5F0", // fallback
  },
  confirmCancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A18", // fallback
  },
  confirmDanger: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B3261E", // fallback
    borderRadius: RADIUS.sm,
  },
  confirmDangerLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  primary: {
    marginTop: 12,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  primaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
  },
  detectedBanner: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 8,
  },
  merchantBadge: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    fontWeight: "700",
  },
  linkAction: {
    marginTop: 8,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  helpLinks: {
    marginTop: 12,
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  helpLink: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  helpLinkMuted: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#6B675E", // fallback
    marginVertical: 12,
  },
  healthCard: {
    marginTop: 16,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  healthTitle: {
    flex: 1,
    fontFamily: FONTS.extraBold,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  healthHint: {
    marginTop: 6,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  healthActions: {
    marginTop: 10,
    flexDirection: "row",
  },
  healthLink: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1A1A18", // fallback — overridden by theme at call site
    borderRadius: RADIUS.sm,
    backgroundColor: "#FFFFFF", // fallback
  },
  healthLinkLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A18", // fallback
  },
  healthPrimary: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A18", // fallback — overridden by theme
    borderRadius: RADIUS.sm,
  },
  healthPrimaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "700",
    color: "#F7F5F0", // fallback
  },
  credit: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  creditText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
