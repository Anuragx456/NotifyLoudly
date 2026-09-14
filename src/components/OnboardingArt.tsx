import type { ComponentProps } from "react";
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FONTS, RADIUS, useThemeColors } from "./theme";

// GuideIllustration — placeholder art for onboarding + setup steps.
//
// Swap path for real screenshots: drop the capture at
// `assets/images/onboarding/<slug>.png` and pass it as `image`.
// Layout (aspect box, radius, caption) stays unchanged — only the
// inner content switches from placeholder glyph to screenshot.
type Props = {
  step: number;
  icon: ComponentProps<typeof Ionicons>["name"];
  caption: string;
  image?: ImageSourcePropType;
};

export function GuideIllustration({ step, icon, caption, image }: Props) {
  const theme = useThemeColors();
  return (
    <View
      style={[styles.frame, { borderColor: theme.line, backgroundColor: theme.card }]}
      accessibilityRole="image"
      accessibilityLabel={`Step ${step}: ${caption}`}
    >
      {image ? (
        <Image source={image} style={styles.shot} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.step, { color: theme.muted }]}>{step}</Text>
          <Ionicons name={icon} size={44} color={theme.ink} style={styles.icon} />
        </View>
      )}
      <Text style={[styles.caption, { color: theme.muted }]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  placeholder: {
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  },
  shot: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  step: {
    fontFamily: FONTS.extraBold,
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1,
  },
  icon: {
    marginTop: 8,
  },
  caption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    fontWeight: "600",
  },
});
