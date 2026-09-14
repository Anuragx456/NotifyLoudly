import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { FONTS, RADIUS, TYPE, useThemeColors } from "@/components/theme";

export default function DisclosureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

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
            UPI alerts only · never leaves this phone
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primary, { backgroundColor: theme.ink }]}
            onPress={() => router.replace("/onboarding")}
            accessibilityRole="button"
            accessibilityLabel="Continue to setup"
          >
            <Text style={[styles.primaryLabel, { color: theme.paper }]}>Continue</Text>
          </Pressable>
          <Link href="/" asChild>
            <Pressable
              style={styles.secondary}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={[styles.secondaryLabel, { color: theme.muted }]}>Not now</Text>
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
});
