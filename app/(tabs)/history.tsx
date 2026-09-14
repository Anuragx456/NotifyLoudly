import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { getLocaleTag, speakTest } from "upi-listener";
import { formatINR } from "@/parsers";
import { buildSpeechText } from "@/parsers/speech";
import { normalizeLocaleTag } from "@/store/settings";
import { listRecentPayments, type StoredPayment } from "@/db/payments";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Snackbar } from "@/components/Snackbar";

function formatDateTime(value: number): string {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function HistoryScreen() {
  const [payments, setPayments] = useState<StoredPayment[]>([]);
  const [replayingId, setReplayingId] = useState<number | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const reload = useCallback(() => {
    listRecentPayments()
      .then(setPayments)
      .catch((error) => {
        console.warn("[history] failed to load payments", error);
      });
  }, []);

  useFocusEffect(reload);

  const onReplay = useCallback((payment: StoredPayment) => {
    setReplayingId(payment.id);
    try {
      let localeTag = "en-IN";
      try {
        localeTag = normalizeLocaleTag(getLocaleTag());
      } catch {
        localeTag = "en-IN";
      }
      const ok = speakTest(buildSpeechText(payment.amountPaise, payment.sender, localeTag));
      if (ok) setSnack(`Replaying ${formatINR(payment.amountPaise)}`);
    } catch (error) {
      console.warn("[history] replay failed", error);
    } finally {
      setReplayingId(null);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.paper, paddingTop: Math.max(16, insets.top + 16) }]}>
      <Text style={[styles.title, { color: theme.ink }]}>History</Text>
      <Text style={[styles.subtitle, { color: theme.faint }]}>
        Every payment this phone announced, newest first.
      </Text>

      <FlatList
        data={payments}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: theme.line }]}>
            <View style={styles.rowMain}>
              <Text style={[styles.amount, { color: theme.ink }]}>{formatINR(item.amountPaise)}</Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                {item.appName} · {formatDateTime(item.announcedAt)}
              </Text>
              {item.sender && (
                <Text style={[styles.meta, { color: theme.muted }]}>From {item.sender}</Text>
              )}
              <Text style={[styles.meta, { color: theme.muted }]}>Spoken in {item.latencyMs} ms</Text>
            </View>
            <Pressable
              style={[styles.replay, { borderColor: theme.ink }]}
              onPress={() => onReplay(item)}
              accessibilityRole="button"
              accessibilityLabel={`Replay ${formatINR(item.amountPaise)}`}
            >
              <Text style={[styles.replayLabel, { color: theme.ink }]}>
                {replayingId === item.id ? "…" : "Replay"}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={[styles.empty, { color: theme.muted }]}>
              No announced payments yet. They will appear here after the first one is spoken aloud.
            </Text>
          </View>
        }
      />
      <Snackbar message={snack} onDismiss={() => setSnack(null)} />
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
  title: {
    marginTop: 8,
    ...TYPE.headlineLarge,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    ...TYPE.bodyMedium,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowMain: {
    flex: 1,
  },
  amount: {
    ...TYPE.headlineMedium,
  },
  meta: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
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
  emptyCard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 16,
  },
  empty: {
    ...TYPE.bodyMedium,
  },
});
