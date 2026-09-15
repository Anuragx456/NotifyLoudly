import { requireNativeModule, type EventSubscription } from "expo-modules-core";

export interface UpiNotification {
  packageName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  tickerText: string;
  postedAt: number;
  notificationId: number;
  key: string;
}

export interface ListenerConnectionEvent {
  connected: boolean;
}

export type ListenerHealthStatus = "connected" | "disconnected" | "access-revoked";

export interface ListenerHealth {
  status: ListenerHealthStatus;
  accessGranted: boolean;
  connected: boolean;
}

export interface ListenerHealthEvent {
  status: string;
  accessGranted: boolean;
  connected: boolean;
}

export interface AnnouncementEvent {
  text: string;
  latencyMs: number;
  postedAt: number;
  source: string;
  amountPaise: number;
  sender: string;
  appName: string;
  sourcePackage: string;
  muted: boolean;
}

export interface LastAnnouncement {
  text: string;
  latencyMs: number;
  atWallMs: number;
  source?: string;
  amountPaise: number;
  sender: string;
  appName: string;
  sourcePackage: string;
  muted: boolean;
}

export interface ListenerHeartbeat {
  connected: boolean;
  lastCallbackAtMs: number;
  nowMs: number;
}

export interface AlertHealth {
  notificationsEnabled: boolean;
  channelImportance: number;
  channelBlocked: boolean;
}

export interface SelfTestResult {
  spoken: boolean;
  text?: string;
  reason?: string;
  parseMs: number;
}

export interface InstalledUpiApp {
  packageName: string;
  appName: string;
  isMerchant: boolean;
}

export const DEFAULT_UPI_PACKAGES: string[] = [
  "com.google.android.apps.nbu.paisa.user",
  "com.google.android.apps.nbu.paisa.merchant",
  "com.phonepe.app",
  "com.phonepe.app.business",
  "net.one97.paytm",
  "net.one97.paytm.merchant",
  "com.paytmbusiness",
  "in.org.npci.upiapp",
  "com.naviapp",
  "com.navi.services",
  "com.navi.upi",
  "com.dreamplug.androidapp",
  "in.amazon.mShop.android.shopping",
  "tech.superpay.app",
  "com.supermoney.app",
  "com.sbi.upi",
  "com.csam.icici.bank.imobile",
  "com.msf.kbank.mobile",
  "com.upi.axispay",
  "com.hdfcbank.payzapp",
  "com.canarabank.mobility",
  "com.bankofbaroda.upi",
  "com.bankofbaroda.mconnect",
];

type UpiListenerEvents = {
  onUpiNotification: (event: UpiNotification) => void;
  onListenerConnectionChanged: (event: ListenerConnectionEvent) => void;
  onAnnouncement: (event: AnnouncementEvent) => void;
  onListenerHealthChanged: (event: ListenerHealthEvent) => void;
};

interface UpiListenerNativeModule {
  getThemeMode(): string;
  setThemeMode(mode: string): boolean;
  startTtsService(): boolean;
  stopTtsService(): boolean;
  isTtsServiceRunning(): boolean;
  isTtsReady(): boolean;
  speakTest(text: string): boolean;
  runPipelineSelfTest(): SelfTestResult;
  getLastAnnouncement(): LastAnnouncement | null;
  isNotificationAccessEnabled(): boolean;
  isListenerConnected(): boolean;
  getListenerHealth(): ListenerHealth;
  checkListenerHealth(): ListenerHealth;
  openNotificationAccessSettings(): boolean;
  ensureHealthCheckScheduled(): boolean;
  cancelHealthCheck(): boolean;
  getAllowlistedPackages(): string[];
  setAllowlistedPackages(packages: string[]): boolean;
  getPendingNotifications(): UpiNotification[];
  seedDedupKey(key: string, seenAt: number): boolean;
  getSpeechRate(): number;
  setSpeechRate(rate: number): boolean;
  getLocaleTag(): string;
  setLocaleTag(tag: string): boolean;
  getDuckingEnabled(): boolean;
  setDuckingEnabled(enabled: boolean): boolean;
  getMuted(): boolean;
  setMuted(muted: boolean): boolean;
  getOverlayEnabled(): boolean;
  setOverlayEnabled(enabled: boolean): boolean;
  isOverlayAccessGranted(): boolean;
  openOverlayAccessSettings(): boolean;
  areAlertNotificationsEnabled(): boolean;
  getAlertHealth(): AlertHealth;
  requestAlertNotifications(): boolean;
  showTestAlert(): boolean;
  dismissPaymentAlert(): boolean;
  getAvailableLocales(): string[];
  getListenerHeartbeat(): ListenerHeartbeat;
  isIgnoringBatteryOptimizations(): boolean;
  openBatteryExemptionRequest(): boolean;
  openOemAutostartSettings(): boolean;
  openAppDetailsSettings(): boolean;
  detectInstalledUpiApps(): InstalledUpiApp[];
}

