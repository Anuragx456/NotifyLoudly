import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@notifyloudly:onboarding-v1";
// Set when the user taps Continue on /disclosure (explicit consent to the
// prominent disclosure). Distinct from onboarding completion (Finish setup):
// reaching /onboarding implies disclosure was seen, so permission buttons on
// /onboarding must stay usable before onboarding completes.
const DISCLOSURE_KEY = "@notifyloudly:disclosure-v1";

export async function hasSeenDisclosure(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISCLOSURE_KEY)) === "seen";
  } catch {
    return false;
  }
}

export async function setDisclosureSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCLOSURE_KEY, "seen");
  } catch {
    // Best effort — a missed write just re-shows disclosure once.
  }
}

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

// Test/support helper: reset the disclosure gate (fresh-install equivalent
// for verifying the disclosure → onboarding → grant flow).
export async function clearOnboarding(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ONBOARDING_KEY, DISCLOSURE_KEY]);
  } catch {
    // Best effort.
  }
}
