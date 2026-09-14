import { Link, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONTS, RADIUS } from "./theme";
import { useAppTheme } from "./ThemeProvider";

const TABS = [
  { href: "/" as const, label: "Home", icon: "home" as const, iconOutline: "home-outline" as const },
  { href: "/history" as const, label: "History", icon: "time" as const, iconOutline: "time-outline" as const },
  { href: "/diagnostics" as const, label: "Diagnostics", icon: "pulse" as const, iconOutline: "pulse-outline" as const },
  { href: "/settings" as const, label: "Settings", icon: "settings" as const, iconOutline: "settings-outline" as const },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.navBg,
          borderTopColor: theme.navBorder,
          paddingBottom: Math.max(12, insets.bottom + 8),
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={StyleSheet.flatten([
                styles.tab,
                active && { backgroundColor: theme.accentSoft },
              ])}
            >
              <Ionicons
                name={active ? tab.icon : tab.iconOutline}
                size={22}
                color={active ? theme.ink : theme.muted}
                style={styles.icon}
              />
              <Text
                style={StyleSheet.flatten([
                  styles.label,
                  { color: active ? theme.ink : theme.muted },
                  active && styles.labelActive,
                ])}
              >
                {tab.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    gap: 3,
    paddingVertical: 6,
  },
  icon: {
    marginBottom: 1,
  },
  label: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  labelActive: {
    fontFamily: FONTS.extraBold,
    fontWeight: "800",
  },
});
