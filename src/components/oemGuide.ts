export interface OemGuide {
  brand: string;
  match: string[];
  title: string;
  steps: string[];
}

export const OEM_GUIDES: OemGuide[] = [
  {
    brand: "Xiaomi / Redmi / Poco",
    match: ["xiaomi", "redmi", "poco"],
    title: "Autostart ON + No restrictions + Lock in Recents",
    steps: [
      "Autostart: Settings → Apps → Manage apps → NotifyLoudly → Autostart → ON. (Alt: Security app → Autostart → ON.)",
      "Battery: Settings → Apps → Manage apps → NotifyLoudly → Battery saver → No restrictions.",
      "Recents lock: tap Recents (□) → long-press the NotifyLoudly card → tap 🔒 Lock. A lock icon must stay on the card — without it, swiping kills the listener.",
      "Verify: swipe other apps away, leave NotifyLoudly locked, wait 10 min — Diagnostics → Listener still reads Bound.",
    ],
  },
  {
    brand: "Oppo / Realme",
    match: ["oppo", "realme"],
    title: "Auto-start ON + Background running + Lock in Recents",
    steps: [
      "Auto-start: Settings → Apps → Autostart → NotifyLoudly → ON. (Older ColorOS: Settings → App management → Auto-start management → allow NotifyLoudly.)",
      "Battery: Settings → Apps → NotifyLoudly → Battery usage → Allow background activity → ON. (Alt: Settings → Battery → App battery management → NotifyLoudly → Allow background running.)",
      "Recents lock: tap Recents (□) → tap ⋮ on the NotifyLoudly card → Lock. (On some builds: pull the card down until 🔒 appears.)",
      "Verify: swipe NotifyLoudly in Recents — the locked card must stay. Reopen → Diagnostics reads Bound.",
    ],
  },
  {
    brand: "Vivo / iQOO",
    match: ["vivo", "iqoo"],
    title: "Autostart ON + Background power + Lock in Recents",
    steps: [
      "Autostart: Settings → Apps → Special app access → Autostart → NotifyLoudly → ON. (Alt: iManager → App manager → Autostart manager → allow NotifyLoudly.)",
      "Battery: Settings → Battery → Background power consumption management → NotifyLoudly → Allow.",
      "Recents lock: tap Recents (□) → pull the NotifyLoudly card down until 🔒 Lock appears.",
      "Verify: clear all other recent apps — NotifyLoudly must survive. Reopen → Diagnostics reads Bound.",
    ],
  },
  {
    brand: "Samsung",
    match: ["samsung"],
    title: "Never sleeping + Unrestricted + Keep open",
    steps: [
      "Never sleeping: Settings → Battery → Background usage limits → Never sleeping apps → ＋ → add NotifyLoudly.",
      "Battery: Settings → Apps → NotifyLoudly → Battery → Unrestricted.",
      "Recents: tap Recents (|||) → tap the NotifyLoudly icon → Keep open. Swiping it away must not close it.",
      "Verify: Device care → Battery → Background usage limits must NOT list NotifyLoudly under Sleeping or Deep sleeping.",
    ],
  },
  {
    brand: "Other / stock Android",
    match: [],
    title: "Keep the app unrestricted",
    steps: [
      "Open Settings → Apps → NotifyLoudly → Battery → Unrestricted.",
      "Keep notification access granted — revoking it stops all announcements.",
      "After a reboot, open NotifyLoudly once so the listener re-binds.",
    ],
  },
];
