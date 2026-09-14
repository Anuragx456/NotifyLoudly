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
    title: "Allow autostart and lock in recents",
    steps: [
      "Open Settings → Apps → Manage apps → NotifyLoudly → Autostart, and switch it on.",
      "Open Settings → Battery → App battery saver → NotifyLoudly → No restrictions.",
      "Open Recents, pull down on NotifyLoudly, and tap the lock so swiping it away does not kill it.",
    ],
  },
  {
    brand: "Oppo / Realme",
    match: ["oppo", "realme"],
    title: "Allow startup and background running",
    steps: [
      "Open Settings → App management → Auto-start management, and allow NotifyLoudly.",
      "Open Settings → Battery → App battery management → NotifyLoudly → Allow background running.",
      "In Phone Manager → Privacy permissions → Startup manager, allow NotifyLoudly.",
    ],
  },
  {
    brand: "Vivo / iQOO",
    match: ["vivo", "iqoo"],
    title: "Allow background startup",
    steps: [
      "Open Settings → Apps → Special app access → Autostart, and allow NotifyLoudly.",
      "Open Settings → Battery → Background power consumption management → NotifyLoudly → Allow.",
      "Open iManager → App manager → Autostart manager, and allow NotifyLoudly.",
    ],
  },
  {
    brand: "Samsung",
    match: ["samsung"],
    title: "Exempt from battery optimization",
    steps: [
      "Open Settings → Battery → Background usage limits → Never sleeping apps, and add NotifyLoudly.",
      "Open Settings → Apps → NotifyLoudly → Battery → Unrestricted.",
      "Device care → Battery → Background usage limits must not list NotifyLoudly as sleeping or deep sleeping.",
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
