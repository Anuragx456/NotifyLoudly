import type { ImperativeRouter } from "expo-router";
import { hasCompletedOnboarding, hasSeenDisclosure } from "@/store/onboarding";

// Play policy: prominent in-app disclosure + consent must come BEFORE any
// system permission prompt. Every screen that calls an open*/request*
// permission API must await this first and abort when it returns false.
//
// Consent = tapping Continue on /disclosure (recorded by setDisclosureSeen).
// Onboarding completion implies disclosure was seen, so the gate passes on
// /onboarding's own grant buttons too — the redirect only fires when disclosure
// was never consented to (Diagnostics/Settings/Reliability deep-links or stale
// routes before consent).
export async function ensureDisclosureOrRedirect(router: ImperativeRouter): Promise<boolean> {
  let seen = false;
  try {
    seen = (await hasSeenDisclosure()) || (await hasCompletedOnboarding());
  } catch {
    seen = false;
  }
  if (seen) return true;
  router.replace("/disclosure");
  return false;
}
