import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";
import { PRIVACY_POLICY_URL } from "@/components/privacy";
import { setDisclosureSeen } from "@/store/onboarding";

export default function DisclosureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  // "Not now" dismisses without consent. Stay on this screen (never mount the
  // tab bar pre-consent) — show a reminder instead of flashing Home.
  const [declined, setDeclined] = useState(false);

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

        <View style={styles.hero}>
          <View
            style={[styles.mark, { backgroundColor: theme.accentSoft }]}
            accessibilityRole="image"
            accessibilityLabel="NotifyLoudly speaker"
          >
            <Ionicons name="volume-high" size={40} color={theme.ink} />
          </View>
          <Text style={[styles.title, { color: theme.ink }]}>Hear every payment.</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            Your counter phone speaks each UPI payment aloud.
          </Text>
          <Text style={[styles.micro, { color: theme.muted }]}>
            To do this, NotifyLoudly asks for the following access —{"\n\n"}
            · Notification access: reads notification text (title and body)
            from your UPI and bank apps, extracts the payment amount and
            sender, and speaks it aloud. UPI payment notifications only — no
            other notifications are used.{"\n\n"}
            · Show pop-up: posts a heads-up payment alert (notifications
            permission).{"\n\n"}
            · Float on top (optional): draws the payment banner over any open
            app.{"\n\n"}
            · Stay on overnight (suggested): ignores battery optimizations so
            Doze mode doesn't pause announcements.{"\n\n"}
            · Restart after reboot: re-starts the speech service and re-binds
            listening automatically when the phone boots or the app updates.{"\n\n"}
            · Speech service: runs in the foreground while announcing so
            payments speak even when the app is in the background.{"\n\n"}
            Amount, sender, app and time are stored offline in on-device
            storage only. No upload, no account, no analytics.{"\n\n"}
            Tap Continue to consent and turn on notification access in the next
            step.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Read the privacy policy"
          >
            <Text style={[styles.privacyLink, { color: theme.ink }]}>
              Read the privacy policy
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primary, { backgroundColor: theme.ink }]}
            onPress={async () => {
              await setDisclosureSeen();
              router.replace("/onboarding");
            }}
            accessibilityRole="button"
            accessibilityLabel="Continue to setup"
          >
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Continue</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={() => setDeclined(true)}
          >
            <Text style={[styles.secondaryLabel, { color: theme.muted }]}>Not now</Text>
          </Pressable>
          {declined && (
            <Text style={[styles.declineHint, { color: theme.muted }]}>
              Nothing turns on until you tap Continue — announcements stay off.
            </Text>
          )}
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
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 24,
    textAlign: "center",
    ...TYPE.headlineLarge,
  },
  sub: {
    marginTop: 8,
    textAlign: "center",
    ...TYPE.bodyLarge,
  },
  micro: {
    marginTop: 16,
    textAlign: "center",
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  privacyLink: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footer: {
    gap: 4,
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
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    fontWeight: "600",
  },
  declineHint: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
