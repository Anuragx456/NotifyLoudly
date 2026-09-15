import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
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
import {
  addListenerHealthListener,
  checkListenerHealth,
  ensureHealthCheckScheduled,
  isNativeModuleAvailable,
} from "upi-listener";
import { pruneListeningEpisodes, recordListeningHealth } from "@/db/listening";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
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

  // Foreground health check: computes the tri-state listener health
  // (connected / disconnected-recoverable / access-revoked) and re-arms the
  // periodic self-heal. Runs on mount and every return to foreground — the
  // worker only runs ~every 15min, so this is what catches a revoke promptly.
  // checkListenerHealth also emits onListenerHealthChanged on change (for
  // downstream consumers); the synchronous return drives the redirect below.
  // Pre-consent safe: on a fresh install the grant is absent, the scheduler
  // refuses via its ever-granted latch, and the redirect is skipped so the
  // disclosure → onboarding funnel stays untouched.
  // Listening history (Phase 4): every health observation lands here as an
  // open/closed episode transition — foreground runs, AppState foreground
  // events, and onListenerHealthChanged pushes from bind flips / the worker.
  // Pre-consent reads are skipped so a fresh install doesn't bank a spurious
  // "revoked since install" episode; prune keeps the table to 30 days.
  const recordEpisode = useCallback((status: string) => {
    Promise.all([hasSeenDisclosure(), hasCompletedOnboarding()]).then(
      ([seen, done]) => {
        if (!seen && !done) return;
        try {
          recordListeningHealth(status);
          pruneListeningEpisodes();
        } catch {
          // History is best effort — never break the health loop on a db error.
        }
      },
    );
  }, []);

  useEffect(() => {
    const run = () => {
      // Expo Go has no native module — checkListenerHealth would report a
      // phantom "disconnected" on every foreground. Skip recording there.
      if (!isNativeModuleAvailable()) {
        return;
      }
      const health = checkListenerHealth();
      recordEpisode(health.status);
      if (health.status === "access-revoked") {
        Promise.all([hasSeenDisclosure(), hasCompletedOnboarding()]).then(
          ([seen, done]) => {
            if (seen || done) router.replace("/onboarding");
          },
        );
      }
      // Always re-arm: idempotent (KEEP), refused pre-grant, and kept
      // post-revoke so the worker keeps reporting the revoked state.
      ensureHealthCheckScheduled();
    };
    run();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    let healthSub: { remove: () => void } | null = null;
    try {
      healthSub = addListenerHealthListener((event) => {
        recordEpisode(event.status);
      });
    } catch {
      healthSub = null;
    }
    return () => {
      appSub.remove();
      try {
        healthSub?.remove();
      } catch {
        // Tear-down is best effort.
      }
    };
  }, [router, recordEpisode]);

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
