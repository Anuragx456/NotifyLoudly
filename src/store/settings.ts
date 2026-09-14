import {
  DEFAULT_UPI_PACKAGES,
  getAllowlistedPackages,
  getDuckingEnabled,
  getLocaleTag,
  getMuted,
  getOverlayEnabled,
  getSpeechRate,
} from "upi-listener";

export interface AnnouncerSettings {
  speechRate: number;
  localeTag: string;
  availableLocales: string[];
  duckingEnabled: boolean;
  muted: boolean;
  overlayEnabled: boolean;
  allowlistedPackages: string[];
}

export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2.0;

export const SUPPORTED_LOCALE_TAGS = ["en-IN", "hi-IN"] as const;
export type SupportedLocaleTag = (typeof SUPPORTED_LOCALE_TAGS)[number];

export function normalizeLocaleTag(tag: string): SupportedLocaleTag {
  return (SUPPORTED_LOCALE_TAGS as readonly string[]).includes(tag) ? (tag as SupportedLocaleTag) : "en-IN";
}

export function getTestSpeechText(localeTag: string): string {
  if (localeTag.toLowerCase().startsWith("hi")) {
    return "100 रुपये प्राप्त हुए। परीक्षण घोषणा।";
  }
  return "Received 100 rupees. Test announcement.";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadSettings(): AnnouncerSettings {
  return {
    speechRate: safe(() => getSpeechRate(), 1.0),
    localeTag: normalizeLocaleTag(safe(() => getLocaleTag(), "en-IN")),
    availableLocales: [...SUPPORTED_LOCALE_TAGS],
    duckingEnabled: safe(() => getDuckingEnabled(), true),
    muted: safe(() => getMuted(), false),
    overlayEnabled: safe(() => getOverlayEnabled(), true),
    allowlistedPackages: safe(() => getAllowlistedPackages(), [...DEFAULT_UPI_PACKAGES]),
  };
}

export function clampSpeechRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1.0;
  return Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, Math.round(rate * 10) / 10));
}
