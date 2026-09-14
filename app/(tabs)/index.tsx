import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  addAnnouncementListener,
  addListenerConnectionListener,
  getLastAnnouncement,
  getLocaleTag,
  getMuted,
  isListenerConnected,
  isNotificationAccessEnabled,
  seedNativeDedupKey,
  setMuted,
  speakTest,
  startTtsService,
  type AnnouncementEvent,
} from "upi-listener";
import { formatINR } from "@/parsers";
import { buildSpeechText } from "@/parsers/speech";
import {
  insertAnnouncedPayment,
  listRecentPayments,
  loadRecentDedupSeeds,
  type StoredPayment,
} from "@/db/payments";
import { seedDedupKey } from "@/parsers";
import { normalizeLocaleTag } from "@/store/settings";
import { hasCompletedOnboarding, hasSeenDisclosure } from "@/store/onboarding";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";
import { StatusPill } from "@/components/StatusPill";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Snackbar } from "@/components/Snackbar";

function formatTime(postedAt: number): string {
  if (!postedAt) return "—";
  const date = new Date(postedAt);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [announcement, setAnnouncement] = useState<AnnouncementEvent | null>(null);
  const [payments, setPayments] = useState<StoredPayment[]>([]);
  const [playMsg, setPlayMsg] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const refreshStatus = useCallback(() => {
    try {
      setAccessGranted(isNotificationAccessEnabled());
    } catch {
      setAccessGranted(false);
    }
    try {
      setConnected(isListenerConnected());
    } catch {
      setConnected(false);
    }
    try {
      setMutedState(getMuted());
    } catch {
      setMutedState(false);
    }
  }, []);

  const reloadPayments = useCallback(() => {
    listRecentPayments(20)
      .then(setPayments)
      .catch((error) => {
        console.warn("[history] failed to load payments", error);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
      reloadPayments();
      if (!onboardingChecked) {
        setOnboardingChecked(true);
        Promise.all([hasSeenDisclosure(), hasCompletedOnboarding()]).then(
          ([seen, done]) => {
            if (!seen && !done) router.replace("/disclosure");
          },
        );
      }
    }, [refreshStatus, reloadPayments, onboardingChecked, router]),
  );

  useEffect(() => {
    try {
      startTtsService();
      const last = getLastAnnouncement();
      if (last && (last.source === "notification" || last.source == null)) {
        setAnnouncement({
          text: last.text,
          latencyMs: last.latencyMs,
          postedAt: last.atWallMs,
          source: "previous-run",
          amountPaise: last.amountPaise,
          sender: last.sender,
          appName: last.appName,
          sourcePackage: last.sourcePackage,
          muted: last.muted,
        });
      }
    } catch {
      // Native module unavailable (e.g. web preview) — stay empty.
    }
    reloadPayments();
    loadRecentDedupSeeds()
      .then((seeds) =>
        seeds.forEach((seed) => {
          seedDedupKey(seed.key, seed.seenAt);
          seedNativeDedupKey(seed.key, seed.seenAt);
        }),
      )
      .catch(() => {});
    const subs = [
      addAnnouncementListener((event) => {
        if (event.source !== "notification" || event.amountPaise < 0) {
          return;
        }
        insertAnnouncedPayment(event, event.sourcePackage)
          .then((rowId) => {
            if (rowId !== -1) setAnnouncement(event);
            reloadPayments();
          })
          .catch((error) => {
            console.warn("[history] failed to store announcement", error);
            setAnnouncement(event);
            reloadPayments();
          });
      }),
      addListenerConnectionListener((event) => {
        setConnected(event.connected);
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [reloadPayments]);

  const speakPayment = useCallback((amountPaise: number, sender: string | null) => {
    try {
      let localeTag = "en-IN";
      try {
        localeTag = normalizeLocaleTag(getLocaleTag());
      } catch {
        localeTag = "en-IN";
      }
      return speakTest(buildSpeechText(amountPaise, sender, localeTag));
    } catch {
      return false;
    }
  }, []);

  const lastStored = payments[0] ?? null;
  const lastSeen =
    announcement && announcement.amountPaise >= 0 ? announcement : null;
  const playTarget = lastStored
    ? { amountPaise: lastStored.amountPaise, sender: lastStored.sender }
    : lastSeen
      ? { amountPaise: lastSeen.amountPaise, sender: lastSeen.sender }
      : null;

  const onPlayLastPayment = useCallback(() => {
    if (!playTarget) return;
    const ok = speakPayment(playTarget.amountPaise, playTarget.sender);
    if (ok) {
      setSnack(`Announced ${formatINR(playTarget.amountPaise)}`);
      setPlayMsg(null);
    } else {
      setPlayMsg("Voice unavailable — use local dev build.");
    }
  }, [playTarget, speakPayment]);

  const onReplay = useCallback(
    (item: StoredPayment) => {
      const ok = speakPayment(item.amountPaise, item.sender);
      if (ok) setSnack(`Replaying ${formatINR(item.amountPaise)}`);
      else setPlayMsg("Voice unavailable on this build.");
    },
    [speakPayment],
  );

  const onToggleMute = useCallback(() => {
    try {
      const next = !muted;
      setMuted(next);
      setMutedState(next);
      setSnack(next ? "Speaker muted — still logging" : "Speaker unmuted");
    } catch {
      setPlayMsg("Mute toggle unavailable on this build.");
    }
  }, [muted]);

  const listening = accessGranted && connected;
  const previewPayments = payments.slice(0, 3);

  return (
    <View style={[styles.screen, { backgroundColor: theme.paper }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.paper }]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 16), paddingBottom: 32 }]}
      >
        <Text style={[styles.kicker, { color: theme.muted }]}>Counter status</Text>
        <View style={styles.statusRow} accessibilityRole="header">
          <View style={[styles.dot, { backgroundColor: listening ? theme.green : theme.red }]} />
          <Text style={[styles.status, { color: listening ? theme.green : theme.red }]}>
            {listening ? "Listening" : "Not listening"}
          </Text>
        </View>
        <Text style={[styles.hint, { color: theme.faint }]}>
          {listening
            ? muted
              ? "Hearing payments, but speaker is muted."
              : "Hearing UPI payments. Keep this phone on the counter."
            : "Nothing can be heard until access is on and the listener is bound."}
        </Text>
        {!accessGranted && (
          <Link href="/disclosure" asChild>
            <Pressable style={StyleSheet.flatten([styles.primary, { backgroundColor: theme.ink }])} accessibilityRole="button">
              <Text style={[styles.primaryLabel, { color: theme.paper }]}>Enable notification access</Text>
            </Pressable>
          </Link>
        )}
        {!listening && accessGranted && !connected && (
          <Text style={[styles.hint, { color: theme.muted, fontWeight: "600" as const }]}>
            Access granted but listener unbound — open Diagnostics and tap Recheck, then reboot once.
          </Text>
        )}

        <Text style={[styles.section, { color: theme.muted }]}>Last payment</Text>
        {announcement && announcement.amountPaise >= 0 ? (
          <View style={[styles.lastBox, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={[styles.lastAmount, { color: theme.ink }]}>{formatINR(announcement.amountPaise)}</Text>
            <Text style={[styles.lastApp, { color: theme.ink }]}>
              {announcement.appName}
              {announcement.sender ? ` · from ${announcement.sender}` : ""}
            </Text>
            <Text style={[styles.spoken, { color: theme.faint }]}>“{announcement.text}”</Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {formatTime(announcement.postedAt)} · spoken in {announcement.latencyMs} ms
              {announcement.muted ? " · muted" : ""}
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyCard, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={[styles.empty, { color: theme.muted }]}>
              No payments announced yet. Have someone send you ₹1 (incoming payments only — money you send is ignored).
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.secondary, { borderColor: theme.ink, backgroundColor: theme.paper }, !playTarget && styles.disabled]}
            onPress={onPlayLastPayment}
            disabled={!playTarget}
            accessibilityRole="button"
            accessibilityLabel="Play last payment"
          >
            <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Play last payment</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, { borderColor: theme.ink, backgroundColor: muted ? theme.line : theme.paper }, muted && styles.mutedActive]}
            onPress={onToggleMute}
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
          >
            <Text style={[styles.secondaryLabel, { color: theme.ink }]}>{muted ? "Unmute speaker" : "Mute speaker"}</Text>
          </Pressable>
        </View>
        {playMsg && <Text style={[styles.testMsg, { color: theme.faint }]}>{playMsg}</Text>}

        <View style={styles.historyHeader}>
          <Text style={[styles.section, { color: theme.muted, marginBottom: 0 }]}>Recent payments</Text>
          <Link href="/history" style={StyleSheet.flatten([styles.viewAll, { color: theme.ink }])}>
            View all {payments.length > 0 ? `(${payments.length})` : ""}
          </Link>
        </View>
        <Text style={[styles.historyHint, { color: theme.muted }]}>Newest 3 — full list in History tab</Text>
        {previewPayments.length === 0 ? (
          <Text style={[styles.empty, { color: theme.muted, marginTop: 8 }]}>
            No announced payments yet. They will appear here after the first one is spoken aloud.
          </Text>
        ) : (
          <>
            {previewPayments.map((item) => (
              <View key={item.id} style={[styles.historyRow, { borderBottomColor: theme.line }]}>
                <View style={styles.historyMain}>
                  <Text style={[styles.historyAmount, { color: theme.ink }]}>{formatINR(item.amountPaise)}</Text>
                  <Text style={[styles.historyMeta, { color: theme.muted }]}>
                    {item.appName} · {formatTime(item.announcedAt)}
                  </Text>
                  {item.sender && <Text style={[styles.historyMeta, { color: theme.muted }]}>From {item.sender}</Text>}
                </View>
                <Pressable
                  style={[styles.replay, { borderColor: theme.ink }]}
                  onPress={() => onReplay(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Replay ${formatINR(item.amountPaise)}`}
                >
                  <Text style={[styles.replayLabel, { color: theme.ink }]}>Replay</Text>
                </Pressable>
              </View>
            ))}
            {payments.length > 3 && (
              <Text style={[styles.moreHint, { color: theme.muted }]}>+ {payments.length - 3} more in History</Text>
            )}
          </>
        )}
        <StatusBar style={theme.statusBar} />
      </ScrollView>
      <Snackbar message={snack} onDismiss={() => setSnack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  kicker: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statusRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  status: {
    ...TYPE.displayMedium,
  },
  hint: {
    marginTop: 8,
    ...TYPE.bodyMedium,
  },
  section: {
    marginTop: 28,
    marginBottom: 8,
    ...TYPE.labelSmall,
    textTransform: "uppercase",
  },
  lastBox: {
    borderWidth: 1,
    paddingLeft: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  lastAmount: {
    ...TYPE.amountHero,
  },
  lastApp: {
    marginTop: 6,
    ...TYPE.titleMedium,
  },
  spoken: {
    marginTop: 6,
    ...TYPE.bodyMedium,
  },
  meta: {
    marginTop: 6,
    fontFamily: FONTS.regular,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 16,
  },
  empty: {
    ...TYPE.bodyMedium,
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  primary: {
    marginTop: 20,
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
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  mutedActive: {
    opacity: 0.92,
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: "700",
  },
  testMsg: {
    marginTop: 8,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
  },
  historyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    marginBottom: 8,
  },
  viewAll: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
    textDecorationLine: "underline",
    paddingVertical: 8,
    paddingLeft: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  historyMain: {
    flex: 1,
  },
  historyAmount: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  historyMeta: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  replay: {
    minWidth: 88,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.sm,
    marginLeft: 12,
  },
  replayLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
  },
  moreHint: {
    marginTop: 10,
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
