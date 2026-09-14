import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import { COLORS, DARK_COLORS, type AppTheme } from "./theme";
import { loadThemeMode, normalizeThemeMode, saveThemeMode, type ThemeChoice } from "@/store/themeStore";

type ResolvedScheme = "light" | "dark";

function resolveScheme(choice: ThemeChoice, system: ColorSchemeName): ResolvedScheme {
  if (choice === "light" || choice === "dark") return choice;
  return system === "dark" ? "dark" : "light";
}

type ThemeContextValue = {
  themeMode: ThemeChoice;
  resolvedScheme: ResolvedScheme;
  theme: AppTheme;
  setThemeMode: (next: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: "system",
  resolvedScheme: "light",
  theme: COLORS,
  setThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(() => Appearance.getColorScheme() ?? "light");
  const [themeMode, setThemeModeState] = useState<ThemeChoice>(() => loadThemeMode());

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  // Seed from native right after mount — ensures first-frame follows persisted choice even if module was unavailable earlier.
  useEffect(() => {
    const seeded = loadThemeMode();
    if (seeded !== themeMode) setThemeModeState(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedScheme = useMemo(() => resolveScheme(themeMode, systemScheme), [themeMode, systemScheme]);
  const theme = resolvedScheme === "dark" ? DARK_COLORS : COLORS;

  const setThemeMode = useCallback((next: ThemeChoice) => {
    const normalized = normalizeThemeMode(next);
    setThemeModeState(normalized);
    const saved = saveThemeMode(normalized);
    if (!saved) {
      // Persistence is best-effort (Expo Go); in-memory choice still wins for this session.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeMode, resolvedScheme, theme, setThemeMode }),
    [themeMode, resolvedScheme, theme, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
