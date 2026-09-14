// theme.ts — NotifyLoudly light + dark worlds
// Product truth: merchant's counter phone, noisy shop, glanceable from a distance.
// Light = day-lit counter, paper+ink clarity. Dark = evening shop / AMOLED thrift.
// Every color resolves through the semantic roles below — no raw hex escapes to screens.

export type AppTheme = {
  // Surfaces — the stage. paper is the viewport ground, card is raised content, raised is a second elevation.
  paper: string;
  card: string;
  raised: string;
  line: string;
  lineStrong: string;
  // Foreground hierarchy — ink > muted > faint. All tuned for ≥4.5:1 on their home surface.
  ink: string;
  muted: string;
  faint: string;
  onInk: string;
  // Semantic — green is "listening / allowed / money in", red is "not listening / danger".
  green: string;
  red: string;
  amber: string;
  successBg: string;
  errorBg: string;
  warningBg: string;
  dangerBorder: string;
  dangerBg: string;
  // Accent — the one warm, owned color for primary actions in both worlds.
  accent: string;
  onAccent: string;
  accentSoft: string;
  // Chrome — nav, status bar, snackbar — share the same dark-on-dark identity.
  navBg: string;
  navBorder: string;
  statusBar: "light" | "dark";
};

export const COLORS: AppTheme = {
  // Light — warm paper, deep charcoal ink, restrained neutrals, amber accent
  paper: "#F7F5F0",
  card: "#FFFFFF",
  raised: "#FFFFFF",
  line: "#E7E2D8",
  lineStrong: "#D8D2C4",
  ink: "#1A1A18",
  muted: "#6B675E",
  faint: "#8A8580",
  onInk: "#FFFFFF",
  green: "#1B7A3D",
  red: "#B3261E",
  amber: "#B7791F",
  successBg: "#E6F4EA",
  errorBg: "#FCE8E8",
  warningBg: "#FFF3E0",
  dangerBorder: "#E8CFCF",
  dangerBg: "#FFF9F9",
  accent: "#1A1A18",
  onAccent: "#FFFFFF",
  accentSoft: "#EDE9E2",
  navBg: "#FFFFFF",
  navBorder: "#E7E2D8",
  statusBar: "dark",
};

export const DARK_COLORS: AppTheme = {
  // Dark — deep graphite ground, warm off-white ink, desaturated neutrals so green/red stay true
  paper: "#121412",
  card: "#1E201E",
  raised: "#262826",
  line: "#2E302D",
  lineStrong: "#3A3C39",
  ink: "#EDE9E2",
  muted: "#A8A39B",
  faint: "#C2BDB5",
  onInk: "#121412",
  green: "#4ADE80",
  red: "#F87171",
  amber: "#FBBF24",
  successBg: "#14291B",
  errorBg: "#2E1515",
  warningBg: "#2A2414",
  dangerBorder: "#4A2A2A",
  dangerBg: "#1E1515",
  accent: "#EDE9E2",
  onAccent: "#121412",
  accentSoft: "#2E2C29",
  navBg: "#181A18",
  navBorder: "#2E302D",
  statusBar: "light",
};

// Back-compat re-export for screens that imported COLORS directly for non-theme uses (e.g. snackbar ink).
// Prefer useThemeColors() at call sites; this stays as a light-world literal for isolated elements.
export { COLORS as LIGHT_COLORS };

import { useAppTheme } from "./ThemeProvider";

/** Preferred hook — returns the resolved AppTheme (light or dark) for the user's chosen mode. */
export function useThemeColors(): AppTheme {
  return useAppTheme().theme;
}

/** Convenience for dark/light comparisons that used to compare theme.paper === COLORS.paper. */
export function isDarkTheme(theme: AppTheme): boolean {
  return theme.statusBar === "light";
}

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// Manrope — the single app typeface, loaded in app/_layout.tsx via expo-font.
// Each weight is a separate family in @expo-google-fonts/manrope, so TYPE pairs
// every weight with its matching family (avoids Android fake-bold synthesis).
export const FONTS = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semiBold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extraBold: "Manrope_800ExtraBold",
} as const;

export const TYPE = {
  displayLarge: { fontFamily: FONTS.extraBold, fontSize: 56, fontWeight: "800" as const, letterSpacing: -1.2, lineHeight: 56 },
  displayMedium: { fontFamily: FONTS.extraBold, fontSize: 40, fontWeight: "800" as const, letterSpacing: -0.8, lineHeight: 42 },
  headlineLarge: { fontFamily: FONTS.extraBold, fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.4, lineHeight: 36 },
  headlineMedium: { fontFamily: FONTS.extraBold, fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.2, lineHeight: 28 },
  titleLarge: { fontFamily: FONTS.bold, fontSize: 20, fontWeight: "700" as const, lineHeight: 24 },
  titleMedium: { fontFamily: FONTS.bold, fontSize: 16, fontWeight: "700" as const, lineHeight: 20 },
  bodyLarge: { fontFamily: FONTS.regular, fontSize: 16, fontWeight: "400" as const, lineHeight: 24 },
  bodyMedium: { fontFamily: FONTS.regular, fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  labelLarge: { fontFamily: FONTS.bold, fontSize: 15, fontWeight: "700" as const, letterSpacing: 0.2, lineHeight: 20 },
  labelSmall: { fontFamily: FONTS.bold, fontSize: 12, fontWeight: "700" as const, letterSpacing: 1.2, lineHeight: 16 },
  amountHero: { fontFamily: FONTS.extraBold, fontSize: 56, fontWeight: "800" as const, letterSpacing: -1.5, lineHeight: 56 },
} as const;
