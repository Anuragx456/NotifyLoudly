import { ConfigPlugin, withGradleProperties } from "@expo/config-plugins";

// Permanent 20-30MB single-arch fix: survives `expo prebuild --clean`.
// Keep in sync with android/gradle.properties edits below.
const withAppSize: ConfigPlugin = (config) => {
  return withGradleProperties(config, (config) => {
    const props = config.modResults as any[];
    const upsert = (key: string, value: string) => {
      const idx = props.findIndex((p: any) => p.type === "property" && p.key === key);
      if (idx >= 0) props[idx].value = value;
      else props.push({ type: "property", key, value } as any);
    };
    upsert("reactNativeArchitectures", "arm64-v8a");
    upsert("android.enableMinifyInReleaseBuilds", "true");
    upsert("android.enableShrinkResourcesInReleaseBuilds", "true");
    upsert("android.enablePngCrunchInReleaseBuilds", "true");
    upsert("android.enableBundleCompression", "true");
    upsert("expo.useLegacyPackaging", "true");
    upsert("hermesEnabled", "true");
    upsert("expo.gif.enabled", "false");
    upsert("expo.webp.enabled", "false");
    return config;
  });
};

export default withAppSize;
