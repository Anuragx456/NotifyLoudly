import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  addAnnouncementListener,
  addListenerConnectionListener,
  getLastAnnouncement,
  getLocaleTag,
  getMuted,
  isListenerConnected,
  isNotificationAccessEnabled,
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
import { COLORS } from "@/components/theme";

function formatTime(postedAt: number): string {
  if (!postedAt) return "—";
  const date = new Date(postedAt);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function HomeScreen() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [announcement, setAnnouncement] = useState<AnnouncementEvent | null>(null);
  const [payments, setPayments] = useState<StoredPayment[]>([]);
  const [playMsg, setPlayMsg] = useState<string | null>(null);

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
    }, [refreshStatus, reloadPayments]),
  );

  useEffect(() => {
    try {
      startTtsService();
      const last = getLastAnnouncement();
      if (last) {
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
      .then((seeds) => seeds.forEach((seed) => seedDedupKey(seed.key, seed.seenAt)))
      .catch(() => {});
    const subs = [
      addAnnouncementListener((event) => {
        // Only live payment announcements belong in status + History.
        // Test/replay speech (source "test") and self-tests also emit
        // onAnnouncement with amountPaise = -1 — never store those.
        if (event.source !== "notification" || event.amountPaise < 0) {
          return;
        }
        setAnnouncement(event);
        insertAnnouncedPayment(event, event.sourcePackage)
          .then(() => reloadPayments())
          .catch((error) => {
            console.warn("[history] failed to store announcement", error);
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
    setPlayMsg(null);
    if (!playTarget) {
      setPlayMsg("No payments yet to play.");
      return;
    }
    const ok = speakPayment(playTarget.amountPaise, playTarget.sender ?? null);
    if (!ok) {
      setPlayMsg("Could not play — use the local dev build (`bun run android`).");
    }
  }, [playTarget, speakPayment]);

  const onReplay = useCallback(
    (payment: StoredPayment) => {
      const ok = speakPayment(payment.amountPaise, payment.sender);
      setPlayMsg(
        ok ? null : "Could not play — use the local dev build (`bun run android`).",
      );
    },
    [speakPayment],
  );

  const onToggleMute = useCallback(() => {
    try {
      const next = !muted;
      setMuted(next);
      setMutedState(next);
    } catch {
      setPlayMsg("Mute toggle unavailable on this build.");
    }
  }, [muted]);

  const listening = accessGranted && connected;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Counter status</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, listening ? styles.dotOn : styles.dotOff]} />
          <Text style={[styles.status, listening ? styles.statusOn : styles.statusOff]}>
            {listening ? "Listening" : "Not listening"}
          </Text>
        </View>
        <Text style={styles.hint}>
          {listening
            ? muted
              ? "Hearing payments, but speaker is muted."
              : "Hearing UPI payments. Keep this phone on the counter."
            : "Nothing can be heard until access is on and the listener is bound."}
        </Text>
        {!accessGranted && (
          <Link href="/disclosure" asChild>
            <Pressable style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryLabel}>Enable notification access</Text>
            </Pressable>
          </Link>
        )}

        <Text style={styles.section}>Last payment</Text>
        {announcement && announcement.amountPaise >= 0 ? (
          <View style={styles.lastBox}>
            <Text style={styles.lastAmount}>{formatINR(announcement.amountPaise)}</Text>
            <Text style={styles.lastApp}>
              {announcement.appName}
              {announcement.sender ? ` · from ${announcement.sender}` : ""}
            </Text>
            <Text style={styles.spoken}>“{announcement.text}”</Text>
            <Text style={styles.meta}>
              {formatTime(announcement.postedAt)} · spoken in {announcement.latencyMs} ms
              {announcement.muted ? " · muted" : ""}
            </Text>
          </View>
        ) : (
          <Text style={styles.empty}>
            No payments announced yet. Have someone send you ₹1 (incoming payments only — money you send is ignored).
          </Text>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.secondary, !playTarget && styles.disabled]}
            onPress={onPlayLastPayment}
            disabled={!playTarget}
            accessibilityRole="button"
            accessibilityLabel="Play last payment"
          >
            <Text style={styles.secondaryLabel}>Play last payment</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, muted && styles.mutedActive]}
            onPress={onToggleMute}
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
          >
            <Text style={styles.secondaryLabel}>{muted ? "Unmute speaker" : "Mute speaker"}</Text>
          </Pressable>
        </View>
        {playMsg && <Text style={styles.testMsg}>{playMsg}</Text>}

        <View style={styles.historyHeader}>
          <Text style={styles.section}>Payment history</Text>
          <Link href="/history" style={styles.viewAll}>
            View all
          </Link>
        </View>
        {payments.length === 0 ? (
          <Text style={styles.empty}>
            No announced payments yet. They will appear here after the first one is spoken aloud.
          </Text>
        ) : (
          payments.map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyMain}>
                <Text style={styles.historyAmount}>{formatINR(item.amountPaise)}</Text>
                <Text style={styles.historyMeta}>
                  {item.appName} · {formatTime(item.announcedAt)}
                </Text>
                {item.sender && <Text style={styles.historyMeta}>From {item.sender}</Text>}
              </View>
              <Pressable
                style={styles.replay}
                onPress={() => onReplay(item)}
                accessibilityRole="button"
                accessibilityLabel={`Replay ${formatINR(item.amountPaise)}`}
              >
                <Text style={styles.replayLabel}>Replay</Text>
              </Pressable>
            </View>
          ))
        )}
        <StatusBar style="dark" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 32,
  },
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: COLORS.muted,
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
  dotOn: {
    backgroundColor: COLORS.green,
  },
  dotOff: {
    backgroundColor: COLORS.red,
  },
  status: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusOn: {
    color: COLORS.green,
  },
  statusOff: {
    color: COLORS.red,
  },
  hint: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.faint,
  },
  section: {
    marginTop: 28,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: COLORS.muted,
  },
  lastBox: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.ink,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  lastAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: COLORS.ink,
  },
  lastApp: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.ink,
  },
  spoken: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.faint,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.muted,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
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
    backgroundColor: COLORS.ink,
    borderRadius: 4,
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.paper,
  },
  secondary: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.ink,
    borderRadius: 4,
    backgroundColor: COLORS.paper,
  },
  disabled: {
    opacity: 0.4,
  },
  mutedActive: {
    backgroundColor: COLORS.line,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.ink,
  },
  testMsg: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.faint,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  viewAll: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
    textDecorationLine: "underline",
    paddingVertical: 8,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  historyMain: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.ink,
  },
  historyMeta: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.muted,
  },
  replay: {
    minWidth: 88,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.ink,
    borderRadius: 4,
    marginLeft: 12,
  },
  replayLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
  },
});