let cachedNativeModule: UpiListenerNativeModule | null | undefined;
let warnedMissing = false;

function getNativeModule(): UpiListenerNativeModule | null {
  if (cachedNativeModule !== undefined) {
    return cachedNativeModule;
  }
  try {
    cachedNativeModule = requireNativeModule<UpiListenerNativeModule>("UpiListener");
  } catch {
    cachedNativeModule = null;
  }
  if (cachedNativeModule === null && !warnedMissing) {
    warnedMissing = true;
    console.warn(
      "[upi-listener] native module 'UpiListener' not found. " +
        "Run a local dev build (`bun run android`), not Expo Go — " +
        "custom native code is unavailable there. UI runs in degraded mode.",
    );
  }
  return cachedNativeModule;
}

export function isNativeModuleAvailable(): boolean {
  return getNativeModule() !== null;
}

interface UpiListenerEmitter {
  addListener<EventName extends keyof UpiListenerEvents>(
    eventName: EventName,
    listener: UpiListenerEvents[EventName],
  ): EventSubscription;
}

function noopSubscription(): EventSubscription {
  return { remove() {} } as EventSubscription;
}

function getEmitter(): UpiListenerEmitter | null {
  const native = getNativeModule();
  if (!native) return null;
  return native as unknown as UpiListenerEmitter;
}

export function isNotificationAccessEnabled(): boolean {
  return getNativeModule()?.isNotificationAccessEnabled() ?? false;
}

export function isListenerConnected(): boolean {
  return getNativeModule()?.isListenerConnected() ?? false;
}

function normalizeHealth(raw: unknown): ListenerHealth {
  const r = (raw ?? {}) as Partial<ListenerHealth>;
  const status: ListenerHealthStatus =
    r.status === "connected" || r.status === "access-revoked" ? r.status : "disconnected";
  return {
    status,
    accessGranted: r.accessGranted === true,
    connected: r.connected === true,
  };
}

export function getListenerHealth(): ListenerHealth {
  try {
    return normalizeHealth(getNativeModule()?.getListenerHealth());
  } catch {
    return { status: "disconnected", accessGranted: false, connected: false };
  }
}

export function checkListenerHealth(): ListenerHealth {
  try {
    return normalizeHealth(
      (getNativeModule() as unknown as { checkListenerHealth?: () => unknown } | null)?.checkListenerHealth?.(),
    );
  } catch {
    return { status: "disconnected", accessGranted: false, connected: false };
  }
}

export function addListenerHealthListener(
  listener: (event: ListenerHealthEvent) => void,
): EventSubscription {
  return getEmitter()?.addListener("onListenerHealthChanged", listener) ?? noopSubscription();
}

export function requestListenerRebind(): boolean {
  try {
    const m = (getNativeModule() as unknown as { requestListenerRebind?: () => boolean } | null);
    return m?.requestListenerRebind?.() ?? false;
  } catch {
    return false;
  }
}

export function openNotificationAccessSettings(): boolean {
  return getNativeModule()?.openNotificationAccessSettings() ?? false;
}

export function ensureHealthCheckScheduled(): boolean {
  try {
    return getNativeModule()?.ensureHealthCheckScheduled() ?? false;
  } catch {
    return false;
  }
}

export function cancelHealthCheck(): boolean {
  try {
    return getNativeModule()?.cancelHealthCheck() ?? false;
  } catch {
    return false;
  }
}

export function getAllowlistedPackages(): string[] {
  return getNativeModule()?.getAllowlistedPackages() ?? [...DEFAULT_UPI_PACKAGES];
}

export function setAllowlistedPackages(packages: string[]): boolean {
  return getNativeModule()?.setAllowlistedPackages(packages) ?? false;
}

export function getPendingNotifications(): UpiNotification[] {
  return getNativeModule()?.getPendingNotifications() ?? [];
}

export function seedNativeDedupKey(key: string, seenAt: number): boolean {
  try {
    return getNativeModule()?.seedDedupKey(key, seenAt) ?? false;
  } catch {
    return false;
  }
}

export function addUpiNotificationListener(
  listener: (event: UpiNotification) => void,
): EventSubscription {
  return getEmitter()?.addListener("onUpiNotification", listener) ?? noopSubscription();
}

export function addListenerConnectionListener(
  listener: (event: ListenerConnectionEvent) => void,
): EventSubscription {
  return getEmitter()?.addListener("onListenerConnectionChanged", listener) ?? noopSubscription();
}

export function startTtsService(): boolean {
  return getNativeModule()?.startTtsService() ?? false;
}

export function stopTtsService(): boolean {
  return getNativeModule()?.stopTtsService() ?? false;
}

export function isTtsServiceRunning(): boolean {
  return getNativeModule()?.isTtsServiceRunning() ?? false;
}

export function isTtsReady(): boolean {
  return getNativeModule()?.isTtsReady() ?? false;
}

