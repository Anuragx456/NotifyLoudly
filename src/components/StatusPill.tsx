import { StyleSheet, Text, View } from "react-native";
import { FONTS } from "./theme";
import { useAppTheme } from "./ThemeProvider";

export type PillTone = "good" | "bad" | "neutral";

type Props = {
  label: string;
  tone: PillTone;
  size?: "compact" | "large";
  noDot?: boolean;
};

export function StatusPill({ label, tone, size = "compact", noDot = false }: Props) {
  const { theme } = useAppTheme();
  const toneBg =
    tone === "good" ? theme.successBg : tone === "bad" ? theme.errorBg : theme.accentSoft;
  const isLarge = size === "large";
  return (
    <View
      style={[
        styles.pill,
        isLarge && styles.pillLarge,
        {
          backgroundColor: toneBg,
          borderColor: tone === "good" ? theme.green : tone === "bad" ? theme.red : theme.muted,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {!noDot && (
        <View
          style={[
            styles.dot,
            isLarge && styles.dotLarge,
            { backgroundColor: tone === "good" ? theme.green : tone === "bad" ? theme.red : theme.muted },
          ]}
        />
      )}
      <Text
        style={[
          styles.label,
          isLarge && styles.labelLarge,
          { color: tone === "good" ? theme.green : tone === "bad" ? theme.red : theme.muted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
  },
  pillLarge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLarge: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  label: {
    fontFamily: FONTS.extraBold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelLarge: {
    fontSize: 14,
  },
});
