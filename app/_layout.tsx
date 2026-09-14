import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { ThemeProvider } from "@/components/ThemeProvider";
import {
  hasCompletedOnboarding,
  hasSeenDisclosure,
} from "@/store/onboarding";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // Play policy: prominent disclosure + consent must precede every permission
  // prompt. Resolve the disclosure gate before first render so the tab bar
  // never flashes before a forced redirect — the Stack mounts exactly once
  // with the correct initial route. Disclosure seen (Continue tapped) or
  // onboarding done both count as consented; only a fresh install with neither
  // starts on /disclosure.
  const [gateResolved, setGateResolved] = useState(false);
  const [needsDisclosure, setNeedsDisclosure] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([hasSeenDisclosure(), hasCompletedOnboarding()]).then(
      ([seen, done]) => {
        if (!live) return;
        setNeedsDisclosure(!seen && !done);
        setGateResolved(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (fontError) {
      // Fall back to system fonts — never crash on a font load failure.
      console.warn("[fonts] Manrope failed to load, using system fallback:", fontError);
    }
    if ((fontsLoaded || fontError) && gateResolved) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, gateResolved]);

  // Keep splash visible until fonts resolve (or fail) AND the disclosure gate
  // resolves — avoids both a FOUT flash and a tab-bar flash before redirect.
  if ((!fontsLoaded && !fontError) || !gateResolved) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Stack
          initialRouteName={needsDisclosure ? "disclosure" : "(tabs)"}
          screenOptions={{
            headerShown: false,
            animation: "fade",
            animationDuration: 120,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="reliability" />
          <Stack.Screen name="disclosure" />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
