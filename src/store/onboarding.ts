import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@notifyloudly:onboarding-v1";

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "done";
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    // Best effort — a missed write just re-shows onboarding once.
  }
}
