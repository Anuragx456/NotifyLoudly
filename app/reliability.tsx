import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  areAlertNotificationsEnabled,
  isNativeModuleAvailable,
  isOverlayAccessGranted,
  isIgnoringBatteryOptimizations,
  openBatteryExemptionRequest,
  openOemAutostartSettings,
  openOverlayAccessSettings,
  requestAlertNotifications,
} from "upi-listener";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";
import { StatusPill } from "@/components/StatusPill";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OEM_GUIDES } from "@/components/oemGuide";
import { ensureDisclosureOrRedirect } from "@/store/disclosureGate";

export default function ReliabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [exempt, setExempt] = useState<boolean | null>(null);
  const [overlayGranted, setOverlayGranted] = useState<boolean | null>(null);
  const [notifAllowed, setNotifAllowed] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setExempt(isIgnoringBatteryOptimizations());
    } catch {
      setExempt(null);
    }
    try {
      setOverlayGranted(isOverlayAccessGranted());
    } catch {
      setOverlayGranted(null);
    }
    try {
      setNotifAllowed(areAlertNotificationsEnabled());
    } catch {
      setNotifAllowed(null);
    }
  }, []);

  useFocusEffect(refresh);

  // Same reason as onboarding: returning from system Settings backgrounds
  // the app without blurring the route, so re-check on foreground too.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(refresh, 2000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const onRequestExemption = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      const opened = openBatteryExemptionRequest();
      if (!opened) setNotice("Could not open battery settings on this build.");
    } catch {
      setNotice("Battery request unavailable on this build.");
    }
  }, [router]);

  const onOpenOem = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      const opened = openOemAutostartSettings();
      if (!opened) setNotice("No matching system page found — follow the steps below manually.");
    } catch {
      setNotice("Autostart page unavailable on this build.");
    }
  }, [router]);

  const onGrantOverlay = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!openOverlayAccessSettings()) {
        setNotice("Could not open overlay settings — allow “Display over other apps” manually.");
        return;
      }
      setNotice("Allow “Display over other apps”, then come back here.");
    } catch {
      setNotice("Overlay settings unavailable on this build.");
    }
  }, [router]);

  const onGrantNotif = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!requestAlertNotifications()) {
        setNotice("If no prompt appeared, allow notifications for NotifyLoudly in system settings.");
      }
      refresh();
      // Runtime permission dialogs don't background the app — poll once
      // after the user answers so the pill flips without a tap.
      setTimeout(refresh, 1000);
    } catch {
      setNotice("Notification request unavailable on this build.");
    }
  }, [refresh, router]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.paper }]} contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 16), paddingBottom: Math.max(32, insets.bottom + 16) }]}>
      <Link href="/" style={StyleSheet.flatten([styles.back, { color: theme.muted }])}>
        ‹ Home
      </Link>
      <Text style={[styles.title, { color: theme.ink }]}>Stay alive</Text>
      <Text style={[styles.subtitle, { color: theme.faint }]}>
        Android kills background apps. These four steps keep announcements working after
        reboots and overnight.
      </Text>

      {!isNativeModuleAvailable() && (
        <Text style={[styles.warning, { color: theme.red }]}>
          Native module missing — status below is unavailable. Use a local dev build
          (`bun run android`), not Expo Go.
        </Text>
      )}

      <Text style={[styles.section, { color: theme.muted }]}>1 · Battery exemption</Text>
      <View style={styles.pillRow}>
        <StatusPill
          label={exempt === null ? "Unknown" : exempt ? "Exempt" : "Not exempt"}
          tone={exempt === true ? "good" : exempt === null ? "neutral" : "bad"}
        />
      </View>
      <Text style={[styles.body, { color: theme.ink }]}>
        Exemption stops Doze mode from pausing the speech service overnight.
      </Text>
      <Pressable style={[styles.primary, { backgroundColor: theme.ink }]} onPress={onRequestExemption} accessibilityRole="button">
        <Text style={[styles.primaryLabel, { color: theme.paper }]}>Request battery exemption</Text>
      </Pressable>

      <Text style={[styles.section, { color: theme.muted }]}>2 · Autostart + Recents lock on your brand</Text>
      <Text style={[styles.body, { color: theme.ink }]}>
        Xiaomi, Oppo, Vivo and Samsung add their own app killers on top of Android. Allow
        NotifyLoudly to start itself, then lock it in Recents — without the lock, swiping
        the app away kills the listener outright and nothing announces until you reopen.
      </Text>
      <Pressable style={[styles.secondary, { borderColor: theme.ink }]} onPress={onOpenOem} accessibilityRole="button">
        <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Try opening autostart settings</Text>
      </Pressable>
      {OEM_GUIDES.map((guide) => (
        <View key={guide.brand} style={[styles.guide, { borderTopColor: theme.ink }]}>
          <Text style={[styles.guideBrand, { color: theme.muted }]}>{guide.brand}</Text>
          <Text style={[styles.guideTitle, { color: theme.ink }]}>{guide.title}</Text>
          {guide.steps.map((step, index) => (
            <Text key={index} style={[styles.step, { color: theme.ink }]}>
              {index + 1}. {step}
            </Text>
          ))}
        </View>
      ))}

      <Text style={[styles.section, { color: theme.muted }]}>3 · Payment pop-up (always-on heads-up + overlay)</Text>
      <View style={styles.pillRow}>
        <StatusPill
          label={notifAllowed === null ? "Unknown" : notifAllowed ? "Allowed" : "Not allowed — Notifications"}
          tone={notifAllowed === true ? "good" : notifAllowed === null ? "neutral" : "bad"}
        />
      </View>
      <Text style={[styles.body, { color: theme.ink }]}>
        The heads-up alert is the always-on fallback — it shows even when the banner is off or overlay access is denied.
        If this reads Not allowed, announce still happens but the visual falls back to history only.
      </Text>
      {!notifAllowed && (
        <Pressable style={[styles.secondary, { borderColor: theme.ink }]} onPress={onGrantNotif} accessibilityRole="button">
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Allow notifications</Text>
        </Pressable>
      )}
      <View style={[styles.pillRow, { marginTop: 16 }]}>
        <StatusPill
          label={
            overlayGranted === null
              ? "Unknown — Display over other apps"
              : overlayGranted
                ? "Allowed — Display over other apps"
                : "Not allowed — Display over other apps"
          }
          tone={overlayGranted === true ? "good" : overlayGranted === null ? "neutral" : "bad"}
        />
      </View>
      <Text style={[styles.body, { color: theme.ink }]}>
        When allowed, the banner floats above any open app. When not allowed, heads-up + speech still fire. Toggle the banner itself in Settings → Payment pop-up.
      </Text>
      {!overlayGranted && (
        <Pressable style={styles.secondary} onPress={onGrantOverlay} accessibilityRole="button">
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Allow display over apps</Text>
        </Pressable>
      )}

      <Text style={[styles.section, { color: theme.muted }]}>4 · After a reboot</Text>
      <Text style={[styles.body, { color: theme.ink }]}>
        NotifyLoudly re-starts its speech service and re-binds the notification listener
        automatically when the phone boots or the app updates. Open the app once after a
        reboot and check Diagnostics: listener should read Bound within a minute.
      </Text>
      <Link href="/diagnostics" asChild>
        <Pressable style={styles.secondary} accessibilityRole="button">
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Open diagnostics</Text>
        </Pressable>
      </Link>

      {notice && <Text style={[styles.notice, { color: theme.faint }]}>{notice}</Text>}
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
  },
  back: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    marginTop: 8,
    fontFamily: FONTS.extraBold,
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  warning: {
    marginTop: 12,
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "700",
  },
  section: {
    marginTop: 28,
    marginBottom: 8,
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  pillRow: {
    marginTop: 8,
  },
  body: {
    marginTop: 8,
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  primary: {
    marginTop: 16,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  primaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    fontWeight: "700",
  },
  secondary: {
    marginTop: 12,
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
  guide: {
    marginTop: 16,
    borderTopWidth: 2,
    paddingTop: 8,
  },
  guideBrand: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  guideTitle: {
    marginTop: 4,
    fontFamily: FONTS.extraBold,
    fontSize: 17,
    fontWeight: "800",
  },
  step: {
    marginTop: 6,
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  notice: {
    marginTop: 12,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
});
