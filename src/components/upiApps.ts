export interface UpiAppInfo {
  packageName: string;
  name: string;
  isMerchant?: boolean;
}

export const UPI_APPS: UpiAppInfo[] = [
  { packageName: "com.google.android.apps.nbu.paisa.user", name: "Google Pay" },
  { packageName: "com.google.android.apps.nbu.paisa.merchant", name: "Google Pay Business", isMerchant: true },
  { packageName: "com.phonepe.app", name: "PhonePe" },
  { packageName: "com.phonepe.app.business", name: "PhonePe Business", isMerchant: true },
  { packageName: "net.one97.paytm", name: "Paytm" },
  { packageName: "net.one97.paytm.merchant", name: "Paytm Business", isMerchant: true },
  { packageName: "com.paytmbusiness", name: "Paytm Business", isMerchant: true },
  { packageName: "in.org.npci.upiapp", name: "BHIM" },
  { packageName: "com.naviapp", name: "Navi" },
  { packageName: "com.navi.services", name: "Navi" },
  { packageName: "com.navi.upi", name: "Navi" },
  { packageName: "com.dreamplug.androidapp", name: "CRED" },
  { packageName: "in.amazon.mShop.android.shopping", name: "Amazon Pay" },
  { packageName: "tech.superpay.app", name: "Super.money" },
  { packageName: "com.supermoney.app", name: "Super.money" },
  { packageName: "com.sbi.upi", name: "BHIM SBI Pay" },
  { packageName: "com.csam.icici.bank.imobile", name: "iMobile Pay" },
  { packageName: "com.msf.kbank.mobile", name: "Kotak" },
  { packageName: "com.upi.axispay", name: "Axis Pay" },
  { packageName: "com.hdfcbank.payzapp", name: "PayZapp" },
  { packageName: "com.canarabank.mobility", name: "Canara ai1" },
  { packageName: "com.bankofbaroda.upi", name: "Baroda Pay" },
  { packageName: "com.bankofbaroda.mconnect", name: "bob World" },
];

export const FRIENDLY_NAMES: Record<string, string> = Object.fromEntries(
  UPI_APPS.map((app) => [app.packageName, app.name]),
);

export function friendlyAppName(packageName: string): string {
  return FRIENDLY_NAMES[packageName] ?? packageName;
}
