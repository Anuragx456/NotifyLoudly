import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/components/ThemeProvider";

SplashScreen.preventAutoHideAsync();

// NOTE: Manrope wiring (FONTS in theme.ts) is in place across all screens.
// To activate it, run: bun add expo-font @expo-google-fonts/manrope
// then restore the useFonts block below. Until then we use system fonts
// so Metro bundles without the missing package.
export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Stack
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
