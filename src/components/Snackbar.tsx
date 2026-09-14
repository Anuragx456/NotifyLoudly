import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONTS, RADIUS } from "./theme";
import { useAppTheme } from "./ThemeProvider";

type Props = {
  message: string | null;
  onDismiss?: () => void;
  durationMs?: number;
};

export function Snackbar({ message, onDismiss, durationMs = 2600 }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  useEffect(() => {
    if (!message || !onDismiss) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, onDismiss, durationMs]);
  if (!message) return null;
  return (
    <View style={[styles.wrap, { bottom: Math.max(16, insets.bottom + 72) }]} pointerEvents="none">
      <View
        style={[styles.bubble, { backgroundColor: theme.ink }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.text, { color: theme.paper }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 50,
  },
  bubble: {
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
});
