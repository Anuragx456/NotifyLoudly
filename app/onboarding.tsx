import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import {
  addListenerConnectionListener,
  addListenerHealthListener,
  areAlertNotificationsEnabled,
  ensureHealthCheckScheduled,
  isListenerConnected,
  isNativeModuleAvailable,
  isNotificationAccessEnabled,
  openNotificationAccessSettings,
  requestAlertNotifications,
  requestListenerRebind,
} from "upi-listener";
import { Ionicons } from "@expo/vector-icons";
import { setOnboardingCompleted } from "@/store/onboarding";
import { ensureDisclosureOrRedirect } from "@/store/disclosureGate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const [granted, setGranted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notifAllowed, setNotifAllowed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rebindAsked, setRebindAsked] = useState(false);
  const [rebindFailed, setRebindFailed] = useState(false);
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const recheck = useCallback(() => {
    try {
      setGranted(isNotificationAccessEnabled());
    } catch {
      setGranted(false);
    }
    try {
      setConnected(isListenerConnected());
    } catch {
      setConnected(false);
    }
    try {
      setNotifAllowed(areAlertNotificationsEnabled());
    } catch {
      setNotifAllowed(false);
    }
  }, []);

  useFocusEffect(recheck);

  // Opening system Settings backgrounds the app without blurring the route,
  // so focus alone does not refire when the user comes back — re-check on
  // every foreground transition too. The listener service can also take a few
  // seconds to bind after the toggle, so re-probe briefly after each check
  // while the grant is on but the service is still unbound.
  useEffect(() => {
    recheck();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") recheck();
    });
    // Bound-state flips only when the listener service binds/unbinds, which
    // happens outside this screen — subscribe so the status tracks it live.
    // The tri-state health subscription covers the revoke case too: rebinds
    // are a no-op when the grant is gone, so access-revoked must surface as
    // "turn it back on", not "waiting to bind".
    const connSub = (() => {
      try {
        return addListenerConnectionListener((event) => {
          setConnected(event.connected);
        });
      } catch {
        return null;
      }
    })();
    const healthSub = (() => {
      try {
        return addListenerHealthListener((event) => {
          setGranted(event.accessGranted);
          setConnected(event.connected);
        });
      } catch {
        return null;
      }
    })();
    return () => {
      appSub.remove();
      try {
        connSub?.remove();
      } catch {
        // Tear-down is best effort.
      }
      try {
        healthSub?.remove();
      } catch {
        // Tear-down is best effort.
      }
    };
  }, [recheck]);

  // Keep probing while access is on but the service hasn't bound yet —
  // Android often needs a few seconds (or a nudge) after the toggle flips.
  // After a grace window of failed probes, request a system rebind once and
  // tell the user a reboot may be needed.
  useEffect(() => {
    if (!granted || connected) return;
    setRebindFailed(false);
    const probes = [1000, 2500, 4500, 7000, 10000, 14000];
    const timers = probes.map((ms) => setTimeout(recheck, ms));
    return () => timers.forEach(clearTimeout);
  }, [granted, connected, recheck]);
  useEffect(() => {
    if (!granted || connected || rebindAsked) return;
    const timer = setTimeout(() => {
      setRebindAsked(true);
      let ok = false;
      try {
        ok = requestListenerRebind();
      } catch {
        ok = false;
      }
      if (!ok) setRebindFailed(true);
      recheck();
      setTimeout(recheck, 3000);
    }, 15000);
    return () => clearTimeout(timer);
  }, [granted, connected, rebindAsked, recheck]);

  const readyCount = (granted ? 1 : 0) + (notifAllowed ? 1 : 0);

  const overallTone = !granted ? "bad" : readyCount === 2 ? "good" : "neutral";
  const overallLabel = !granted
    ? "Not ready"
    : readyCount === 2
      ? "All set"
      : `${readyCount} of 2 ready`;
  const overallDot =
    overallTone === "good" ? theme.green : overallTone === "bad" ? theme.red : theme.muted;
  const overallText =
    overallTone === "good" ? theme.green : overallTone === "bad" ? theme.red : theme.muted;

  const finish = useCallback(async () => {
    await setOnboardingCompleted();
    // Grant is confirmed at this point — arm the periodic self-heal. (Also
    // re-armed on app start in _layout; this covers first-grant without a
    // restart.)
    try {
      ensureHealthCheckScheduled();
    } catch {
      // Native module unavailable — nothing to schedule.
    }
    router.replace("/");
  }, [router]);

  const needsNativeNotice =
    "Needs the dev build (`bun run android`) — not Expo Go.";

  const onOpenNotificationAccess = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    if (!isNativeModuleAvailable()) {
      setNotice(needsNativeNotice);
      return;
    }
    setNotice(null);
    setRebindAsked(false);
    const opened = openNotificationAccessSettings();
    if (!opened) {
      setNotice("Couldn't open it — find Notification access in Settings, switch on NotifyLoudly.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onGrantNotif = useCallback(async () => {
    if (!(await ensureDisclosureOrRedirect(router))) return;
    setNotice(null);
    try {
      if (!requestAlertNotifications()) {
        setNotice("If nothing popped up, allow notifications for NotifyLoudly in Settings.");
      }
      recheck();
      // Runtime permission dialogs overlay the app without backgrounding it,
      // so neither focus nor AppState fires — poll once after the user answers.
      setTimeout(recheck, 1000);
    } catch {
      setNotice("Notification request unavailable on this build.");
    }
  }, [recheck, router]);

  const renderState = (on: boolean, pendingLabel?: string) => (
    <View style={styles.stateRow}>
      <View
        style={[
          styles.dot,
          { backgroundColor: on ? theme.green : pendingLabel ? theme.muted : theme.red },
        ]}
      />
      <Text
        style={[
          styles.state,
          { color: on ? theme.green : pendingLabel ? theme.muted : theme.red },
        ]}
      >
        {on ? "On" : (pendingLabel ?? "Off")}
      </Text>
    </View>
  );

  const renderAction = (label: string, onPress: () => void, a11y: string) => (
    <Pressable
      style={[styles.action, { backgroundColor: theme.ink }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={[styles.actionLabel, { color: theme.paper }]}>{label}</Text>
    </Pressable>
  );

  const renderDone = (a11y: string) => (
    <View accessibilityRole="image" accessibilityLabel={a11y}>
      <Ionicons name="checkmark-circle" size={28} color={theme.green} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.paper }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 16),
            paddingBottom: Math.max(24, insets.bottom + 24),
          },
        ]}
      >
        <Text style={[styles.wordmark, { color: theme.ink }]}>NotifyLoudly</Text>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.ink }]}>Turn on listening.</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {!granted
              ? "Step 1 of 2 — without this, nothing speaks."
              : readyCount === 2
                ? "Everything's on."
                : "One more step to go."}
          </Text>
          <View style={styles.overall}>
            <View style={[styles.dot, { backgroundColor: overallDot }]} />
            <Text style={[styles.overallLabel, { color: overallText }]}>{overallLabel}</Text>
          </View>
          <Text style={[styles.subNote, { color: theme.muted }]}>
            Just these two — announcements start speaking. Everything else
            (pop-up banner, overnight stay-alive) is optional later in Settings.
          </Text>
        </View>

        {!isNativeModuleAvailable() && (
          <Text style={[styles.warning, { color: theme.red }]}>
            Dev build needed — statuses read as off outside it.
          </Text>
        )}

        <View style={[styles.list, { borderColor: theme.line, backgroundColor: theme.card }]}>
          {/* 1 · Hear payments — required */}
          <View style={styles.rowWrap}>
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="notifications-outline" size={20} color={theme.ink} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                  1 · Hear payments <Text style={[styles.tag, { color: theme.red }]}>· Required</Text>
                </Text>
                {granted && !connected
                  ? (
                    <Text style={[styles.state, { color: theme.muted }]}>Binding…</Text>
                  )
                  : renderState(granted)}
                {!granted && (
                  <Text style={[styles.why, { color: theme.muted }]}>
                    Lets NotifyLoudly read UPI payment notifications and speak
                    them aloud.{"\n"}
                    Settings → Notifications → Advanced → Special app access →
                    Notification access → turn on NotifyLoudly.
                  </Text>
                )}
              </View>
              {granted
                ? connected
                  ? renderDone("Notification access on and bound")
                  : <View style={styles.pendingDot} accessibilityRole="image" accessibilityLabel="Binding" />
                : renderAction("Turn on", onOpenNotificationAccess, "Turn on notification access")}
            </View>
            {(!granted || (granted && !connected)) && (
              <View style={styles.subRow}>
                {granted && !connected && (
                  <Text style={[styles.why, { color: theme.muted }]}>
                    {rebindFailed
                      ? "Still not bound — reboot once, then return."
                      : rebindAsked
                        ? "Asked Android to bind it. A few seconds…"
                        : "Waiting a few seconds…"}
                  </Text>
                )}
                {!granted && (
                  <Pressable onPress={recheck} accessibilityRole="button" hitSlop={12}>
                    <Text style={[styles.checkAgain, { color: theme.ink }]}>I've turned it on — check again</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.line }]} />

          {/* 2 · Show pop-up — required */}
          <View style={styles.rowWrap}>
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="alert-circle-outline" size={20} color={theme.ink} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                  2 · Show pop-up <Text style={[styles.tag, { color: theme.red }]}>· Required</Text>
                </Text>
                {renderState(notifAllowed)}
                {!notifAllowed && (
                  <Text style={[styles.why, { color: theme.muted }]}>
                    Posts a payment card when unlocked (never on the lock
                    screen).{"\n"}
                    Tap Allow → tap Allow on the system prompt.
                  </Text>
                )}
              </View>
              {notifAllowed
                ? renderDone("Pop-up alerts on")
                : renderAction("Allow", onGrantNotif, "Allow notifications")}
            </View>
          </View>
        </View>

        <Text style={[styles.footnote, { color: theme.muted }]}>
          Float-on-top banner and overnight stay-alive are optional — find them
          in Settings and Stay-alive after setup.
        </Text>

        {notice && <Text style={[styles.notice, { color: theme.red }]}>{notice}</Text>}

        {!(granted && notifAllowed) && (
          <Text style={[styles.hint, { color: theme.muted }]}>
            Turn on the required steps to finish setup.
          </Text>
        )}

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.primary,
              { backgroundColor: theme.ink },
              !(granted && notifAllowed) && styles.disabled,
            ]}
            onPress={finish}
            disabled={!(granted && notifAllowed)}
            accessibilityRole="button"
            accessibilityLabel="Finish setup"
            accessibilityState={{ disabled: !(granted && notifAllowed) }}
          >
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Finish setup</Text>
          </Pressable>
          <Link href="/disclosure" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Back">
              <Text style={[styles.back, { color: theme.muted }]}>Back</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
      <StatusBar style={theme.statusBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  wordmark: {
    fontFamily: FONTS.extraBold,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  header: {
    marginTop: 24,
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    ...TYPE.headlineLarge,
  },
  sub: {
    marginTop: 8,
    textAlign: "center",
    ...TYPE.bodyLarge,
  },
  subNote: {
    marginTop: 8,
    textAlign: "center",
    ...TYPE.bodyMedium,
  },
  overall: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overallLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: "700",
  },
  warning: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  rowWrap: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  subRow: {
    paddingHorizontal: 16,
    paddingLeft: 68,
    paddingBottom: 12,
    gap: 8,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  tag: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    fontWeight: "600",
  },
  why: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  footnote: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  state: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
  },
  pendingDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#8A8580",
    opacity: 0.5,
  },
  action: {
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  actionLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
  },
  checkAgain: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    paddingVertical: 8,
  },
  notice: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  hint: {
    marginTop: 12,
    textAlign: "center",
    ...TYPE.bodyMedium,
  },
  footer: {
    marginTop: 24,
    gap: 4,
  },
  primary: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  disabled: {
    opacity: 0.35,
  },
  primaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    fontWeight: "700",
  },
  back: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
  },
});
