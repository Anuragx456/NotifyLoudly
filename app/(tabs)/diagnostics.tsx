import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  addListenerConnectionListener,
  addListenerHealthListener,
  addUpiNotificationListener,
  areAlertNotificationsEnabled,
  getListenerHeartbeat,
  getPendingNotifications,
  isListenerConnected,
  isNativeModuleAvailable,
  isNotificationAccessEnabled,
  isOverlayAccessGranted,
  isTtsReady,
  isTtsServiceRunning,
  openNotificationAccessSettings,
  type ListenerHeartbeat,
  type UpiNotification,
} from "upi-listener";
import { formatINR, parseUpiNotification } from "@/parsers";
import { STALE_MS } from "@/parsers/constants";
import { friendlyAppName } from "@/components/upiApps";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";
import { StatusPill } from "@/components/StatusPill";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ensureDisclosureOrRedirect } from "@/store/disclosureGate";
import { listListeningEpisodes, type ListeningEpisode } from "@/db/listening";

const MAX_LOG = 50;
const MAX_EPISODES = 10;

function formatTime(postedAt: number): string {
  if (!postedAt) return "—";
  return new Date(postedAt).toLocaleTimeString();
}

function formatEpisodeTime(atMs: number): string {
  if (!atMs) return "—";
  const date = new Date(atMs);
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// "Disconnected 11:42 PM – 6:15 AM" per the Phase 4 brief; open episodes
// read "… – now" so an ongoing outage is obvious at a glance.
function formatEpisode(episode: ListeningEpisode): string {
  const start = formatEpisodeTime(episode.startedAt);
  const end = episode.endedAt == null ? "now" : formatEpisodeTime(episode.endedAt);
  const label = episode.reason === "access-revoked" ? "Access revoked" : "Disconnected";
  return `${label} ${start} – ${end}`;
}

function previewText(event: UpiNotification): string {
  // Mirror the actual pipeline: stale/out-of-range are suppressed before
  // any amount parse, so Diagnostics should label them the same way rather
  // than showing a spurious amount.
  if (event.postedAt > 0 && Date.now() - event.postedAt > STALE_MS) {
    return "Unparsed (stale)";
  }
  const outcome = parseUpiNotification(event);
  if (outcome.kind === "parsed") {
    return `${formatINR(outcome.payment.amountPaise)} · ${outcome.payment.confidence} · ${outcome.payment.patternId}`;
  }
  if (outcome.kind === "outgoing") return "Outgoing — ignored";
  return `Unparsed (${outcome.reason})`;
}

function ageLine(heartbeat: ListenerHeartbeat | null): string {
  if (!heartbeat || heartbeat.lastCallbackAtMs <= 0) return "No callbacks yet";
  const ageMs = Math.max(0, heartbeat.nowMs - heartbeat.lastCallbackAtMs);
  if (ageMs < 1000) return `${ageMs} ms ago`;
  return `${Math.round(ageMs / 1000)} s ago`;
}

function StateRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  const theme = useThemeColors();
  return (
    <View style={[styles.stateRow, { borderBottomColor: theme.line }]}>
      <Text style={[styles.stateLabel, { color: theme.ink }]}>{label}</Text>
      <StatusPill label={value} tone={good ? "good" : "bad"} />
    </View>
  );
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const [accessGranted, setAccessGranted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ttsRunning, setTtsRunning] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const [heartbeat, setHeartbeat] = useState<ListenerHeartbeat | null>(null);
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [notifAllowed, setNotifAllowed] = useState(false);
  const [events, setEvents] = useState<UpiNotification[]>([]);
  const [episodes, setEpisodes] = useState<ListeningEpisode[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const refreshEpisodes = useCallback(() => {
    try {
      setEpisodes(listListeningEpisodes(MAX_EPISODES));
    } catch {
      // Db locked or otherwise unavailable — keep the last snapshot.
    }
  }, []);

  const refresh = useCallback(() => {
    refreshEpisodes();
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
      setTtsRunning(isTtsServiceRunning());
    } catch {
      setTtsRunning(false);
    }
    try {
      setTtsReady(isTtsReady());
    } catch {
      setTtsReady(false);
    }
    try {
      setHeartbeat(getListenerHeartbeat());
    } catch {
      setHeartbeat(null);
    }
    try {
      setOverlayGranted(isOverlayAccessGranted());
    } catch {
      setOverlayGranted(false);
    }
    try {
      setNotifAllowed(areAlertNotificationsEnabled());
    } catch {
      setNotifAllowed(false);
    }
  }, [refreshEpisodes]);

  useFocusEffect(refresh);

  useEffect(() => {
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    try {
      const pending = getPendingNotifications();
      if (pending.length > 0) setEvents(pending.reverse().slice(0, MAX_LOG));
    } catch {
      // Native module unavailable — stay empty.
    }
    refreshEpisodes();
    const subs = [
      addUpiNotificationListener((event) => {
        setEvents((prev) => [event, ...prev].slice(0, MAX_LOG));
      }),
      addListenerConnectionListener((event) => {
        setConnected(event.connected);
        refresh();
      }),
      // Health pushes arrive on bind flips (and worker checks when JS is up),
      // so the history list tracks episodes live without waiting for focus.
      addListenerHealthListener(() => {
        refreshEpisodes();
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [refresh, refreshEpisodes]);

  return (
    <View style={[styles.container, { backgroundColor: theme.paper, paddingTop: Math.max(16, insets.top + 16) }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Diagnostics</Text>
      <Text style={[styles.subtitle, { color: theme.faint }]}>Is Android letting us hear anything?</Text>

      <FlatList
        data={events}
        keyExtractor={(item, index) => `${item.key || item.postedAt}-${index}`}
        ListHeaderComponent={
          <View>
            <Text style={[styles.section, { color: theme.muted }]}>Service</Text>
            <StateRow label="Listener" value={connected ? "Bound" : "Unbound"} good={connected} />
            <StateRow label="Speech service" value={ttsRunning ? "Running" : "Stopped"} good={ttsRunning} />
            <StateRow label="Voice engine" value={ttsReady ? "Ready" : "Warming up"} good={ttsReady} />
            <StateRow label="Last callback" value={ageLine(heartbeat)} good={(heartbeat?.lastCallbackAtMs ?? 0) > 0} />
            <StateRow label="Overlay banner" value={overlayGranted ? "Can draw" : "Not allowed"} good={overlayGranted} />
            <StateRow label="Heads-up (fallback)" value={notifAllowed ? "Allowed" : "Not allowed"} good={notifAllowed} />
            <Text style={[styles.notice, { color: theme.faint }]}>
              Locked phone: announced aloud + vibrates, no visual by design.
            </Text>

            <Text style={[styles.section, { color: theme.muted }]}>Permission</Text>
            <StateRow
              label="Notification access"
              value={accessGranted ? "Allowed" : "Not allowed"}
              good={accessGranted}
            />
            <View style={styles.btnRow}>
              <Pressable
                style={[styles.primary, { backgroundColor: theme.ink }]}
                onPress={async () => {
                  if (!(await ensureDisclosureOrRedirect(router))) return;
                  if (!isNativeModuleAvailable()) {
                    setNotice("System settings cannot open from Expo Go — use `bun run android`.");
                    return;
                  }
                  setNotice(null);
                  if (!openNotificationAccessSettings()) {
                    setNotice(
                      "Could not open the page automatically. Go to Settings → Notifications → " +
                        "Advanced → Special app access → Notification access manually.",
                    );
                  }
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryLabel, { color: theme.paper }]}>Open system settings</Text>
              </Pressable>
              {notice && <Text style={[styles.notice, { color: theme.red }]}>{notice}</Text>}
              <Pressable style={[styles.secondary, { borderColor: theme.ink }]} onPress={refresh} accessibilityRole="button">
                <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Recheck</Text>
              </Pressable>
              <Link href="/reliability" asChild>
                <Pressable style={StyleSheet.flatten([styles.secondary, { borderColor: theme.ink }])} accessibilityRole="button">
                  <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Stay-alive setup</Text>
                </Pressable>
              </Link>
            </View>

            <Text style={[styles.section, { color: theme.muted }]}>Listening history</Text>
            {episodes.length === 0 ? (
              <Text style={[styles.empty, { color: theme.muted }]}>
                Always listening since install — no outages recorded.
              </Text>
            ) : (
              episodes.map((episode) => (
                <View
                  key={episode.id}
                  style={[styles.logRow, { borderBottomColor: theme.line }]}
                >
                  <Text style={[styles.logApp, { color: theme.ink }]}>
                    {formatEpisode(episode)}
                  </Text>
                  <Text style={[styles.logMeta, { color: theme.muted }]}>
                    {episode.endedAt == null
                      ? "Still down — fix it in Stay-alive setup below"
                      : episode.reason === "access-revoked"
                        ? "Access was turned off, then back on"
                        : "Recovered automatically"}
                  </Text>
                </View>
              ))
            )}

            <Text style={[styles.section, { color: theme.muted }]}>Raw log ({events.length})</Text>
            {events.length === 0 && (
              <Text style={[styles.empty, { color: theme.muted }]}>
                No notifications captured since this screen opened. Ask someone to send a test
                payment.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.logRow, { borderBottomColor: theme.line }]}>
            <Text style={[styles.logApp, { color: theme.ink }]}>{friendlyAppName(item.packageName)}</Text>
            <Text style={[styles.logText, { color: theme.ink }]} numberOfLines={2}>
              {[item.title, item.text].filter(Boolean).join(" — ") || "(no text)"}
            </Text>
            <Text style={[styles.logMeta, { color: theme.muted }]}>
              {previewText(item)} · {formatTime(item.postedAt)}
            </Text>
          </View>
        )}
      />
      <StatusBar style={theme.statusBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  back: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    fontWeight: "600",
    color: "#6B675E", // fallback — screen overrides via theme
  },
  title: {
    marginTop: 8,
    ...TYPE.headlineLarge,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 4,
    ...TYPE.bodyMedium,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
    ...TYPE.labelSmall,
    textTransform: "uppercase",
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  stateLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    fontWeight: "600",
  },
  btnRow: {
    marginTop: 12,
    gap: 12,
  },
  primary: {
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
  notice: {
    marginTop: 8,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  logRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  logApp: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: "700",
  },
  logText: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  logMeta: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
});
