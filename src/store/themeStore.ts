import { getThemeMode as nativeGet, setThemeMode as nativeSet, type ThemeMode } from "upi-listener";

export type ThemeChoice = ThemeMode; // "light" | "dark" | "system"

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"] as const;

export function normalizeThemeMode(raw: string | null | undefined): ThemeChoice {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadThemeMode(): ThemeChoice {
  return normalizeThemeMode(safe(() => nativeGet(), "system"));
}

export function saveThemeMode(next: ThemeChoice): boolean {
  const mode = normalizeThemeMode(next);
  return safe(() => nativeSet(mode), false);
}
