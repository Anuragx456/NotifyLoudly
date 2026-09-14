import { ConfigPlugin, withAppBuildGradle } from "@expo/config-plugins";

// Durable release-signing wiring: survives `expo prebuild --clean`.
// Release credentials come from MYAPP_UPLOAD_* project properties — supply via
// android/gradle.properties (gitignored), ORG_GRADLE_PROJECT_MYAPP_UPLOAD_*
// env vars, or -P flags. See docs/RELEASE_SIGNING.md.
//
// When the properties are absent the release block stays empty so
// assembleRelease/bundleRelease hard-fails instead of silently shipping a
// debug-signed artifact (which Play Protect flags and Play Console rejects).
const withReleaseSigning: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    let contents: string = config.modResults.contents;

    // 1. Inject signingConfigs.release after the prebuild-default debug block.
    // Idempotent: skip once the MYAPP_UPLOAD_* markers are present.
    if (!contents.includes("MYAPP_UPLOAD_STORE_FILE")) {
      const debugSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
      const releaseSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }`;
      if (contents.includes(debugSigningBlock)) {
        contents = contents.replace(debugSigningBlock, releaseSigningBlock);
      }
    }

    // 2. Point buildTypes.release at signingConfigs.release (prebuild
    // default is signingConfigs.debug). Scoped to the release block so the
    // debug build type keeps its debug key. Idempotent.
    const releaseTypeDebug = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
    const releaseTypeRelease = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`;
    if (contents.includes(releaseTypeDebug)) {
      contents = contents.replace(releaseTypeDebug, releaseTypeRelease);
    }

    config.modResults.contents = contents;
    return config;
  });
};

export default withReleaseSigning;