export function speakTest(text: string): boolean {
  return getNativeModule()?.speakTest(text) ?? false;
}

export function runPipelineSelfTest(): SelfTestResult {
  return (
    getNativeModule()?.runPipelineSelfTest() ?? {
      spoken: false,
      reason: "native-module-missing",
      parseMs: 0,
    }
  );
}

export function getLastAnnouncement(): LastAnnouncement | null {
  return getNativeModule()?.getLastAnnouncement() ?? null;
}

export function addAnnouncementListener(
  listener: (event: AnnouncementEvent) => void,
): EventSubscription {
  return getEmitter()?.addListener("onAnnouncement", listener) ?? noopSubscription();
}

export function getSpeechRate(): number {
  return getNativeModule()?.getSpeechRate() ?? 1.0;
}

export function setSpeechRate(rate: number): boolean {
  return getNativeModule()?.setSpeechRate(rate) ?? false;
}

export function getLocaleTag(): string {
  return getNativeModule()?.getLocaleTag() ?? "en-IN";
}

export function setLocaleTag(tag: string): boolean {
  return getNativeModule()?.setLocaleTag(tag) ?? false;
}

export function getDuckingEnabled(): boolean {
  return getNativeModule()?.getDuckingEnabled() ?? true;
}

export function setDuckingEnabled(enabled: boolean): boolean {
  return getNativeModule()?.setDuckingEnabled(enabled) ?? false;
}

export function getMuted(): boolean {
  return getNativeModule()?.getMuted() ?? false;
}

export function setMuted(muted: boolean): boolean {
  return getNativeModule()?.setMuted(muted) ?? false;
}

export function getOverlayEnabled(): boolean {
  try {
    return getNativeModule()?.getOverlayEnabled() ?? true;
  } catch {
    return true;
  }
}

export function setOverlayEnabled(enabled: boolean): boolean {
  try {
    return getNativeModule()?.setOverlayEnabled(enabled) ?? false;
  } catch {
    return false;
  }
}

export function isOverlayAccessGranted(): boolean {
  try {
    return getNativeModule()?.isOverlayAccessGranted() ?? false;
  } catch {
    return false;
  }
}

export function openOverlayAccessSettings(): boolean {
  try {
    return getNativeModule()?.openOverlayAccessSettings() ?? false;
  } catch {
    return false;
  }
}

export function areAlertNotificationsEnabled(): boolean {
  try {
    return getNativeModule()?.areAlertNotificationsEnabled() ?? false;
  } catch {
    return false;
  }
}

export function getAlertHealth(): AlertHealth | null {
  try {
    return getNativeModule()?.getAlertHealth() ?? null;
  } catch {
    return null;
  }
}

export function requestAlertNotifications(): boolean {
  try {
    return getNativeModule()?.requestAlertNotifications() ?? false;
  } catch {
    return false;
  }
}

export function showTestAlert(): boolean {
  try {
    return getNativeModule()?.showTestAlert() ?? false;
  } catch {
    return false;
  }
}

export function dismissPaymentAlert(): boolean {
  try {
    return getNativeModule()?.dismissPaymentAlert() ?? false;
  } catch {
    return false;
  }
}

export function getAvailableLocales(): string[] {
  return getNativeModule()?.getAvailableLocales() ?? ["en-IN"];
}

export function getListenerHeartbeat(): ListenerHeartbeat {
  return (
    getNativeModule()?.getListenerHeartbeat() ?? {
      connected: false,
      lastCallbackAtMs: 0,
      nowMs: Date.now(),
    }
  );
}

export function isIgnoringBatteryOptimizations(): boolean {
  try {
    return getNativeModule()?.isIgnoringBatteryOptimizations() ?? false;
  } catch {
    return false;
  }
}

export function openBatteryExemptionRequest(): boolean {
  try {
    return getNativeModule()?.openBatteryExemptionRequest() ?? false;
  } catch {
    return false;
  }
}

export function openOemAutostartSettings(): boolean {
  try {
    return getNativeModule()?.openOemAutostartSettings() ?? false;
  } catch {
    return false;
  }
}

export function openAppDetailsSettings(): boolean {
  try {
    return getNativeModule()?.openAppDetailsSettings() ?? false;
  } catch {
    return false;
  }
}

export type ThemeMode = "light" | "dark" | "system";

export function getThemeMode(): ThemeMode {
  try {
    const raw = (getNativeModule() as unknown as { getThemeMode?: () => string } | null)?.getThemeMode?.();
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "system";
}

export function setThemeMode(mode: ThemeMode): boolean {
  try {
    const m = (getNativeModule() as unknown as { setThemeMode?: (v: string) => boolean } | null)?.setThemeMode?.(mode);
    if (typeof m === "boolean") return m;
  } catch {}
  return false;
}

export function detectInstalledUpiApps(): InstalledUpiApp[] {
  try {
    return getNativeModule()?.detectInstalledUpiApps() ?? [];
  } catch {
    return [];
  }
}
